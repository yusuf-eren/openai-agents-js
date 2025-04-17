import { inspect } from 'util';
import { Agent } from './agent';
import { ModelBehaviorError, UserError } from './exceptions';
import { RunItem, TResponseInputItem } from './items';
import { RunContextWrapper } from './run-context';
import { ensureStrictJsonSchema } from './strict-schema';
import { SpanError } from './tracing/spans';
import {
  attachErrorToCurrentSpan,
  validateJson,
  transformStringFunctionStyle,
} from './utils';

// Type definitions
type THandoffInput<T = any> = T;

type OnHandoffWithInput<T> = (
  context: RunContextWrapper<any>,
  input: T
) => any | Promise<any>;
type OnHandoffWithoutInput = (
  context: RunContextWrapper<any>
) => any | Promise<any>;

/**
 * The input data passed to a handoff.
 */
export class HandoffInputData {
  constructor(
    /**
     * The input history before `Runner.run()` was called.
     */
    public readonly inputHistory: string | TResponseInputItem[],

    /**
     * The items generated before the agent turn where the handoff was invoked.
     */
    public readonly preHandoffItems: ReadonlyArray<RunItem>,

    /**
     * The new items generated during the current agent turn, including the item that triggered the
     * handoff and the tool output message representing the response from the handoff output.
     */
    public readonly newItems: ReadonlyArray<RunItem>
  ) {}
}

/**
 * A function that filters the input data passed to the next agent.
 */
export type HandoffInputFilter = (data: HandoffInputData) => HandoffInputData;

/**
 * A handoff is when an agent delegates a task to another agent.
 * For example, in a customer support scenario you might have a "triage agent" that determines
 * which agent should handle the user's request, and sub-agents that specialize in different
 * areas like billing, account management, etc.
 */
export class Handoff<TContext> {
  /**
   * The name of the tool that represents the handoff.
   */
  readonly toolName: string;

  /**
   * The description of the tool that represents the handoff.
   */
  readonly toolDescription: string;

  /**
   * The JSON schema for the handoff input. Can be empty if the handoff does not take an input.
   */
  readonly inputJsonSchema: Record<string, any>;

  /**
   * The function that invokes the handoff.
   */
  readonly onInvokeHandoff: (
    context: RunContextWrapper<any>,
    args: string
  ) => Promise<Agent<TContext>>;

  /**
   * The name of the agent that is being handed off to.
   */
  readonly agentName: string;

  /**
   * A function that filters the inputs that are passed to the next agent.
   */
  readonly inputFilter: HandoffInputFilter | null;

  /**
   * Whether the input JSON schema is in strict mode.
   */
  readonly strictJsonSchema: boolean;

  constructor(
    toolName: string,
    toolDescription: string,
    inputJsonSchema: Record<string, any>,
    onInvokeHandoff: (
      context: RunContextWrapper<any>,
      args: string
    ) => Promise<Agent<TContext>>,
    agentName: string,
    inputFilter: HandoffInputFilter | null = null,
    strictJsonSchema: boolean = true
  ) {
    this.toolName = toolName;
    this.toolDescription = toolDescription;
    this.inputJsonSchema = inputJsonSchema;
    this.onInvokeHandoff = onInvokeHandoff;
    this.agentName = agentName;
    this.inputFilter = inputFilter;
    this.strictJsonSchema = strictJsonSchema;
  }

  /**
   * Get a transfer message for the handoff.
   */
  getTransferMessage(agent: Agent<any>): string {
    const base = `{"assistant": "${agent.name}"}`;
    return base;
  }

  /**
   * Get the default tool name for a handoff to the given agent.
   */
  static defaultToolName(agent: Agent<any>): string {
    return transformStringFunctionStyle(`transfer_to_${agent.name}`);
  }

  /**
   * Get the default tool description for a handoff to the given agent.
   */
  static defaultToolDescription(agent: Agent<any>): string {
    return `Handoff to the ${agent.name} agent to handle the request. ${
      agent.handoff_description || ''
    }`;
  }
}

