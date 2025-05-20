import { ChatModel } from 'openai/resources/shared';
import { Model } from '../models/interface';
import { FunctionToolResult, Tool, FunctionTool } from '../tools';
import { InputGuardrail, OutputGuardrail } from '../guardrails';
import { AgentHooks } from '../lifecycle';
import { Handoff } from '../handoffs';
import { RunContextWrapper } from '../run-context';
import { ToolsToFinalOutputResult } from '../stream-events';
import { ModelSettings } from '../models/model-settings';
import { ItemHelpers } from '../items';
import { OpenAIProvider, DEFAULT_MODEL } from '../models/openai-provider';
import { RunResult } from '../result';
import { AgentOutputSchema } from '../agent-outputs';
import { MCPServer, MCPUtil } from '../mcp';

/**
 * Specifies how tools should be chosen by the model.
 * - 'auto': Model decides when to use tools
 * - 'required': Model must use a tool
 * - 'none': Model cannot use tools
 */
type ToolChoice = 'auto' | 'required' | 'none';

/**
 * Configuration to stop agent execution when specific tools are called.
 */
interface StopAtTools {
  /**
   * A list of tool names, any of which will stop the agent from running further.
   */
  stop_at_tool_names: string[];
}

type ToolsToFinalOutputFunction<TContext> = (
  contextWrapper: RunContextWrapper<TContext>,
  toolResults: FunctionToolResult[]
) => Promise<ToolsToFinalOutputResult>;

/**
 * Configures how tool usage is handled.
 * - 'run_llm_again': The default behavior. Tools are run, and then the LLM receives the results and gets to respond.
 * - 'stop_on_first_tool': The output of the first tool call is used as the final output.
 * - StopAtTools: The agent will stop running if any of the specified tools are called.
 */
type ToolUseBehavior =
  | 'run_llm_again'
  | 'stop_on_first_tool'
  | StopAtTools
  | ToolsToFinalOutputFunction<any>;

type InstructionsFunction<TContext> = (
  runContext: RunContextWrapper<TContext>,
  agent: Agent<TContext>
) => Promise<string> | string;

/**
 * Constructor properties for creating an Agent.
 */
interface AgentProps<TContext = any> {
  /** The name of the agent */
  name: string;
  /** The instructions for the agent. Will be used as the "system prompt" when this agent is
   * invoked. Describes what the agent should do, and how it responds.
   *
   * Can either be a string, or a function that dynamically generates instructions for the agent.
   * If you provide a function, it will be called with the context and the agent instance.
   * It must return a string.
   */
  instructions?: string | InstructionsFunction<TContext>;
  /** Description of the agent when used as a handoff */
  handoff_description?: string;
  /** Sub-agents that this agent can delegate to */
  handoffs?: Array<Agent<any> | Handoff<TContext>>;
  /** The model implementation to use when invoking the LLM */
  model?: string | ChatModel | Model;
  /** Model-specific tuning parameters */
  model_settings?: ModelSettings;
  /** A list of tools that the agent can use */
  tools?: Array<Tool>;
  /** Model Context Protocol servers the agent can use */
  mcp_servers?: Array<MCPServer>;
  /** Checks that run before generating a response */
  input_guardrails?: Array<InputGuardrail<TContext>>;
  /** Checks that run on the final output of the agent */
  output_guardrails?: Array<OutputGuardrail<TContext>>;
  /** The type of the output object */
  output_type?: AgentOutputSchema<TContext>;
  /** Callbacks for agent lifecycle events */
  hooks?: AgentHooks<TContext>;
  /** Configures how tool use is handled */
  tool_use_behavior?: ToolUseBehavior;
  /** Whether to reset tool choice after tool use */
  reset_tool_choice?: boolean;
}

/**
 * An agent is an AI model configured with instructions, tools, guardrails, handoffs and more.
 *
 * Agents are generic on the context type. The context is a (mutable) object you create.
 * It is passed to tool functions, handoffs, guardrails, etc.
 */
export class Agent<TContext> {
  /** The name of the agent */
  name: string;

  /**
   * The instructions for the agent. Used as the "system prompt" when this agent is invoked.
   * Describes what the agent should do and how it responds.
   */
  instructions?: string | InstructionsFunction<TContext>;

  /**
   * A description of the agent. Used when the agent is used as a handoff,
   * so that an LLM knows what it does and when to invoke it.
   */
  handoff_description?: string;

  /**
   * Handoffs are sub-agents that the agent can delegate to.
   * Allows for separation of concerns and modularity.
   */
  handoffs?: Array<Agent<any> | Handoff<TContext>> = [];

  /** The model implementation to use when invoking the LLM */
  model: string | ChatModel | Model = DEFAULT_MODEL;

  /** Configures model-specific tuning parameters */
  model_settings: ModelSettings = new ModelSettings();

  /** A list of tools that the agent can use */
  tools?: Array<Tool> = [];

