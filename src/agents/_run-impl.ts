import { Agent } from './agent';
import { AgentOutputSchema } from './agent-outputs';
import { AsyncComputer, Computer } from './computer';
import { AgentsException, ModelBehaviorError, UserError } from './exceptions';
import { InputGuardrail, InputGuardrailResult, OutputGuardrail, OutputGuardrailResult } from './guardrails';
import { Handoff, HandoffInputData } from './handoffs';
import {
  HandoffCallItem,
  HandoffOutputItem,
  ItemHelpers,
  MessageOutputItem,
  ModelResponse,
  ReasoningItem,
  RunItem,
  ToolCallItem,
  ToolCallOutputItem,
  TResponseInputItem,
} from './items';
import { RunHooks } from './lifecycle';
import { logger } from './logger';
import { ModelSettings } from './models/model-settings';
import { ModelTracing } from './models/interface';
import { RunConfig } from './run';
import { RunContextWrapper } from './run-context';
import { AgentUpdatedStreamEvent, RunItemStreamEvent, StreamEvent, ToolsToFinalOutputResult } from './stream-events';
import { ComputerTool, FunctionTool, FunctionToolResult, Tool, WebSearchTool, FileSearchTool } from './tools';
import { SpanError, Trace, functionSpan, getCurrentTrace, guardrailSpan, handoffSpan, trace } from './tracing';
import { attachErrorToCurrentSpan } from './utils';

import {
  ResponseComputerToolCall,
  ResponseFileSearchToolCall,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseOutputMessage,
  ResponseReasoningItem,
  ResponseInputItem,
} from 'openai/resources/responses/responses';

type ComputerCallOutput = ResponseInputItem.ComputerCallOutput;

import {
  ActionClick,
  ActionDoubleClick,
  ActionDrag,
  ActionKeypress,
  ActionMove,
  ActionScreenshot,
  ActionScroll,
  ActionType,
  ActionWait,
  PendingSafetyCheck,
} from './response-computer-tool-call';
import { z } from 'zod';

// Helper constants and types
const NOT_FINAL_OUTPUT: ToolsToFinalOutputResult = {
  isFinalOutput: false,
  finalOutput: null,
};

export class QueueCompleteSentinel {}
export const QUEUE_COMPLETE_SENTINEL = new QueueCompleteSentinel();

// Utility function to replace Python's asyncio.noop_coroutine
async function noopCoroutine(): Promise<void> {
  return;
}

/**
 * Represents a handoff tool run
 */
export class ToolRunHandoff {
  constructor(public handoff: Handoff<any>, public toolCall: ResponseFunctionToolCall) {}
}

/**
 * Represents a function tool run
 */
export class ToolRunFunction {
  constructor(public toolCall: ResponseFunctionToolCall, public functionTool: FunctionTool) {}
}

/**
 * Represents a computer action tool run
 */
export class ToolRunComputerAction {
  constructor(public toolCall: ResponseComputerToolCall, public computerTool: ComputerTool) {}
}

/**
 * Result of processing a model response
 */
export class ProcessedResponse {
  constructor(
    public newItems: RunItem[],
    public handoffs: ToolRunHandoff[],
    public functions: ToolRunFunction[],
    public computerActions: ToolRunComputerAction[],
    public toolsUsed: string[]
  ) {}

  /**
   * Check if there are tools that need to be run
   */
  hasToolsToRun(): boolean {
    return this.handoffs.length > 0 || this.functions.length > 0 || this.computerActions.length > 0;
  }
}

/**
 * Represents a handoff to a new agent
 */
export class NextStepHandoff {
  constructor(public newAgent: Agent<any>) {}
}

/**
 * Represents a final output
 */
export class NextStepFinalOutput {
  constructor(public output: any) {
    this.output = output;
  }
}

/**
 * Represents running the agent again
 */
export class NextStepRunAgain {}

/**
 * Result of a single step in the agent run
 */
export class SingleStepResult {
  constructor(
    /**
     * The input items i.e. the items before run() was called. May be mutated by handoff input filters.
     */
    public originalInput: string | TResponseInputItem[],

    /**
     * The model response for the current step.
     */
    public modelResponse: ModelResponse,

    /**
     * Items generated before the current step.
     */
    public preStepItems: RunItem[],

    /**
     * Items generated during this current step.
     */
    public newStepItems: RunItem[],

    /**
     * The next step to take.
     */
    public nextStep: NextStepHandoff | NextStepFinalOutput | NextStepRunAgain
  ) {}

