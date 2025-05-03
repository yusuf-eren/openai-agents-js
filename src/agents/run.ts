import * as fs from 'fs';
import { Agent } from './agent';
import { AgentOutputSchema } from './agent-outputs';
import {
  AgentsException,
  InputGuardrailTripwireTriggered,
  MaxTurnsExceeded,
  ModelBehaviorError,
  OutputGuardrailTripwireTriggered,
} from './exceptions';
import {
  InputGuardrail,
  InputGuardrailResult,
  OutputGuardrail,
  OutputGuardrailResult,
} from './guardrails';
import { Handoff, HandoffInputFilter, handoff } from './handoffs';
import {
  ItemHelpers,
  ModelResponse,
  RunItem,
  TResponseInputItem,
} from './items';
import { RunHooks } from './lifecycle';
import { logger } from './logger';
import { ModelSettings } from './models/model-settings';
import { Model, ModelProvider } from './models/interface';
type ModelStreamEvent = any; // Placeholder type for model stream events
import { RunResult, RunResultStreaming } from './result';
import { RunContextWrapper } from './run-context';
import {
  AgentTextDeltaStreamEvent,
  AgentUpdatedStreamEvent,
  RawResponsesStreamEvent,
  StreamEvent,
} from './stream-events';
import { Tool } from './tools';
import { Span, SpanError, agentSpan, getCurrentTrace, trace } from './tracing';
import { AgentSpanData } from './tracing/span-data';
import { noopCoroutine } from './utils';
import {
  AgentToolUseTracker,
  getModelTracingImpl,
  NextStepFinalOutput,
  NextStepHandoff,
  NextStepRunAgain,
  RunImpl,
  SingleStepResult,
  QueueCompleteSentinel,
  QUEUE_COMPLETE_SENTINEL,
} from './_run-impl';
import { OpenAIProvider } from './models/openai-provider';
import { Stream } from 'openai/streaming';
type ResponseCompletedEvent = InstanceType<typeof Stream> extends AsyncIterable<
  infer T
>
  ? T
  : any; // Infer event type if possible
import { Usage } from './usage';

// --- Placeholder for RunResultStreaming augmentation ---
// Ideally, this modification belongs in src/agents/result.ts
declare module './result' {
  interface RunResultStreaming {
    _input_guardrails_task?: Promise<void> | null;
    _output_guardrails_task?: Promise<OutputGuardrailResult[]> | null;
    _event_queue: AsyncQueue<StreamEvent | QueueCompleteSentinel>;
    _input_guardrail_queue: AsyncQueue<
      InputGuardrailResult | QueueCompleteSentinel
    >;
    _current_agent_output_schema?: AgentOutputSchema | null;
  }
}
// --- End Placeholder ---

const DEFAULT_MAX_TURNS = 10;

/**
 * Configures settings for the entire agent run.
 */
export class RunConfig {
  /**
   * The model to use for the entire agent run. If set, will override the model set on every
   * agent. The model_provider passed in below must be able to resolve this model name.
   */
  model?: string | Model;

  /**
   * The model provider to use when looking up string model names. Defaults to OpenAI.
   */
  modelProvider: ModelProvider = new OpenAIProvider({});

  /**
   * Configure global model settings. Any non-null values will override the agent-specific model
   * settings.
   */
  modelSettings?: ModelSettings;

  /**
   * A global input filter to apply to all handoffs. If `Handoff.input_filter` is set, then that
   * will take precedence. The input filter allows you to edit the inputs that are sent to the new
   * agent. See the documentation in `Handoff.input_filter` for more details.
   */
  handoffInputFilter?: HandoffInputFilter;

  /**
   * A list of input guardrails to run on the initial run input.
   */
  inputGuardrails?: InputGuardrail<any>[];

  /**
   * A list of output guardrails to run on the final output of the run.
   */
  outputGuardrails?: OutputGuardrail<any>[];

  /**
   * Whether tracing is disabled for the agent run. If disabled, we will not trace the agent run.
   */
  tracingDisabled?: boolean = false;

  /**
   * Whether we include potentially sensitive data (for example: inputs/outputs of tool calls or
   * LLM generations) in traces. If False, we'll still create spans for these events, but the
   * sensitive data will not be included.
   */
  traceIncludeSensitiveData?: boolean = true;

  /**
   * The name of the run, used for tracing. Should be a logical name for the run, like
   * "Code generation workflow" or "Customer support agent".
   */
  workflowName?: string = 'Agent workflow';

  /**
   * A custom trace ID to use for tracing. If not provided, we will generate a new trace ID.
   */
  traceId?: string;

  /**
   * A grouping identifier to use for tracing, to link multiple traces from the same conversation
   * or process. For example, you might use a chat thread ID.
   */
  groupId?: string;

  /**
   * An optional dictionary of additional metadata to include with the trace.
   */
  traceMetadata?: Record<string, any>;
}

/**
 * The Runner class handles running agents and managing their lifecycle.
 */