/**
 * Create a handoff from an agent.
 *
 * @param agent The agent to handoff to
 * @param options Configuration options for the handoff
 */
export function handoff<TContext, TInput = any>(
  agent: Agent<TContext>,
  options: {
    toolNameOverride?: string;
    toolDescriptionOverride?: string;
    onHandoff?: OnHandoffWithInput<TInput> | OnHandoffWithoutInput;
    inputType?: new () => TInput;
    inputFilter?: HandoffInputFilter;
  } = {}
): Handoff<TContext> {
  const {
    toolNameOverride,
    toolDescriptionOverride,
    onHandoff,
    inputType,
    inputFilter,
  } = options;

  // Type validation
  if ((onHandoff && !inputType) || (!onHandoff && inputType)) {
    throw new Error(
      'You must provide either both onHandoff and inputType, or neither'
    );
  }

  let typeAdapter: any = null;
  let inputJsonSchema: Record<string, any> = {};

  if (inputType) {
    if (!onHandoff || typeof onHandoff !== 'function') {
      throw new Error('onHandoff must be callable');
    }

    // In TypeScript, we can't easily check the signature of a function at runtime
    // We'll assume the function signature is correct for now
    typeAdapter = { validate: (input: string) => JSON.parse(input) }; // Simple adapter

    // Generate a basic JSON schema from the input type
    // This is a simplified version as TypeScript doesn't have runtime type information
    inputJsonSchema = { type: 'object' };
  } else if (onHandoff) {
    // Again, in TypeScript we can't easily inspect function signatures
    // We'll assume the function signature is correct
  }

  const invokeHandoff = async (
    ctx: RunContextWrapper<any>,
    inputJson: string | null = null
  ): Promise<Agent<any>> => {
    if (inputType && typeAdapter) {
      if (inputJson === null) {
        attachErrorToCurrentSpan(
          new SpanError({
            message: 'Handoff function expected non-null input, but got null',
            data: { details: 'input_json is null' },
          })
        );
        throw new ModelBehaviorError(
          'Handoff function expected non-null input, but got null'
        );
      }

      const validatedInput: any = validateJson(inputJson, typeAdapter, {
        allowPartial: false,
      });

      const inputFunc = onHandoff as OnHandoffWithInput<TInput>;
      if (isAsyncFunction(inputFunc)) {
        await inputFunc(ctx, validatedInput);
      } else {
        inputFunc(ctx, validatedInput);
      }
    } else if (onHandoff) {
      const noInputFunc = onHandoff as OnHandoffWithoutInput;
      if (isAsyncFunction(noInputFunc)) {
        await noInputFunc(ctx);
      } else {
        noInputFunc(ctx);
      }
    }

    return agent;
  };

  const toolName = toolNameOverride || Handoff.defaultToolName(agent);
  const toolDescription =
    toolDescriptionOverride || Handoff.defaultToolDescription(agent);

  // Always ensure the input JSON schema is in strict mode
  const strictInputJsonSchema = ensureStrictJsonSchema(inputJsonSchema);

  return new Handoff(
    toolName,
    toolDescription,
    strictInputJsonSchema,
    invokeHandoff,
    agent.name,
    inputFilter || null
  );
}

/**
 * Check if a function is async (returns a Promise)
 */
function isAsyncFunction(fn: Function): boolean {
  return (
    fn.constructor.name === 'AsyncFunction' ||
    fn.toString().includes('async') ||
    fn.toString().includes('Promise')
  );
}

// Helper utilities that would be implemented in other files
export const util = {
  transformStringFunctionStyle,
  validateJson: (json: string, adapter: any, partial: boolean) => {
    try {
      return JSON.parse(json);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e}`);
    }
  },
  attachErrorToCurrentSpan: (error: SpanError) => {
    console.error(error);
  },
};