  /**
   * Items generated during the agent run (i.e. everything generated after `originalInput`).
   */
  get generatedItems(): RunItem[] {
    return [...this.preStepItems, ...this.newStepItems];
  }
}

/**
 * Get the model tracing implementation based on configuration
 */
export function getModelTracingImpl(tracingDisabled: boolean, traceIncludeSensitiveData: boolean): ModelTracing {
  if (tracingDisabled) {
    return ModelTracing.DISABLED;
  } else if (traceIncludeSensitiveData) {
    return ModelTracing.ENABLED;
  } else {
    return ModelTracing.ENABLED_WITHOUT_DATA;
  }
}

/**
 * Tracks tool usage by agents
 */
export class AgentToolUseTracker {
  agentToTools: Array<[Agent<any>, string[]]> = [];

  /**
   * Add tool usage for an agent
   */
  addToolUse(agent: Agent<any>, toolNames: string[]): void {
    const existingData = this.agentToTools.find(item => item[0] === agent);
    if (existingData) {
      existingData[1].push(...toolNames);
    } else {
      this.agentToTools.push([agent, toolNames]);
    }
  }

  /**
   * Check if an agent has used any tools
   */
  hasUsedTools(agent: Agent<any>): boolean {
    const existingData = this.agentToTools.find(item => item[0] === agent);
    return existingData !== undefined && existingData[1].length > 0;
  }
}

/**
 * Implementation of the agent run logic
 */
export class RunImpl {
  /**
   * Execute tools and side effects for a single step
   */
  static async executeToolsAndSideEffects<TContext>({
    agent,
    allTools,
    originalInput,
    preStepItems,
    newResponse,
    processedResponse,
    outputSchema,
    hooks,
    contextWrapper,
    runConfig,
    toolUseTracker,
  }: {
    agent: Agent<TContext>;
    allTools: Tool[];
    originalInput: string | TResponseInputItem[];
    preStepItems: RunItem[];
    newResponse: ModelResponse;
    processedResponse: ProcessedResponse;
    outputSchema: AgentOutputSchema | null;
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    runConfig: RunConfig;
    toolUseTracker: AgentToolUseTracker;
  }): Promise<SingleStepResult> {
    // Make a copy of the generated items
    preStepItems = [...preStepItems];

    const newStepItems: RunItem[] = [...processedResponse.newItems];

    // First, let's run the tool calls - function tools and computer actions
    const [functionResults, computerResults] = await Promise.all([
      this.executeFunctionToolCalls({
        agent,
        toolRuns: processedResponse.functions,
        hooks,
        contextWrapper,
        config: runConfig,
      }),
      this.executeComputerActions({
        agent,
        actions: processedResponse.computerActions,
        hooks,
        contextWrapper,
        config: runConfig,
      }),
    ]);

    newStepItems.push(...functionResults.map(result => result.run_item));
    newStepItems.push(...computerResults);

    // Second, check if there are any handoffs
    if (processedResponse.handoffs.length > 0) {
      return await this.executeHandoffs({
        agent,
        originalInput,
        preStepItems,
        newStepItems,
        newResponse,
        runHandoffs: processedResponse.handoffs,
        hooks,
        contextWrapper,
        runConfig,
      });
    }

    // Third, we'll check if the tool use should result in a final output
    const checkToolUse = await this.checkForFinalOutputFromTools({
      agent,
      toolResults: functionResults,
      contextWrapper,
      config: runConfig,
    });

    if (checkToolUse.isFinalOutput) {
      // If the output type is string, then let's just stringify it
      if (!agent.output_type || agent.output_type === String) {
        checkToolUse.finalOutput = String(checkToolUse.finalOutput);
      }

      if (checkToolUse.finalOutput === null) {
        logger.error(
          'Model returned a final output of null. Not raising an error because we assume ' +
            "you know what you're doing."
        );
      }

      return await this.executeFinalOutput({
        agent,
        originalInput,
        newResponse,
        preStepItems,
        newStepItems,
        finalOutput: checkToolUse.finalOutput,
        hooks,
        contextWrapper,
      });
    }

    // Now we can check if the model also produced a final output
    const messageItems = newStepItems.filter(item => item instanceof MessageOutputItem);

    // We'll use the last content output as the final output
    const potentialFinalOutputText =
      messageItems.length > 0 ? ItemHelpers.extractLastText(messageItems[messageItems.length - 1].raw_item) : null;

    // There are two possibilities that lead to a final output:
    // 1. Structured output schema => always leads to a final output
    // 2. Plain text output schema => only leads to a final output if there are no tool calls
    if (outputSchema && !outputSchema.isPlainText() && potentialFinalOutputText) {
      const finalOutput = outputSchema.validateJson(potentialFinalOutputText);
      return await this.executeFinalOutput({
        agent,
        originalInput,
        newResponse,
        preStepItems,
        newStepItems,
        finalOutput,
        hooks,
        contextWrapper,
      });
    } else if ((!outputSchema || outputSchema.isPlainText()) && !processedResponse.hasToolsToRun()) {
      return await this.executeFinalOutput({
        agent,
        originalInput,
        newResponse,
        preStepItems,
        newStepItems,
        finalOutput: potentialFinalOutputText || '',
        hooks,
        contextWrapper,
      });
    } else {
      // If there's no final output, we can just run again
      return new SingleStepResult(originalInput, newResponse, preStepItems, newStepItems, new NextStepRunAgain());
    }
  }