export class Runner {
  /**
   * Run a workflow starting at the given agent. The agent will run in a loop until a final
   * output is generated. The loop runs like so:
   * 1. The agent is invoked with the given input.
   * 2. If there is a final output (i.e. the agent produces something of type
   *    `agent.output_type`, the loop terminates.
   * 3. If there's a handoff, we run the loop again, with the new agent.
   * 4. Else, we run tool calls (if any), and re-run the loop.
   *
   * In two cases, the agent may raise an exception:
   * 1. If the max_turns is exceeded, a MaxTurnsExceeded exception is raised.
   * 2. If a guardrail tripwire is triggered, a GuardrailTripwireTriggered exception is raised.
   *
   * Note that only the first agent's input guardrails are run.
   */
  static async run<TContext>(
    startingAgent: Agent<TContext>,
    input: string | TResponseInputItem[],
    options: {
      context?: TContext;
      maxTurns?: number;
      hooks?: RunHooks<TContext>;
      runConfig?: RunConfig;
      previousResponseId?: string;
    } = {}
  ): Promise<RunResult> {
    const {
      context,
      maxTurns = DEFAULT_MAX_TURNS,
      hooks = new RunHooks<any>(),
      runConfig = new RunConfig(),
    } = options;

    const toolUseTracker = new AgentToolUseTracker();

    // Create a new trace if one doesn't exist
    const currentTrace = getCurrentTrace();
    const newTrace = currentTrace
      ? null
      : trace(
          runConfig.workflowName ?? 'Agent workflow',
          runConfig.traceId,
          runConfig.groupId,
          runConfig.traceMetadata,
          runConfig.tracingDisabled
        );

    // Start the trace if we created a new one
    if (newTrace) {
      newTrace.start(true);
    }

    try {
      let currentTurn = 0;
      let originalInput = JSON.parse(JSON.stringify(input)); // Deep copy
      const generatedItems: RunItem[] = [];
      const modelResponses: ModelResponse[] = [];

      const contextWrapper = new RunContextWrapper<any>(context);

      let inputGuardrailResults: InputGuardrailResult[] = [];

      let currentSpan: Span<AgentSpanData> | null = null;
      let currentAgent = startingAgent;
      let shouldRunAgentStartHooks = true;
      let allTools: Tool[] = []; // Initialize allTools

      try {
        while (true) {
          // Start an agent span if we don't have one
          if (!currentSpan) {
            const handoffNames = Runner._getHandoffs(currentAgent).map(
              (h) => h.agentName
            );
            const outputSchema = Runner._getOutputSchema(currentAgent);
            const outputTypeName = outputSchema
              ? outputSchema.outputTypeName
              : 'str';

            currentSpan = agentSpan(
              currentAgent.name,
              handoffNames,
              null,
              outputTypeName
            );
            currentSpan.start(true);

            allTools = await Runner._getAllTools(currentAgent); // Fetch tools inside the loop
            if (currentSpan) {
              currentSpan.spanData.tools = allTools.map((t) => t.name);
            }
          }

          currentTurn++;
          if (currentTurn > maxTurns) {
            if (currentSpan) {
              currentSpan.setError(
                new SpanError({
                  message: 'Max turns exceeded',
                  data: { maxTurns },
                })
              );
            }
            throw new MaxTurnsExceeded(`Max turns (${maxTurns}) exceeded`);
          }

          logger.debug(
            `Running agent ${currentAgent.name} (turn ${currentTurn})`
          );

          let turnResult: SingleStepResult;
          if (currentTurn === 1) {
            // Run input guardrails for the first turn only
            inputGuardrailResults = await Runner._runInputGuardrails(
              startingAgent,
              [
                ...(startingAgent.input_guardrails || []),
                ...(runConfig.inputGuardrails || []),
              ],
              JSON.parse(JSON.stringify(input)), // Deep copy
              contextWrapper,
              currentSpan // Pass current span for error reporting
            );

            // Run the first turn
            turnResult = await Runner._runSingleTurn({
              agent: currentAgent,
              allTools: allTools, // Use already fetched tools
              originalInput,
              generatedItems,
              hooks,
              contextWrapper,
              runConfig,
              shouldRunAgentStartHooks,
              toolUseTracker,
              previousResponseId: options.previousResponseId,
            });
          } else {
            // Fetch tools for subsequent turns if agent changed (span is new)
            if (!allTools.length) {
              // Check if allTools needs refreshing (e.g., after handoff)
              allTools = await Runner._getAllTools(currentAgent);
              if (currentSpan)
                currentSpan.spanData.tools = allTools.map((t) => t.name);
            }

            turnResult = await Runner._runSingleTurn({
              agent: currentAgent,
              allTools: allTools,
              originalInput,
              generatedItems,
              hooks,
              contextWrapper,
              runConfig,
              shouldRunAgentStartHooks,
              toolUseTracker,
              previousResponseId: options.previousResponseId,
            });
          }
          shouldRunAgentStartHooks = false;

          modelResponses.push(turnResult.modelResponse);
          originalInput = turnResult.originalInput;
          generatedItems.length = 0;
          generatedItems.push(...turnResult.generatedItems);

          if (turnResult.nextStep instanceof NextStepFinalOutput) {
            const outputGuardrailResults = await Runner._runOutputGuardrails(
              [
                ...(currentAgent.output_guardrails || []),
                ...(runConfig.outputGuardrails || []),
              ],
              currentAgent,
              turnResult.nextStep.output, // Corrected argument
              contextWrapper,
              currentSpan // Pass current span for error reporting
            );

            return new RunResult(
              originalInput,
              generatedItems,
              modelResponses,
              turnResult.nextStep.output,
              inputGuardrailResults,
              outputGuardrailResults,
              currentAgent
            );
          } else if (turnResult.nextStep instanceof NextStepHandoff) {
            currentAgent = turnResult.nextStep.newAgent as Agent<TContext>;
            if (currentSpan) {
              currentSpan.finish(true);
              currentSpan = null;
            }
            shouldRunAgentStartHooks = true;
            allTools = []; // Reset tools so they are fetched next turn
          } else if (turnResult.nextStep instanceof NextStepRunAgain) {
          } else {
            const errorMsg = `Unknown next step type: ${
              (turnResult.nextStep as any)?.constructor?.name
            }`;
            if (currentSpan) {
              currentSpan.setError(
                new SpanError({ message: errorMsg, data: {} })
              );
            }
            throw new AgentsException(errorMsg);
          }
        }
      } finally {
        if (currentSpan) {
          currentSpan.finish(true);
        }
      }
    } finally {
      if (newTrace) {
        newTrace.finish(true);
      }
    }
  }