  /**
   * A list of Model Context Protocol servers that the agent can use.
   * Every time the agent runs, it will include tools from these servers.
   */
  mcp_servers: Array<MCPServer> = [];

  /**
   * A list of checks that run before generating a response.
   * Runs only if the agent is the first agent in the chain.
   */
  input_guardrails?: Array<InputGuardrail<TContext>> = [];

  /**
   * A list of checks that run on the final output of the agent.
   * Runs only if the agent produces a final output.
   */
  output_guardrails?: Array<OutputGuardrail<TContext>> = [];

  /** The type of the output object */
  output_type?: any;

  /** Callbacks for agent lifecycle events */
  hooks?: AgentHooks<TContext>;

  /**
   * Configures how tool use is handled:
   * - "run_llm_again": Tools are run, then the LLM processes results and responds
   * - "stop_on_first_tool": The output of the first tool call is the final output
   * - StopAtTools: Agent stops if any specified tools are called
   */
  tool_use_behavior: ToolUseBehavior = 'run_llm_again';

  /**
   * Whether to reset the tool choice after a tool has been called.
   * This prevents the agent from entering an infinite loop of tool usage.
   */
  reset_tool_choice: boolean = true;

  constructor({
    name,
    instructions,
    handoff_description,
    handoffs,
    model,
    model_settings,
    tools,
    mcp_servers,
    input_guardrails,
    output_guardrails,
    output_type,
    hooks,
    tool_use_behavior,
    reset_tool_choice,
  }: AgentProps<TContext>) {
    this.name = name;
    this.instructions = instructions;
    this.handoff_description = handoff_description;
    this.handoffs = handoffs;
    this.model = model ?? DEFAULT_MODEL;
    this.model_settings = model_settings ?? new ModelSettings();
    this.tools = tools || [];
    this.mcp_servers = mcp_servers ?? [];
    this.input_guardrails = input_guardrails ?? [];
    this.output_guardrails = output_guardrails ?? [];
    this.output_type = output_type;
    this.hooks = hooks;
    this.tool_use_behavior = tool_use_behavior ?? 'run_llm_again';
    this.reset_tool_choice = reset_tool_choice ?? true;
  }

  /**
   * Get the system prompt for the agent.
   */
  async getSystemPrompt(runContext: RunContextWrapper<TContext>): Promise<string | null> {
    if (typeof this.instructions === 'string') {
      return this.instructions;
    } else if (typeof this.instructions === 'function') {
      return await this.instructions(runContext, this);
    } else if (this.instructions !== null) {
      console.error(`Instructions must be a string or a function, got ${this.instructions}`);
    }
    return null;
  }

  /**
   * Fetches the available tools from the MCP servers.
   */
  async getMCPTools(): Promise<Tool[]> {
    return MCPUtil.getFunctionTools(this.mcp_servers);
  }

  /**
   * Get all agent tools, including MCP tools and function tools.
   */
  async getAllTools(): Promise<Tool[]> {
    const mcpTools = await this.getMCPTools();
    return [...(mcpTools ?? []), ...(this.tools ?? [])];
  }

  /**
   * Make a copy of the agent, with the given arguments changed.
   * @example
   * ```typescript
   * const newAgent = agent.clone({ instructions: "New instructions" });
   * ```
   */
  clone(overrides: Partial<AgentProps<TContext>>): Agent<TContext> {
    return new Agent<TContext>({
      ...this,
      ...overrides,
    });
  }

  /**
   * Transform this agent into a tool, callable by other agents.
   *
   * This is different from handoffs in two ways:
   * 1. In handoffs, the new agent receives the conversation history. In this tool, the new agent
   *    receives generated input.
   * 2. In handoffs, the new agent takes over the conversation. In this tool, the new agent is
   *    called as a tool, and the conversation is continued by the original agent.
   *
   * @param toolName - The name of the tool. If not provided, the agent's name will be used.
   * @param toolDescription - The description of the tool, which should indicate what it does and
   *    when to use it.
   * @param customOutputExtractor - A function that extracts the output from the agent. If not
   *    provided, the last message from the agent will be used.
   */
  asTool(
    toolName?: string,
    toolDescription?: string,
    customOutputExtractor?: (result: RunResult) => Promise<string>
  ): Tool {
    const name = toolName || this.name;
    const description = toolDescription || this.handoff_description || '';

    return new FunctionTool({
      name,
      description,
      params_json_schema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'The input to send to the agent',
          },
        },
        required: ['input'],
      },
      on_invoke_tool: async ({ context, input }) => {
        const { Runner } = await import('../run');
        const output = await Runner.run(this, input, {
          context: context.context,
          runConfig: {
            modelProvider: new OpenAIProvider(),
            tracingDisabled: false,
            traceIncludeSensitiveData: true,
            workflowName: 'Agent tool',
            inputGuardrails: [],
            outputGuardrails: [],
          },
        });

        if (customOutputExtractor) {
          return await customOutputExtractor(output);
        }

        return ItemHelpers.textMessageOutputs(output.newItems);
      },
    });
  }
}