  /**
   * Maybe reset tool choice based on agent configuration and tool usage
   */
  static maybeResetToolChoice(
    agent: Agent<any>,
    toolUseTracker: AgentToolUseTracker,
    modelSettings: ModelSettings
  ): ModelSettings {
    if (agent.reset_tool_choice === true && toolUseTracker.hasUsedTools(agent)) {
      return modelSettings.resolve();
    }

    return modelSettings;
  }

  /**
   * Process a model response into items, handoffs, functions, and computer actions
   */
  static processModelResponse({
    agent,
    allTools,
    response,
    outputSchema,
    handoffs,
  }: {
    agent: Agent<any>;
    allTools: Tool[];
    response: ModelResponse;
    outputSchema: AgentOutputSchema | null;
    handoffs: Handoff<any>[];
  }): ProcessedResponse {
    const items: RunItem[] = [];

    const runHandoffs: ToolRunHandoff[] = [];
    const functions: ToolRunFunction[] = [];
    const computerActions: ToolRunComputerAction[] = [];
    const toolsUsed: string[] = [];

    const handoffMap = new Map(handoffs.map(h => [h.toolName, h]));
    const functionMap = new Map(
      allTools.filter((tool): tool is FunctionTool => tool instanceof FunctionTool).map(tool => [tool.name, tool])
    );
    const computerTool = allTools.find((tool): tool is ComputerTool => tool instanceof ComputerTool);

    let x = 0;
    for (const output of response.output) {
      if (this.isResponseOutputMessage(output)) {
        items.push(new MessageOutputItem(agent, output));
      } else if (this.isResponseFileSearchToolCall(output)) {
        items.push(new ToolCallItem(agent, output));
        toolsUsed.push('file_search');
      } else if (this.isResponseFunctionWebSearch(output)) {
        items.push(new ToolCallItem(agent, output));
        toolsUsed.push('web_search');
      } else if (this.isResponseReasoningItem(output)) {
        items.push(new ReasoningItem(agent, output));
      } else if (this.isResponseComputerToolCall(output)) {
        items.push(new ToolCallItem(agent, output));
        toolsUsed.push('computer_use');

        if (!computerTool) {
          attachErrorToCurrentSpan(
            new SpanError({
              message: 'Computer tool not found',
              data: {},
            })
          );
          throw new ModelBehaviorError('Model produced computer action without a computer tool.');
        }

        computerActions.push(new ToolRunComputerAction(output, computerTool));
      } else if (!this.isResponseFunctionToolCall(output)) {
        logger.warning(`Unexpected output type, ignoring: ${typeof output}`);
        continue;
      }

      // At this point we know it's a function tool call
      if (!this.isResponseFunctionToolCall(output)) {
        continue;
      }

      toolsUsed.push(output.name);

      // Handoffs
      if (handoffMap.has(output.name)) {
        items.push(new HandoffCallItem(agent, output));
        const handoff = new ToolRunHandoff(handoffMap.get(output.name)!, output);
        runHandoffs.push(handoff);
      } else {
        // Regular function tool call
        if (!functionMap.has(output.name)) {
          attachErrorToCurrentSpan(
            new SpanError({
              message: 'Tool not found',
              data: { toolName: output.name },
            })
          );
          throw new ModelBehaviorError(`Tool ${output.name} not found in agent ${agent.name}`);
        }
        items.push(new ToolCallItem(agent, output));
        functions.push(new ToolRunFunction(output, functionMap.get(output.name)!));
      }
    }

    return new ProcessedResponse(items, runHandoffs, functions, computerActions, toolsUsed);
  }