  /**
   * Run a workflow synchronously, starting at the given agent. Note that this just wraps the
   * `run` method, so it will not work if there's already an event loop.
   */
  static runSync<TContext>(
    startingAgent: Agent<TContext>,
    input: string | TResponseInputItem[],
    options: {
      context?: TContext;
      maxTurns?: number;
      hooks?: RunHooks<TContext>;
      runConfig?: RunConfig;
    } = {}
  ): RunResult {
    // Create a new event loop if one doesn't exist
    // Note: This synchronous wrapper might behave differently than Python's
    // asyncio.get_event_loop().run_until_complete depending on the Node.js environment.
    // It's generally recommended to use the async `run` method directly.
    try {
      const runner = async () => {
        return await Runner.run(startingAgent, input, options);
      };
      // This is a simplified way to run async code synchronously in some environments.
      // For robust synchronous execution, consider libraries like 'deasync' or restructuring.
      // However, directly using async/await is the standard Node.js practice.
      // This placeholder avoids complex dependencies for the example.
      // A truly robust solution would require more complex handling or external libs.
      console.warn(
        'runSync is not robustly implemented for all Node.js environments. Prefer async run().'
      );
      // Attempt a basic sync wait (not recommended for production)
      let result: RunResult | undefined;
      let error: Error | undefined;
      runner()
        .then((res) => (result = res))
        .catch((err) => (error = err));
      // The use of require('deasync') makes this code potentially problematic
      // and environment-dependent. It's kept here to reflect the previous state
      // but should ideally be removed in favor of an async-only approach.
      try {
        require('deasync').loopWhile(() => !result && !error);
      } catch (deasyncError) {
        if (
          (deasyncError as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
        ) {
          console.error(
            "The 'deasync' package is required for runSync. Please install it or use the async run() method."
          );
          throw new Error(
            "runSync requires the optional 'deasync' package. Please install it or use async run()."
          );
        } else {
          throw deasyncError; // Re-throw other errors from deasync
        }
      }
      if (error) throw error;
      if (!result) throw new Error('runSync failed to complete.');
      return result;
    } catch (e) {
      throw new Error(`runSync failed: ${e}`);
    }
  }

  /**
   * Run a workflow starting at the given agent in streaming mode. The returned result object
   * contains a method you can use to stream semantic events as they are generated.
   */
  static runStreamed<TContext>(
    startingAgent: Agent<TContext>,
    input: string | TResponseInputItem[],
    options: {
      context?: TContext;
      maxTurns?: number;
      hooks?: RunHooks<TContext>;
      runConfig?: RunConfig;
      previousResponseId?: string;
    } = {}
  ): RunResultStreaming {
    const {
      context,
      maxTurns = DEFAULT_MAX_TURNS,
      hooks = new RunHooks<any>(),
      runConfig = new RunConfig(),
    } = options;

    // Create a new trace if one doesn't exist
    const currentTrace = getCurrentTrace();
    const newTrace = currentTrace
      ? null
      : trace(
          runConfig.workflowName ?? 'Agent workflow',
          runConfig.traceId,
          runConfig.groupId,
          runConfig.traceMetadata,
          runConfig.tracingDisabled
        );

    // Start the trace if we created a new one
    if (newTrace) {
      newTrace.start(true);
    }

    const outputSchema = Runner._getOutputSchema(startingAgent);
    const contextWrapper = new RunContextWrapper<any>(context);

    const streamedResult = new RunResultStreaming(
      JSON.parse(JSON.stringify(input)), // Deep copy
      [],
      [],
      null,
      [],
      [],
      startingAgent,
      0,
      maxTurns,
      outputSchema,
      newTrace
    );

    // Start the streaming implementation in the background
    const runImplTask = Runner._runStreamedImpl(
      input,
      streamedResult,
      startingAgent,
      maxTurns,
      hooks,
      contextWrapper,
      runConfig,
      options.previousResponseId
    );

    // Set the task on the streamed result
    (streamedResult as any)._runImplTask = runImplTask;

    return streamedResult;
  }

  /**
   * Get the output schema for an agent
   */
  private static _getOutputSchema(agent: Agent<any>): AgentOutputSchema | null {
    if (!agent.output_type || agent.output_type === String) {
      return null;
    }
    return new AgentOutputSchema(agent.output_type);
  }

  /**
   * Get all handoffs for an agent
   */
  private static _getHandoffs(agent: Agent<any>): Handoff<any>[] {
    const handoffs: Handoff<any>[] = [];
    if (!agent.handoffs) return [];

    // Ensure handoffs is always an array
    const handoffItems = Array.isArray(agent.handoffs)
      ? agent.handoffs
      : [agent.handoffs];

    for (const handoffItem of handoffItems) {
      if (handoffItem instanceof Handoff) {
        handoffs.push(handoffItem);
      } else if (handoffItem instanceof Agent) {
        handoffs.push(handoff(handoffItem)); // Use the handoff factory function
      }
      // Add additional checks here if other types can represent handoffs
    }
    return handoffs;
  }

  /**
   * Get all tools for an agent
   */
  private static async _getAllTools(agent: Agent<any>): Promise<Tool[]> {
    // Made async
    // Assuming agent might have an async method to get tools or related data
    // If agent.tools and agent.mcp_servers are readily available properties,
    // this might not need to be async. Adjust based on Agent implementation.
    // For now, matching the Python signature which suggests potential async operations.
    const tools = [...(agent.tools || []), ...(agent.mcp_servers || [])];
    // Example: If agent had an async method:
    // const dynamicTools = await agent.getDynamicTools();
    // return [...tools, ...dynamicTools];
    return Promise.resolve(tools); // Keep Promise wrapper for async signature
  }

  /**
   * Get the model for an agent
   */
  private static _getModel(agent: Agent<any>, runConfig: RunConfig): Model {
    if (runConfig.model instanceof Model) {
      return runConfig.model;
    } else if (typeof runConfig.model === 'string') {
      return runConfig.modelProvider.getModel(runConfig.model);
    } else if (agent.model instanceof Model) {
      return agent.model;
    }
    // Assuming agent.model is a string identifier if not a Model instance
    return runConfig.modelProvider.getModel(agent.model as string);
  }

  /**
   * Run input guardrails
   */
  private static async _runInputGuardrails(
    agent: Agent<any>,
    guardrails: InputGuardrail<any>[],
    input: string | TResponseInputItem[],
    context: RunContextWrapper<any>,
    span: Span<AgentSpanData> | null // Added span argument
  ): Promise<InputGuardrailResult[]> {
    if (!guardrails.length) {
      return [];
    }

    const guardrailPromises = guardrails.map((guardrail) =>
      RunImpl.runSingleInputGuardrail(agent, guardrail, input, context)
    );

    // Run in parallel
    const results = await Promise.allSettled(guardrailPromises);

    const successfulResults: InputGuardrailResult[] = [];
    let triggeredResult: InputGuardrailResult | null = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.output.tripwire_triggered) {
          triggeredResult = result.value;
          // Don't break here, let all settle, but prioritize the first trigger for the exception
          if (!triggeredResult) triggeredResult = result.value;

          // Attach error to current span if available
          if (span) {
            // Use passed span
            span.setError(
              new SpanError({
                message: 'Input guardrail tripwire triggered',
                data: { guardrail: result.value.guardrail.get_name() },
              })
            );
          }
        } else if (!triggeredResult) {
          // Only add successful if no trigger has been found yet
          successfulResults.push(result.value);
        }
      } else {
        // Handle potential errors during guardrail execution itself
        logger.error(`Error running input guardrail: ${result.reason}`);
        if (span) {
          // Use passed span
          const guardrailName =
            (result as any).reason?.guardrail?.get_name?.() ?? 'unknown'; // Safely access name
          span.setError(
            new SpanError({
              message: `Input guardrail failed: ${result.reason}`,
              data: { guardrailName },
            })
          );
        }
      }
    }

    if (triggeredResult) {
      throw new InputGuardrailTripwireTriggered(triggeredResult);
    }

    return successfulResults;
  }

  /**
   * Run output guardrails
   */
  private static async _runOutputGuardrails(
    guardrails: OutputGuardrail<any>[],
    agent: Agent<any>,
    agentOutput: any,
    context: RunContextWrapper<any>,
    span: Span<AgentSpanData> | null // Added span argument
  ): Promise<OutputGuardrailResult[]> {
    if (!guardrails.length) {
      return [];
    }

    const guardrailPromises = guardrails.map((guardrail) =>
      RunImpl.runSingleOutputGuardrail(guardrail, agent, agentOutput, context)
    );

    // Run in parallel
    const results = await Promise.allSettled(guardrailPromises);

    const successfulResults: OutputGuardrailResult[] = [];
    let triggeredResult: OutputGuardrailResult | null = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.output.tripwire_triggered) {
          if (!triggeredResult) triggeredResult = result.value; // Capture the first trigger

          // Attach error to current span if available
          if (span) {
            // Use passed span
            span.setError(
              new SpanError({
                message: 'Output guardrail tripwire triggered',
                data: { guardrail: result.value.guardrail.get_name() },
              })
            );
          }
        } else if (!triggeredResult) {
          // Only add successful if no trigger has been found yet
          successfulResults.push(result.value);
        }
      } else {
        // Handle potential errors during guardrail execution itself
        logger.error(`Error running output guardrail: ${result.reason}`);
        if (span) {
          // Use passed span
          const guardrailName =
            (result as any).reason?.guardrail?.get_name?.() ?? 'unknown'; // Safely access name
          span.setError(
            new SpanError({
              message: `Output guardrail failed: ${result.reason}`,
              data: { guardrailName },
            })
          );
        }
      }
    }

    if (triggeredResult) {
      throw new OutputGuardrailTripwireTriggered(triggeredResult);
    }

    return successfulResults;
  }

  /**
   * Run a single turn of the agent (non-streaming)
   */
  private static async _runSingleTurn<TContext>({
    agent,
    allTools,
    originalInput,
    generatedItems,
    hooks,
    contextWrapper,
    runConfig,
    shouldRunAgentStartHooks,
    toolUseTracker,
    previousResponseId,
  }: {
    agent: Agent<TContext>;
    allTools: Tool[];
    originalInput: string | TResponseInputItem[];
    generatedItems: RunItem[];
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    runConfig: RunConfig;
    shouldRunAgentStartHooks: boolean;
    toolUseTracker: AgentToolUseTracker;
    previousResponseId?: string;
  }): Promise<SingleStepResult> {
    // Ensure we run the hooks before anything else
    if (shouldRunAgentStartHooks) {
      await Promise.all([
        hooks.onAgentStart(contextWrapper, agent),
        agent.hooks
          ? agent.hooks.onStart(contextWrapper, agent)
          : noopCoroutine(),
      ]);
    }

    const systemPrompt = await agent.getSystemPrompt(contextWrapper);
    const outputSchema = Runner._getOutputSchema(agent);
    const handoffs = Runner._getHandoffs(agent);
    const currentInput = ItemHelpers.inputToNewInputList(originalInput); // Use a separate variable
    currentInput.push(...generatedItems.map((item) => item.toInputItem()));

    const newResponse = await Runner._getNewResponse(
      agent,
      systemPrompt,
      currentInput, // Pass the constructed input
      outputSchema,
      allTools,
      handoffs,
      contextWrapper,
      runConfig,
      toolUseTracker,
      previousResponseId
    );

    contextWrapper.usage.add(newResponse.usage);

    // Note: preStepItems should be the items *before* this turn
    return await Runner._getSingleStepResultFromResponse({
      agent,
      allTools,
      originalInput,
      preStepItems: [...generatedItems], // Pass current generated items as pre-step for this response processing
      newResponse,
      outputSchema,
      handoffs,
      hooks,
      contextWrapper,
      runConfig,
      toolUseTracker,
    });
  }

  /**
   * Get a new response from the model
   */
  private static async _getNewResponse(
    agent: Agent<any>,
    systemPrompt: string | null,
    input: TResponseInputItem[], // Corrected type
    outputSchema: AgentOutputSchema | null,
    allTools: Tool[],
    handoffs: Handoff<any>[],
    contextWrapper: RunContextWrapper<any>,
    runConfig: RunConfig,
    toolUseTracker: AgentToolUseTracker,
    previousResponseId?: string
  ): Promise<ModelResponse> {
    const model = Runner._getModel(agent, runConfig);
    const modelSettings = agent.model_settings.resolve(runConfig.modelSettings);
    let resolvedSettings = RunImpl.maybeResetToolChoice(
      agent,
      toolUseTracker,
      modelSettings
    );

    // If tools are available and tool_choice isn't explicitly set (to e.g., 'none' or a specific tool),
    // default to 'auto' to encourage the model to use them.
    if (allTools.length > 0 && resolvedSettings.tool_choice === undefined) {
      // Use `new ModelSettings` for the resolve method
      resolvedSettings = resolvedSettings.resolve(
        new ModelSettings({ tool_choice: 'auto' })
      );
      logger.debug('Setting tool_choice to auto as tools are available.');
    }

    const newResponse = await model.getResponse(
      systemPrompt,
      input,
      resolvedSettings,
      allTools,
      outputSchema,
      handoffs,
      getModelTracingImpl(
        runConfig.tracingDisabled ?? false,
        runConfig.traceIncludeSensitiveData ?? true
      ),
      previousResponseId
    );

    contextWrapper.usage.add(newResponse.usage);

    return newResponse;
  }

  /**
   * Get a single step result from a response
   */
  private static async _getSingleStepResultFromResponse<TContext>({
    agent,
    allTools,
    originalInput,
    preStepItems,
    newResponse,
    outputSchema,
    handoffs,
    hooks,
    contextWrapper,
    runConfig,
    toolUseTracker,
  }: {
    agent: Agent<TContext>;
    allTools: Tool[];
    originalInput: string | TResponseInputItem[];
    preStepItems: RunItem[]; // Items generated *before* this specific model response
    newResponse: ModelResponse;
    outputSchema: AgentOutputSchema | null;
    handoffs: Handoff<any>[];
    hooks: RunHooks<TContext>;
    contextWrapper: RunContextWrapper<TContext>;
    runConfig: RunConfig;
    toolUseTracker: AgentToolUseTracker;
  }): Promise<SingleStepResult> {
    const processedResponse = RunImpl.processModelResponse({
      agent,
      allTools,
      response: newResponse,
      outputSchema,
      handoffs,
    });

    toolUseTracker.addToolUse(agent, processedResponse.toolsUsed);

    // executeToolsAndSideEffects takes the items *before* the step (preStepItems)
    // and the newly processed items from *this* response (processedResponse.newItems)
    // It then combines them internally if needed or uses them to determine the next step.
    return await RunImpl.executeToolsAndSideEffects({
      agent,
      allTools,
      originalInput,
      preStepItems, // Pass the items generated before this response
      newResponse,
      processedResponse, // Pass the result of processing this response
      outputSchema,
      hooks,
      contextWrapper,
      runConfig,
      toolUseTracker,
    });
  }

  /**
   * Run a workflow in streaming mode - Implementation
   */
  private static async _runStreamedImpl<TContext>(
    startingInput: string | TResponseInputItem[], // Renamed for clarity
    streamedResult: RunResultStreaming,
    startingAgent: Agent<TContext>,
    maxTurns: number,
    hooks: RunHooks<TContext>,
    contextWrapper: RunContextWrapper<TContext>,
    runConfig: RunConfig,
    previousResponseId?: string
  ): Promise<void> {
    const toolUseTracker = new AgentToolUseTracker();
    let currentAgent = startingAgent;
    let shouldRunAgentStartHooks = true;
    let currentSpan: Span<AgentSpanData> | null = null;
    let currentOriginalInput = JSON.parse(JSON.stringify(startingInput)); // Track original input per turn if modified
    const currentGeneratedItems: RunItem[] = []; // Track items generated across turns

    try {
      // --- Input Guardrails (Run once at the start) ---
      streamedResult._input_guardrails_task =
        Runner._runInputGuardrailsWithQueue(
          startingAgent,
          [
            ...(startingAgent.input_guardrails || []),
            ...(runConfig.inputGuardrails || []),
          ],
          JSON.parse(JSON.stringify(startingInput)), // Use initial input
          contextWrapper,
          streamedResult,
          null // Pass null for span initially
        );
      try {
        await streamedResult._input_guardrails_task; // Wait for guardrails before starting turns
      } catch (e) {
        if (e instanceof InputGuardrailTripwireTriggered) {
          // Error already logged and attached to span in _runInputGuardrails
          await streamedResult.setError(e); // Propagate error to stream consumer
          streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL); // Signal completion
          return; // Stop execution
        } else {
          // Handle unexpected errors during guardrail execution
          const error = e instanceof Error ? e : new Error(String(e));
          logger.error(
            `Unexpected error during input guardrail execution: ${error.message}`
          );
          // Cannot set error on currentSpan as it doesn't exist yet
          await streamedResult.setError(error);
          streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
          return;
        }
      }
      // --- Agent Loop ---
      while (true) {
        if (streamedResult.isComplete) break; // Check if completed externally or by error

        // Start an agent span if we don't have one
        if (!currentSpan) {
          const handoffNames = Runner._getHandoffs(currentAgent).map(
            (h) => h.agentName
          );
          const outputSchema = Runner._getOutputSchema(currentAgent);
          const outputTypeName = outputSchema
            ? outputSchema.outputTypeName
            : 'str';

          currentSpan = agentSpan(
            currentAgent.name,
            handoffNames,
            null,
            outputTypeName
          );
          currentSpan.start(true);

          const allTools = await Runner._getAllTools(currentAgent);
          if (currentSpan) {
            currentSpan.spanData.tools = allTools.map((t) => t.name);
          }
        }

        streamedResult.currentTurn++;
        if (streamedResult.currentTurn > maxTurns) {
          const error = new MaxTurnsExceeded(
            `Max turns (${maxTurns}) exceeded`
          );
          if (currentSpan) {
            currentSpan.setError(
              new SpanError({
                message: 'Max turns exceeded',
                data: { maxTurns },
              })
            );
          }
          await streamedResult.setError(error);
          streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
          break; // Exit loop
        }

        logger.debug(
          `Running agent ${currentAgent.name} (turn ${streamedResult.currentTurn})`
        );

        try {
          // --- Run Single Turn Streamed ---
          const turnResult = await Runner._runSingleTurnStreamed(
            streamedResult,
            currentAgent,
            hooks,
            contextWrapper,
            runConfig,
            shouldRunAgentStartHooks,
            toolUseTracker,
            await Runner._getAllTools(currentAgent), // Pass current tools
            currentOriginalInput, // Pass input potentially modified by handoffs
            currentGeneratedItems, // Pass items accumulated so far
            previousResponseId
          );
          shouldRunAgentStartHooks = false;

          // Update state based on turn result BEFORE checking next step
          streamedResult.rawResponses.push(turnResult.modelResponse);
          currentOriginalInput = turnResult.originalInput; // Update input for next turn
          currentGeneratedItems.length = 0; // Clear and update generated items
          currentGeneratedItems.push(...turnResult.generatedItems);
          streamedResult.newItems = [...currentGeneratedItems]; // Update result object's view

          // --- Process Next Step ---
          if (turnResult.nextStep instanceof NextStepFinalOutput) {
            // Run output guardrails asynchronously
            streamedResult._output_guardrails_task =
              Runner._runOutputGuardrails(
                [
                  ...(currentAgent.output_guardrails || []),
                  ...(runConfig.outputGuardrails || []),
                ],
                currentAgent,
                turnResult.nextStep.output,
                contextWrapper,
                currentSpan
              );

            try {
              // Wait for guardrails to complete for the final output
              const outputGuardrailResults =
                await streamedResult._output_guardrails_task;
              streamedResult.outputGuardrailResults = outputGuardrailResults; // Store results

              // Update the final output and complete
              streamedResult.finalOutput = turnResult.nextStep.output;
              streamedResult.isComplete = true;
              await streamedResult.complete();
              streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
              break; // Exit loop
            } catch (e) {
              if (e instanceof OutputGuardrailTripwireTriggered) {
                // Error already logged and attached to span
                await streamedResult.setError(e);
                streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
                break;
              } else {
                // Handle unexpected errors
                const error = e instanceof Error ? e : new Error(String(e));
                logger.error(
                  `Unexpected error during output guardrail execution: ${error.message}`
                );
                // Check currentSpan before using it
                if (currentSpan && typeof currentSpan.setError === 'function') {
                  currentSpan.setError(
                    new SpanError({
                      message: 'Output guardrail execution failed',
                      data: { error: error.message },
                    })
                  );
                }
                await streamedResult.setError(error);
                streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
                break;
              }
            }
          } else if (turnResult.nextStep instanceof NextStepHandoff) {
            currentAgent = turnResult.nextStep.newAgent as Agent<TContext>;
            streamedResult.currentAgent = currentAgent; // Update agent in result
            await streamedResult.updateAgent(currentAgent); // Notify stream listeners

            if (currentSpan) {
              currentSpan.finish(true);
              currentSpan = null; // Reset span for the new agent
            }
            shouldRunAgentStartHooks = true; // Run start hooks for the new agent
            // currentOriginalInput and currentGeneratedItems are updated above based on turnResult
          } else if (turnResult.nextStep instanceof NextStepRunAgain) {
            // Continue the loop with updated state (originalInput, generatedItems)
          } else {
            const error = new AgentsException(
              `Unknown next step type: ${
                (turnResult.nextStep as any)?.constructor?.name
              }`
            );
            if (currentSpan) {
              currentSpan.setError(
                new SpanError({ message: error.message, data: {} })
              );
            }
            await streamedResult.setError(error);
            streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
            break;
          }
        } catch (error) {
          // Handle errors originating from _runSingleTurnStreamed or processing
          const err = error instanceof Error ? error : new Error(String(error));
          if (currentSpan) {
            currentSpan.setError(
              new SpanError({
                message: 'Error in agent run',
                data: { error: err.message },
              })
            );
          }
          logger.error(`Error during streamed agent turn: ${err.message}`);
          await streamedResult.setError(err);
          streamedResult.isComplete = true; // Mark as complete on error
          streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL);
          break; // Exit loop on error
        }
      }
    } catch (error) {
      // Catch errors from initial setup or unhandled exceptions in the loop
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Unhandled error in _runStreamedImpl: ${err.message}`);
      if (currentSpan) {
        // Ensure the span captures the top-level error if possible
        currentSpan.setError(
          new SpanError({
            message: 'Unhandled error in runStreamedImpl',
            data: { error: err.message },
          })
        );
      }
      await streamedResult.setError(err);
      streamedResult.isComplete = true;
      console.log('NOluTOR OLum SİKERİM YA---', streamedResult);
      streamedResult._event_queue.put_nowait(QUEUE_COMPLETE_SENTINEL); // Ensure queue signals end
    } finally {
      if (currentSpan) {
        currentSpan.finish(true); // Ensure span is closed
      }
      // Ensure the trace is finished if this Runner created it
      /*
       if (streamedResult._trace && !getCurrentTrace()) { // Check if we own the trace
          streamedResult._trace.finish(true);
       }
       */
    }
  }

  /** Helper to run input guardrails and stream results for runStreamed */
  private static async _runInputGuardrailsWithQueue<TContext>(
    agent: Agent<any>,
    guardrails: InputGuardrail<TContext>[],
    input: string | TResponseInputItem[],
    context: RunContextWrapper<TContext>,
    streamedResult: RunResultStreaming,
    parentSpan: Span<AgentSpanData> | null // Accept parent span (can be null)
  ): Promise<void> {
    // Returns void, results are put on queue
    const queue = streamedResult._input_guardrail_queue;
    if (!guardrails.length) {
      queue.put_nowait(QUEUE_COMPLETE_SENTINEL); // Signal end immediately if no guardrails
      return;
    }

    const guardrailTasks = guardrails.map((guardrail) =>
      RunImpl.runSingleInputGuardrail(agent, guardrail, input, context)
    );

    try {
      // Process completed guardrails as they finish
      for await (const result of Runner._yieldResults(guardrailTasks)) {
        if (result.status === 'fulfilled') {
          queue.put_nowait(result.value); // Put successful result on queue
          streamedResult.inputGuardrailResults.push(result.value); // Also store internally

          if (result.value.output.tripwire_triggered) {
            if (parentSpan) {
              parentSpan.setError(
                new SpanError({
                  message: 'Input guardrail tripwire triggered',
                  data: { guardrail: result.value.guardrail.get_name() },
                })
              );
            }
            // Raise the exception to be caught by the caller (_runStreamedImpl)
            throw new InputGuardrailTripwireTriggered(result.value);
          }
        } else {
          // Handle errors during individual guardrail execution
          const errorMsg = `Error running input guardrail: ${result.reason}`;
          logger.error(errorMsg);
          if (parentSpan) {
            parentSpan.setError(
              new SpanError({
                message: 'Error running input guardrail',
                data: {
                  error: String(result.reason),
                  guardrailName: 'unknown',
                }, // Try to get name if possible, fallback
              })
            );
          }
          // Decide how to handle: re-throw, put error on queue, or just log?
          // Re-throwing the reason ensures the caller (_runStreamedImpl) handles it.
          throw result.reason;
        }
      }
    } finally {
      // Ensure completion sentinel is always added, even if errors occur elsewhere
      // or if loop finishes normally.
      queue.put_nowait(QUEUE_COMPLETE_SENTINEL);

      // Cancel any remaining tasks if an error caused early exit
      // Note: Standard Promises don't support cancellation directly.
      // This comment remains illustrative.
      /*
           guardrailTasks.forEach(task => {
              // task.cancel();
           });
           */
    }
  }

  /** Helper async generator to yield settled promises like asyncio.as_completed */
  private static async *_yieldResults<T>(
    promises: Promise<T>[]
  ): AsyncGenerator<PromiseSettledResult<T>> {
    const promiseMap = new Map(promises.map((p, i) => [i, p]));
    const results: Map<number, PromiseSettledResult<T>> = new Map();
    let promisesPending = promiseMap.size;

    if (promisesPending === 0) return;

    const settledIndices = new Set<number>(); // Track indices that have settled

    const racers = Array.from(promiseMap.entries()).map(([index, promise]) =>
      promise
        .then(
          (value) => ({ status: 'fulfilled' as const, value, index }),
          (reason) => ({ status: 'rejected' as const, reason, index })
        )
        .then((result) => {
          // Use settledIndices to avoid processing the same promise multiple times if race condition allows
          if (!settledIndices.has(index)) {
            results.set(index, result);
            settledIndices.add(index);
          }
          return result; // Pass through the result for Promise.race
        })
    );

    while (settledIndices.size < promiseMap.size) {
      await Promise.race(racers.filter((_, i) => !settledIndices.has(i))); // Race only unsettled promises

      // Yield all newly settled results
      for (const [index, result] of results) {
        yield result;
        results.delete(index); // Remove yielded result
      }
    }
  }

  /** Run a single turn for streaming mode */
  private static async _runSingleTurnStreamed<TContext>(
    streamedResult: RunResultStreaming,
    agent: Agent<TContext>,
    hooks: RunHooks<TContext>,
    contextWrapper: RunContextWrapper<TContext>,
    runConfig: RunConfig,
    shouldRunAgentStartHooks: boolean,
    toolUseTracker: AgentToolUseTracker,
    allTools: Tool[],
    originalInput: string | TResponseInputItem[], // Receive current input state
    preStepItems: RunItem[], // Receive items generated before this turn
    previousResponseId?: string
  ): Promise<SingleStepResult> {
    // Returns the result after streaming completes
    if (shouldRunAgentStartHooks) {
      await Promise.all([
        hooks.onAgentStart(contextWrapper, agent),
        agent.hooks
          ? agent.hooks.onStart(contextWrapper, agent)
          : noopCoroutine(),
      ]);
    }

    const outputSchema = Runner._getOutputSchema(agent);
    streamedResult.currentAgent = agent; // Update result object
    streamedResult._current_agent_output_schema = outputSchema;

    const systemPrompt = await agent.getSystemPrompt(contextWrapper);
    const handoffs = Runner._getHandoffs(agent);
    const model = Runner._getModel(agent, runConfig);
    const modelSettings = agent.model_settings.resolve(runConfig.modelSettings);
    let resolvedSettings = RunImpl.maybeResetToolChoice(
      agent,
      toolUseTracker,
      modelSettings
    );

    // If tools are available and tool_choice isn't explicitly set (to e.g., 'none' or a specific tool),
    // default to 'auto' to encourage the model to use them.
    if (allTools.length > 0 && resolvedSettings.tool_choice === undefined) {
      // Use `new ModelSettings` for the resolve method
      resolvedSettings = resolvedSettings.resolve(
        new ModelSettings({ tool_choice: 'auto' })
      );
      logger.debug(
        'Setting tool_choice to auto as tools are available in streaming.'
      );
    }

    let finalResponse: ModelResponse | null = null;

    const currentInput = ItemHelpers.inputToNewInputList(originalInput);
    currentInput.push(...preStepItems.map((item) => item.toInputItem())); // Use preStepItems

    // --- Stream Model Response ---
    try {
      // Ensure streamResponse exists and is callable
      if (typeof model.streamResponse !== 'function') {
        throw new ModelBehaviorError(
          `Model ${model.constructor.name} does not support streaming.`
        );
      }

      const stream = model.streamResponse(
        systemPrompt,
        currentInput,
        resolvedSettings,
        allTools,
        outputSchema,
        handoffs,
        getModelTracingImpl(
          runConfig.tracingDisabled ?? false,
          runConfig.traceIncludeSensitiveData ?? true
        ),
        previousResponseId
      );

      let partialText = '';

      for await (const event of stream) {
        // 1. Push raw event as-is to keep behavior unchanged
        streamedResult._event_queue.put_nowait(
          new RawResponsesStreamEvent(event as ModelStreamEvent)
        );

        // 2. Accumulate text deltas
        if ((event as any)?.type === 'response.output_text.delta') {
          const delta = (event as any)?.delta;
          if (typeof delta === 'string') {
            partialText += delta;

            // Push semantic delta stream event
            streamedResult._event_queue.put_nowait(
              new AgentTextDeltaStreamEvent(delta)
            );
          }
        }

        // 3. Check if it's a completed response with usage/output/id
        const maybeCompletedEvent = event as any;

        if (
          maybeCompletedEvent?.response?.usage &&
          maybeCompletedEvent?.response?.output &&
          maybeCompletedEvent?.response?.id
        ) {
          const usageData = maybeCompletedEvent.response.usage;

          const usage = new Usage({
            requests: 1,
            input_tokens: usageData.input_tokens,
            output_tokens: usageData.output_tokens,
            total_tokens: usageData.total_tokens,
          });

          finalResponse = new ModelResponse(
            maybeCompletedEvent.response.output,
            usage,
            maybeCompletedEvent.response.id
          );
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error(`Error during model streaming: ${error.message}`);
      // Re-throw a more specific error if possible
      throw new ModelBehaviorError(`Model streaming failed: ${error.message}`);
    }

    // --- Process Final Response ---
    if (!finalResponse) {
      // This might happen if the stream ends without a proper completion event
      logger.warning(
        'Model stream ended without a detectable final response event.'
      );
      // Decide how to handle: throw error or try to proceed with potentially incomplete data?
      // Let's throw an error for now.
      throw new ModelBehaviorError(
        'Model stream ended without producing a final response event.'
      );
    }

    contextWrapper.usage.add(finalResponse.usage); // Add usage *after* getting final response

    // Process the complete response like in the non-streaming case
    const singleStepResult = await Runner._getSingleStepResultFromResponse({
      agent,
      allTools,
      originalInput, // Pass the original input for *this* turn
      preStepItems, // Pass items *before* this turn's response
      newResponse: finalResponse, // Use the accumulated final response
      outputSchema,
      handoffs,
      hooks,
      contextWrapper,
      runConfig,
      toolUseTracker,
    });

    // Stream the RunItems generated from processing the final response
    RunImpl.streamStepResultToQueue(
      singleStepResult,
      streamedResult._event_queue
    );

    return singleStepResult; // Return the fully processed result for this turn
  }
} // End of Runner class
