import { Agent } from '../agent';
import { AgentsException, ModelBehaviorError } from '../exceptions';
import { Usage } from '../usage';

import {
  Response,
  ResponseComputerToolCall,
  ResponseFileSearchToolCall,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseStreamEvent,
  ResponseReasoningItem,
  ResponseInputItem,
} from 'openai/resources/responses/responses';

type FunctionCallOutput = ResponseInputItem.FunctionCallOutput;
type ComputerCallOutput = ResponseInputItem.ComputerCallOutput;

/**
 * A type alias for the Response type from the OpenAI SDK.
 */
export type TResponse = Response;

/**
 * A type alias for the ResponseInputItemParam type from the OpenAI SDK.
 */
export type TResponseInputItem = any; // TODO: Implement that part `ResponseInputItemParam`

/**
 * A type alias for the ResponseOutputItem type from the OpenAI SDK.
 */
export type TResponseOutputItem = ResponseOutputItem;

/**
 * A type alias for the ResponseStreamEvent type from the OpenAI SDK.
 */
export type TResponseStreamEvent = ResponseStreamEvent;

/**
 * Base class for all run items
 */
export abstract class RunItemBase<
  T extends TResponseOutputItem | TResponseInputItem
> {
  /**
   * The agent whose run caused this item to be generated.
   */
  agent: Agent<any>;

  /**
   * The raw Responses item from the run. This will always be a either an output item
   * or an input item
   */
  raw_item: T;

  /**
   * The type of this run item, used for type discrimination
   */
  abstract type: string;

  constructor(agent: Agent<any>, raw_item: T) {
    this.agent = agent;
    this.raw_item = raw_item;
  }

  /**
   * Converts this item into an input item suitable for passing to the model.
   */
  toInputItem(): TResponseInputItem {
    if (typeof this.raw_item === 'object' && this.raw_item !== null) {
      // For input items, just return them directly
      if ('role' in this.raw_item) {
        return this.raw_item as any;
      }

      // For output items, we convert them
      // In TypeScript, we don't have Pydantic's model_dump - we'll have to rely on
      // standard object conversion which should work for most JSON-serializable objects
      return this.raw_item as any;
    }

    throw new AgentsException(
      `Unexpected raw item type: ${typeof this.raw_item}`
    );
  }
}

/**
 * Represents a message from the LLM.
 */
export class MessageOutputItem extends RunItemBase<ResponseOutputMessage> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'message_output_item' as const;

  constructor(agent: Agent<any>, raw_item: ResponseOutputMessage) {
    super(agent, raw_item);
  }
}

/**
 * Represents a tool call for a handoff from one agent to another.
 */
export class HandoffCallItem extends RunItemBase<ResponseFunctionToolCall> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'handoff_call_item' as const;

  constructor(agent: Agent<any>, raw_item: ResponseFunctionToolCall) {
    super(agent, raw_item);
  }
}

/**
 * Represents the output of a handoff.
 */
export class HandoffOutputItem extends RunItemBase<TResponseInputItem> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'handoff_output_item' as const;

  /**
   * The agent that made the handoff.
   */
  source_agent: Agent<any>;

  /**
   * The agent that is being handed off to.
   */
  target_agent: Agent<any>;

  constructor(
    agent: Agent<any>,
    raw_item: TResponseInputItem,
    source_agent: Agent<any>,
    target_agent: Agent<any>
  ) {
    super(agent, raw_item);
    this.source_agent = source_agent;
    this.target_agent = target_agent;
  }
}

/**
 * A type that represents a tool call item.
 */
export type ToolCallItemTypes =
  | ResponseFunctionToolCall
  | ResponseComputerToolCall
  | ResponseFileSearchToolCall
  | ResponseFunctionWebSearch;

/**
 * Represents a tool call e.g. a function call or computer action call.
 */
export class ToolCallItem extends RunItemBase<ToolCallItemTypes> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'tool_call_item' as const;

  constructor(agent: Agent<any>, raw_item: ToolCallItemTypes) {
    super(agent, raw_item);
  }
}

/**
 * Represents the output of a tool call.
 */
export class ToolCallOutputItem extends RunItemBase<
  FunctionCallOutput | ComputerCallOutput
> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'tool_call_output_item' as const;

  /**
   * The output of the tool call. This is whatever the tool call returned;
   * the `raw_item` contains a string representation of the output.
   */
  output: any;

  constructor(
    agent: Agent<any>,
    raw_item: FunctionCallOutput | ComputerCallOutput,
    output: any
  ) {
    super(agent, raw_item);
    this.output = output;
  }
}

/**
 * Represents a reasoning item.
 */
export class ReasoningItem extends RunItemBase<ResponseReasoningItem> {
  /**
   * The type discriminator for this run item
   */
  readonly type = 'reasoning_item' as const;

  constructor(agent: Agent<any>, raw_item: ResponseReasoningItem) {
    super(agent, raw_item);
  }
}

/**
 * An item generated by an agent.
 */
export type RunItem =
  | MessageOutputItem
  | HandoffCallItem
  | HandoffOutputItem
  | ToolCallItem
  | ToolCallOutputItem
  | ReasoningItem;

/**
 * Model response wrapper
 */
export class ModelResponse {
  /**
   * A list of outputs (messages, tool calls, etc) generated by the model
   */
  output: TResponseOutputItem[];

  /**
   * The usage information for the response.
   */
  usage: Usage;

  /**
   * An ID for the response which can be used to refer to the response in subsequent calls to the
   * model. Not supported by all model providers.
   */
  response_id: string | null;

  constructor(
    output: TResponseOutputItem[],
    usage: Usage,
    response_id: string | null = null
  ) {
    this.output = output;
    this.usage = usage;
    this.response_id = response_id;
  }

  /**
   * Convert the output into a list of input items suitable for passing to the model.
   */
  toInputItems(): TResponseInputItem[] {
    // In TypeScript we don't have model_dump, so we'll convert objects directly
    return this.output.map((item) => item as any);
  }
}

/**
 * Helper functions for working with response items
 */
export class ItemHelpers {
  /**
   * Extracts the last text content or refusal from a message.
   */
  static extractLastContent(message: TResponseOutputItem): string {
    if (!('content' in message && Array.isArray(message.content))) {
      return '';
    }

    const lastContent = message.content[message.content.length - 1];
    if ('text' in lastContent) {
      return lastContent.text;
    } else if ('refusal' in lastContent) {
      return lastContent.refusal;
    } else {
      throw new ModelBehaviorError(
        `Unexpected content type: ${typeof lastContent}`
      );
    }
  }

  /**
   * Extracts the last text content from a message, if any. Ignores refusals.
   */
  static extractLastText(message: TResponseOutputItem): string | null {
    if ('content' in message && Array.isArray(message.content)) {
      const lastContent = message.content[message.content.length - 1];
      if ('text' in lastContent) {
        return lastContent.text;
      }
    } else if ('content' in message && typeof message.content === 'string') {
      return message.content;
    }
    return null;
  }

  /**
   * Converts a string or list of input items into a list of input items.
   */
  static inputToNewInputList(
    input: string | TResponseInputItem[]
  ): TResponseInputItem[] {
    if (typeof input === 'string') {
      return [
        {
          content: input,
          role: 'user',
        },
      ];
    }
    return JSON.parse(JSON.stringify(input)); // Deep copy
  }

  /**
   * Concatenates all the text content from a list of message output items.
   */
  static textMessageOutputs(items: RunItem[]): string {
    let text = '';
    for (const item of items) {
      if (item instanceof MessageOutputItem) {
        text += this.textMessageOutput(item);
      }
    }
    return text;
  }

  /**
   * Extracts all the text content from a single message output item.
   */
  static textMessageOutput(message: MessageOutputItem): string {
    let text = '';
    for (const item of message.raw_item.content) {
      if ('text' in item) {
        text += item.text;
      }
    }
    return text;
  }

  /**
   * Creates a tool call output item from a tool call and its output.
   */
  static toolCallOutputItem(
    toolCall: ResponseFunctionToolCall,
    output: string
  ): FunctionCallOutput {
    return {
      call_id: toolCall.call_id,
      output: output,
      type: 'function_call_output',
    };
  }
}