  /**
   * Execute function tool calls
   */
  static async executeFunctionToolCalls<TContext>({
    agent,
    toolRuns,
    hooks,
    contextWrapper,
    config,
  }: {
    agent: Agent<TContext>;
    toolRuns: ToolRunFunction[];
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    config: RunConfig;
  }): Promise<FunctionToolResult[]> {
    async function runSingleTool(funcTool: FunctionTool, toolCall: ResponseFunctionToolCall): Promise<any> {
      const spanFn = functionSpan(funcTool.name);

      if (config.traceIncludeSensitiveData) {
        spanFn.spanData.input = toolCall.arguments;
      }

      try {
        spanFn.start(true);

        await Promise.all([
          hooks.onToolStart(contextWrapper, agent, funcTool),
          agent.hooks ? agent.hooks.onToolStart(contextWrapper, agent, funcTool) : noopCoroutine(),
        ]);

        const result = await funcTool.on_invoke_tool({
          context: contextWrapper,
          input: toolCall.arguments,
        });

        await Promise.all([
          hooks.onToolEnd(contextWrapper, agent, funcTool, result),
          agent.hooks ? agent.hooks.onToolEnd(contextWrapper, agent, funcTool, result) : noopCoroutine(),
        ]);

        if (config.traceIncludeSensitiveData) {
          spanFn.spanData.output = result;
        }

        spanFn.finish(true);
        return result;
      } catch (error) {
        spanFn.setError(
          new SpanError({
            message: 'Error running tool',
            data: { tool_name: funcTool.name, error: String(error) },
          })
        );
        spanFn.finish(true);

        if (error instanceof AgentsException) {
          throw error;
        }
        throw new UserError(`Error running tool ${funcTool.name}: ${error}`);
      }
    }

    const tasks = toolRuns.map(toolRun => runSingleTool(toolRun.functionTool, toolRun.toolCall));
    const results = await Promise.all(tasks);
    return toolRuns.map((toolRun, index) => {
      const result = results[index];
      const output = typeof result === 'object' ? JSON.stringify(result) : String(result);
      return new FunctionToolResult({
        tool: toolRun.functionTool,
        output: result,
        run_item: new ToolCallOutputItem(agent, ItemHelpers.toolCallOutputItem(toolRun.toolCall, output), result),
      });
    });
  }

  /**
   * Execute computer actions
   */
  static async executeComputerActions<TContext>({
    agent,
    actions,
    hooks,
    contextWrapper,
    config,
  }: {
    agent: Agent<TContext>;
    actions: ToolRunComputerAction[];
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    config: RunConfig;
  }): Promise<RunItem[]> {
    const results: RunItem[] = [];
    // Need to run these serially, because each action can affect the computer state
    for (const action of actions) {
      results.push(
        await ComputerAction.execute({
          agent,
          action,
          hooks,
          contextWrapper,
          config,
        })
      );
    }

    return results;
  }

