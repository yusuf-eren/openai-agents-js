import { Agent } from './agent';
import { RunItem, TResponseStreamEvent } from './items';

/**
 * Result from processing tool outputs to determine if we have a final output.
 */
export class ToolsToFinalOutputResult {
  /**
   * Whether this is the final output. If False, the LLM will run again and receive the tool call
   * output.
   */
  isFinalOutput: boolean;

  /**
   * The final output. Can be null if `isFinalOutput` is False, otherwise must match the
   * `outputType` of the agent.
   */
  finalOutput: any | null;

  constructor(isFinalOutput: boolean, finalOutput: any | null = null) {
    this.isFinalOutput = isFinalOutput;
    this.finalOutput = finalOutput;
  }
}

/**
 * Streaming event from the LLM. These are 'raw' events, i.e. they are directly passed through
 * from the LLM.
 */
export class RawResponsesStreamEvent {
  /**
   * The raw responses streaming event from the LLM.
   */
  data: TResponseStreamEvent;

  /**
   * The type of the event.
   */
  type: 'raw_response_event' = 'raw_response_event';

  constructor(data: TResponseStreamEvent) {
    this.data = data;
  }
}

/**
 * Streaming events that wrap a `RunItem`. As the agent processes the LLM response, it will
 * generate these events for new messages, tool calls, tool outputs, handoffs, etc.
 */
export class RunItemStreamEvent {
  /**
   * The name of the event.
   */
  name:
    | 'message_output_created'
    | 'handoff_requested'
    | 'handoff_occured'
    | 'tool_called'
    | 'tool_output'
    | 'reasoning_item_created';

  /**
   * The item that was created.
   */
  item: RunItem;

  /**
   * The type of the event.
   */
  type: 'run_item_stream_event' = 'run_item_stream_event';

  constructor(name: RunItemStreamEvent['name'], item: RunItem) {
    this.name = name;
    this.item = item;
  }
}

/**
 * Event that notifies that there is a new agent running.
 */
export class AgentUpdatedStreamEvent {
  /**
   * The new agent.
   */
  newAgent: Agent<any>;

  /**
   * The type of the event.
   */
  type: 'agent_updated_stream_event' = 'agent_updated_stream_event';

  constructor(newAgent: Agent<any>) {
    this.newAgent = newAgent;
  }
}

/**
 * A text token (delta) streamed from the agent's model output.
 */
export class AgentTextDeltaStreamEvent {
  /**
   * The streamed text content (a single token or fragment).
   */
  delta: string;

  /**
   * The type of the event.
   */
  type: 'agent_text_delta_stream_event' = 'agent_text_delta_stream_event';

  constructor(delta: string) {
    this.delta = delta;
  }
}

/**
 * A streaming event from an agent.
 */
export type StreamEvent =
  | RawResponsesStreamEvent
  | RunItemStreamEvent
  | AgentUpdatedStreamEvent
  | AgentTextDeltaStreamEvent;