  /**
   * Execute handoffs
   */
  static async executeHandoffs<TContext>({
    agent,
    originalInput,
    preStepItems,
    newStepItems,
    newResponse,
    runHandoffs,
    hooks,
    contextWrapper,
    runConfig,
  }: {
    agent: Agent<TContext>;
    originalInput: string | TResponseInputItem[];
    preStepItems: RunItem[];
    newStepItems: RunItem[];
    newResponse: ModelResponse;
    runHandoffs: ToolRunHandoff[];
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    runConfig: RunConfig;
  }): Promise<SingleStepResult> {
    // If there is more than one handoff, add tool responses that reject those handoffs
    const multipleHandoffs = runHandoffs.length > 1;
    if (multipleHandoffs) {
      const outputMessage = 'Multiple handoffs detected, ignoring this one.';
      newStepItems.push(
        ...runHandoffs
          .slice(1)
          .map(
            handoff =>
              new ToolCallOutputItem(
                agent,
                ItemHelpers.toolCallOutputItem(handoff.toolCall, outputMessage),
                outputMessage
              )
          )
      );
    }

    const actualHandoff = runHandoffs[0];
    const spanHandoff = handoffSpan(agent.name);

    try {
      spanHandoff.start(true);

      const handoff = actualHandoff.handoff;
      const newAgent: Agent<any> = await handoff.onInvokeHandoff(contextWrapper, actualHandoff.toolCall.arguments);

      spanHandoff.spanData.toAgent = newAgent.name;

      if (multipleHandoffs) {
        const requestedAgents = runHandoffs.map(handoff => handoff.handoff.agentName);
        spanHandoff.setError(
          new SpanError({
            message: 'Multiple handoffs requested',
            data: { requestedAgents },
          })
        );
      }

      // Append a tool output item for the handoff
      newStepItems.push(
        new HandoffOutputItem(
          agent,
          ItemHelpers.toolCallOutputItem(actualHandoff.toolCall, handoff.getTransferMessage(newAgent)),
          agent,
          newAgent
        )
      );

      // Execute handoff hooks
      await Promise.all([
        hooks.onHandoff(contextWrapper, agent, newAgent),
        agent.hooks ? agent.hooks.onHandoff(contextWrapper, newAgent, agent) : noopCoroutine(),
      ]);

      // If there's an input filter, filter the input for the next agent
      const inputFilter = handoff.inputFilter || (runConfig ? runConfig.handoffInputFilter : null);

      if (inputFilter) {
        logger.debug('Filtering inputs for handoff');

        const handoffInputData = new HandoffInputData(
          Array.isArray(originalInput) ? originalInput : originalInput,
          preStepItems,
          newStepItems
        );

        if (typeof inputFilter !== 'function') {
          spanHandoff.setError(
            new SpanError({
              message: 'Invalid input filter',
              data: { details: 'not callable()' },
            })
          );
          throw new UserError(`Invalid input filter: ${inputFilter}`);
        }

        const filtered = inputFilter(handoffInputData);

        if (!(filtered instanceof HandoffInputData)) {
          spanHandoff.setError(
            new SpanError({
              message: 'Invalid input filter result',
              data: { details: 'not a HandoffInputData' },
            })
          );
          throw new UserError(`Invalid input filter result: ${filtered}`);
        }

        originalInput =
          typeof filtered.inputHistory === 'string' ? filtered.inputHistory : Array.from(filtered.inputHistory);

        preStepItems = Array.from(filtered.preHandoffItems);
        newStepItems = Array.from(filtered.newItems);
      }

      spanHandoff.finish(true);

      return new SingleStepResult(
        originalInput,
        newResponse,
        preStepItems,
        newStepItems,
        new NextStepHandoff(newAgent)
      );
    } catch (error) {
      spanHandoff.setError(
        new SpanError({
          message: 'Error during handoff',
          data: { error: String(error) },
        })
      );
      spanHandoff.finish(true);
      throw error;
    }
  }

  /**
   * Execute final output
   */
  static async executeFinalOutput<TContext>({
    agent,
    originalInput,
    newResponse,
    preStepItems,
    newStepItems,
    finalOutput,
    hooks,
    contextWrapper,
  }: {
    agent: Agent<TContext>;
    originalInput: string | TResponseInputItem[];
    newResponse: ModelResponse;
    preStepItems: RunItem[];
    newStepItems: RunItem[];
    finalOutput: any;
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
  }): Promise<SingleStepResult> {
    // Run the on_end hooks
    await this.runFinalOutputHooks(agent, hooks, contextWrapper, finalOutput);

    return new SingleStepResult(
      originalInput,
      newResponse,
      preStepItems,
      newStepItems,
      new NextStepFinalOutput(finalOutput)
    );
  }

  /**
   * Run final output hooks
   */
  static async runFinalOutputHooks<TContext>(
    agent: Agent<TContext>,
    hooks: RunHooks<TContext>,
    contextWrapper: RunContextWrapper<TContext>,
    finalOutput: any
  ): Promise<void> {
    await Promise.all([
      hooks.onAgentEnd(contextWrapper, agent, finalOutput),
      agent.hooks ? agent.hooks.onEnd(contextWrapper, agent, finalOutput) : noopCoroutine(),
    ]);
  }

  /**
   * Run a single input guardrail
   */
  static async runSingleInputGuardrail<TContext>(
    agent: Agent<any>,
    guardrail: InputGuardrail<TContext>,
    input: string | TResponseInputItem[],
    context: RunContextWrapper<TContext>
  ): Promise<InputGuardrailResult> {
    const spanGuardrail = guardrailSpan(guardrail.get_name());

    try {
      spanGuardrail.start(true);
      const result = await guardrail.run(agent, input, context);
      spanGuardrail.spanData.triggered = result.output.tripwire_triggered;
      spanGuardrail.finish(true);
      return result;
    } catch (error) {
      spanGuardrail.setError(
        new SpanError({
          message: 'Error running input guardrail',
          data: { error: String(error) },
        })
      );
      spanGuardrail.finish(true);
      throw error;
    }
  }

  /**
   * Run a single output guardrail
   */
  static async runSingleOutputGuardrail<TContext>(
    guardrail: OutputGuardrail<TContext>,
    agent: Agent<any>,
    agentOutput: any,
    context: RunContextWrapper<TContext>
  ): Promise<OutputGuardrailResult> {
    const spanGuardrail = guardrailSpan(guardrail.get_name());

    try {
      spanGuardrail.start(true);
      const result = await guardrail.run(context, agent, agentOutput);
      spanGuardrail.spanData.triggered = result.output.tripwire_triggered;
      spanGuardrail.finish(true);
      return result;
    } catch (error) {
      spanGuardrail.setError(
        new SpanError({
          message: 'Error running output guardrail',
          data: { error: String(error) },
        })
      );
      spanGuardrail.finish(true);
      throw error;
    }
  }

  /**
   * Stream step result to queue
   */
  static streamStepResultToQueue(
    stepResult: SingleStepResult,
    queue: any // AsyncQueue<StreamEvent | QueueCompleteSentinel>
  ): void {
    for (const item of stepResult.newStepItems) {
      let event: RunItemStreamEvent | null = null;

      if (item instanceof MessageOutputItem) {
        event = new RunItemStreamEvent('message_output_created', item);
      } else if (item instanceof HandoffCallItem) {
        event = new RunItemStreamEvent('handoff_requested', item);
      } else if (item instanceof HandoffOutputItem) {
        event = new RunItemStreamEvent('handoff_occured', item);
      } else if (item instanceof ToolCallItem) {
        event = new RunItemStreamEvent('tool_called', item);
      } else if (item instanceof ToolCallOutputItem) {
        event = new RunItemStreamEvent('tool_output', item);
      } else if (item instanceof ReasoningItem) {
        event = new RunItemStreamEvent('reasoning_item_created', item);
      } else {
        logger.warning(`Unexpected item type: ${item}`);
        event = null;
      }

      if (event) {
        queue.put_nowait(event);
      }
    }
  }

  /**
   * Check for final output from tools
   */
  static async checkForFinalOutputFromTools<TContext>({
    agent,
    toolResults,
    contextWrapper,
    config,
  }: {
    agent: Agent<TContext>;
    toolResults: FunctionToolResult[];
    contextWrapper: RunContextWrapper<TContext>;
    config: RunConfig;
  }): Promise<ToolsToFinalOutputResult> {
    if (!toolResults.length) {
      return NOT_FINAL_OUTPUT;
    }

    if (agent.tool_use_behavior === 'run_llm_again') {
      return NOT_FINAL_OUTPUT;
    } else if (agent.tool_use_behavior === 'stop_on_first_tool') {
      return {
        isFinalOutput: true,
        finalOutput: toolResults[0].output,
      };
    } else if (typeof agent.tool_use_behavior === 'object' && agent.tool_use_behavior !== null) {
      const names = agent.tool_use_behavior.stop_at_tool_names || [];
      for (const toolResult of toolResults) {
        if (names.includes(toolResult.tool.name)) {
          return {
            isFinalOutput: true,
            finalOutput: toolResult.output,
          };
        }
      }
      return {
        isFinalOutput: false,
        finalOutput: null,
      };
    } else if (typeof agent.tool_use_behavior === 'function') {
      // Check if it's an async function by looking for a then method
      const result = agent.tool_use_behavior(contextWrapper, toolResults);
      if (result instanceof Promise) {
        return await result;
      } else {
        return result;
      }
    }

    logger.error(`Invalid tool_use_behavior: ${agent.tool_use_behavior}`);
    throw new UserError(`Invalid tool_use_behavior: ${agent.tool_use_behavior}`);
  }

  // Type guards for response types
  private static isResponseOutputMessage(output: any): output is ResponseOutputMessage {
    try {
      const schema: z.ZodType<ResponseOutputMessage> = z.object({
        id: z.string(),
        content: z.array(z.any()), // Array of ResponseOutputText | ResponseOutputRefusal
        role: z.literal('assistant'),
        status: z.enum(['in_progress', 'completed', 'incomplete']),
        type: z.literal('message'),
      });
      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }

  private static isResponseFileSearchToolCall(output: any): output is ResponseFileSearchToolCall {
    try {
      const schema: z.ZodType<ResponseFileSearchToolCall> = z.object({
        id: z.string(),
        queries: z.array(z.string()),
        status: z.enum(['in_progress', 'searching', 'completed', 'incomplete', 'failed']),
        type: z.literal('file_search_call'),
        results: z.array(z.any()).nullable().optional(),
      });
      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }

  private static isResponseFunctionWebSearch(output: any): output is ResponseFunctionWebSearch {
    try {
      const schema: z.ZodType<ResponseFunctionWebSearch> = z.object({
        id: z.string(),
        status: z.enum(['in_progress', 'searching', 'completed', 'failed']),
        type: z.literal('web_search_call'),
      });

      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }

  private static isResponseReasoningItem(output: any): output is ResponseReasoningItem {
    try {
      const schema: z.ZodType<ResponseReasoningItem> = z.object({
        id: z.string(),
        summary: z.array(
          z.object({
            text: z.string(),
            type: z.literal('summary_text'),
          })
        ),
        type: z.literal('reasoning'),
        status: z.enum(['in_progress', 'completed', 'incomplete']).optional(),
      });

      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }

  private static isResponseComputerToolCall(output: any): output is ResponseComputerToolCall {
    try {
      const schema: z.ZodType<ResponseComputerToolCall> = z.object({
        id: z.string(),
        type: z.literal('computer_call'),
        call_id: z.string(),
        action: z.union([
          z.object({
            type: z.literal('click'),
            button: z.enum(['left', 'right', 'wheel', 'back', 'forward']),
            x: z.number(),
            y: z.number(),
          }),
          z.object({
            type: z.literal('double_click'),
            x: z.number(),
            y: z.number(),
          }),
          z.object({
            type: z.literal('drag'),
            path: z.array(
              z.object({
                x: z.number(),
                y: z.number(),
              })
            ),
          }),
          z.object({
            type: z.literal('keypress'),
            keys: z.array(z.string()),
          }),
          z.object({
            type: z.literal('move'),
            x: z.number(),
            y: z.number(),
          }),
          z.object({
            type: z.literal('screenshot'),
          }),
          z.object({
            type: z.literal('scroll'),
            scroll_x: z.number(),
            scroll_y: z.number(),
            x: z.number(),
            y: z.number(),
          }),
          z.object({
            type: z.literal('type'),
            text: z.string(),
          }),
          z.object({
            type: z.literal('wait'),
          }),
        ]),
        status: z.enum(['in_progress', 'completed', 'incomplete']),
        pending_safety_checks: z.array(
          z.object({
            id: z.string(),
            code: z.string(),
            message: z.string(),
          }) as z.ZodType<PendingSafetyCheck>
        ),
      });
      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }

  private static isResponseFunctionToolCall(output: any): output is ResponseFunctionToolCall {
    try {
      const schema: z.ZodType<ResponseFunctionToolCall> = z.object({
        arguments: z.string(),
        call_id: z.string(),
        name: z.string(),
        type: z.literal('function_call'),
        id: z.string().optional(),
        status: z.enum(['in_progress', 'completed', 'incomplete']).optional(),
      });
      schema.parse(output);
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Creates a trace only if there is no current trace, and manages the trace lifecycle.
 */
export class TraceCtxManager {
  private trace: Trace | null = null;

  constructor(
    private workflowName: string,
    private traceId: string | null,
    private groupId: string | null,
    private metadata: Record<string, any> | null,
    private disabled: boolean
  ) {}

  enter(): TraceCtxManager {
    const currentTrace = getCurrentTrace();
    if (!currentTrace) {
      this.trace = trace(this.workflowName, this.traceId, this.groupId, this.metadata, this.disabled);
      this.trace.start(true);
    }

    return this;
  }

  exit(): void {
    if (this.trace) {
      this.trace.finish(true);
    }
  }
}

/**
 * Helper class for computer actions
 */
export class ComputerAction {
  /**
   * Execute a computer action
   */
  static async execute<TContext>({
    agent,
    action,
    hooks,
    contextWrapper,
    config,
  }: {
    agent: Agent<TContext>;
    action: ToolRunComputerAction;
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    config: RunConfig;
  }): Promise<RunItem> {
    const outputFunc =
      action.computerTool.computer instanceof AsyncComputer
        ? this.getScreenshotAsync(action.computerTool.computer, action.toolCall)
        : this.getScreenshotSync(action.computerTool.computer, action.toolCall);

    await Promise.all([
      hooks.onToolStart(contextWrapper, agent, action.computerTool),
      agent.hooks ? agent.hooks.onToolStart(contextWrapper, agent, action.computerTool) : noopCoroutine(),
    ]);

    const output = await outputFunc;

    await Promise.all([
      hooks.onToolEnd(contextWrapper, agent, action.computerTool, output),
      agent.hooks ? agent.hooks.onToolEnd(contextWrapper, agent, action.computerTool, output) : noopCoroutine(),
    ]);

    // TODO: don't send a screenshot every single time, use references
    const imageUrl = `data:image/png;base64,${output}`;
    return new ToolCallOutputItem(
      agent,
      {
        type: 'computer_call_output',
        call_id: action.toolCall.call_id,
        output: {
          type: 'computer_screenshot',
          image_url: imageUrl,
        },
      },
      imageUrl
    );
  }

  /**
   * Get screenshot from sync computer
   */
  static async getScreenshotSync(computer: Computer, toolCall: ResponseComputerToolCall): Promise<string> {
    const action = toolCall.action;

    if (this.isActionClick(action)) {
      computer.click(action.x, action.y, action.button);
    } else if (this.isActionDoubleClick(action)) {
      computer.doubleClick(action.x, action.y);
    } else if (this.isActionDrag(action)) {
      computer.drag(action.path.map(p => [p.x, p.y]));
    } else if (this.isActionKeypress(action)) {
      computer.keypress(action.keys);
    } else if (this.isActionMove(action)) {
      computer.move(action.x, action.y);
    } else if (this.isActionScreenshot(action)) {
      computer.screenshot();
    } else if (this.isActionScroll(action)) {
      computer.scroll(action.x, action.y, action.scroll_x, action.scroll_y);
    } else if (this.isActionType(action)) {
      computer.type(action.text);
    } else if (this.isActionWait(action)) {
      computer.wait();
    }

    return computer.screenshot();
  }

  /**
   * Get screenshot from async computer
   */
  static async getScreenshotAsync(computer: AsyncComputer, toolCall: ResponseComputerToolCall): Promise<string> {
    const action = toolCall.action;

    if (this.isActionClick(action)) {
      await computer.click(action.x, action.y, action.button);
    } else if (this.isActionDoubleClick(action)) {
      await computer.doubleClick(action.x, action.y);
    } else if (this.isActionDrag(action)) {
      await computer.drag(action.path.map(p => [p.x, p.y]));
    } else if (this.isActionKeypress(action)) {
      await computer.keypress(action.keys);
    } else if (this.isActionMove(action)) {
      await computer.move(action.x, action.y);
    } else if (this.isActionScreenshot(action)) {
      await computer.screenshot();
    } else if (this.isActionScroll(action)) {
      await computer.scroll(action.x, action.y, action.scroll_x, action.scroll_y);
    } else if (this.isActionType(action)) {
      await computer.type(action.text);
    } else if (this.isActionWait(action)) {
      await computer.wait();
    }

    return await computer.screenshot();
  }

  // Type guards for computer actions
  private static isActionClick(action: any): action is ActionClick {
    return action && action.type === 'click';
  }

  private static isActionDoubleClick(action: any): action is ActionDoubleClick {
    return action && action.type === 'doubleClick';
  }

  private static isActionDrag(action: any): action is ActionDrag {
    return action && action.type === 'drag';
  }

  private static isActionKeypress(action: any): action is ActionKeypress {
    return action && action.type === 'keypress';
  }

  private static isActionMove(action: any): action is ActionMove {
    return action && action.type === 'move';
  }

  private static isActionScreenshot(action: any): action is ActionScreenshot {
    return action && action.type === 'screenshot';
  }

  private static isActionScroll(action: any): action is ActionScroll {
    return action && action.type === 'scroll';
  }

  private static isActionType(action: any): action is ActionType {
    return action && action.type === 'type';
  }

  private static isActionWait(action: any): action is ActionWait {
    return action && action.type === 'wait';
  }
}
