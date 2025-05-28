import { ChatCompletionChunk } from 'openai/resources';
import { TResponseStreamEvent } from '../items';
import { FAKE_RESPONSES_ID } from './fake-id';

interface StreamingState {
  started: boolean;
  textContentIndexAndOutput: [number, ResponseOutputText] | null;
  refusalContentIndexAndOutput: [number, ResponseOutputRefusal] | null;
  functionCalls: Map<number, ResponseFunctionToolCall>;
}

interface ResponseOutputText {
  text: string;
  type: 'output_text';
  annotations: any[];
}

interface ResponseOutputRefusal {
  refusal: string;
  type: 'refusal';
}

interface ResponseFunctionToolCall {
  id: string;
  arguments: string;
  name: string;
  type: 'function_call';
  call_id: string;
}

interface ResponseOutputMessage {
  id: string;
  content: (ResponseOutputText | ResponseOutputRefusal)[];
  role: 'assistant';
  type: 'message';
  status: 'in_progress' | 'completed';
}

class SequenceNumber {
  private _sequenceNumber = 0;

  getAndIncrement(): number {
    const num = this._sequenceNumber;
    this._sequenceNumber += 1;
    return num;
  }
}

export class ChatCmplStreamHandler {
  static async *handleStream(
    response: any,
    stream: AsyncIterable<ChatCompletionChunk>
  ): AsyncGenerator<TResponseStreamEvent> {
    let usage: any = null;
    const state: StreamingState = {
      started: false,
      textContentIndexAndOutput: null,
      refusalContentIndexAndOutput: null,
      functionCalls: new Map(),
    };
    const sequenceNumber = new SequenceNumber();

    for await (const chunk of stream) {
      if (!state.started) {
        state.started = true;
        yield {
          response,
          type: 'response.created',
          sequence_number: sequenceNumber.getAndIncrement(),
        };
      }

      // This is always set by the OpenAI API, but not by others e.g. LiteLLM
      usage = chunk.usage || usage;

      if (!chunk.choices || !chunk.choices[0]?.delta) {
        continue;
      }

      const delta = chunk.choices[0].delta;

      // Handle text
      if (delta.content) {
        if (!state.textContentIndexAndOutput) {
          // Initialize a content tracker for streaming text
          state.textContentIndexAndOutput = [
            state.refusalContentIndexAndOutput ? 1 : 0,
            {
              text: '',
              type: 'output_text',
              annotations: [],
            },
          ];

          // Start a new assistant message stream
          const assistantItem: ResponseOutputMessage = {
            id: FAKE_RESPONSES_ID,
            content: [],
            role: 'assistant',
            type: 'message',
            status: 'in_progress',
          };

          // Notify consumers of the start of a new output message + first content part
          yield {
            item: assistantItem,
            output_index: 0,
            type: 'response.output_item.added',
            sequence_number: sequenceNumber.getAndIncrement(),
          };

          yield {
            content_index: state.textContentIndexAndOutput[0],
            item_id: FAKE_RESPONSES_ID,
            output_index: 0,
            part: {
              text: '',
              type: 'output_text',
              annotations: [],
            },
            type: 'response.content_part.added',
            sequence_number: sequenceNumber.getAndIncrement(),
          };
        }

        // Emit the delta for this segment of content
        yield {
          content_index: state.textContentIndexAndOutput[0],
          delta: delta.content,
          item_id: FAKE_RESPONSES_ID,
          output_index: 0,
          type: 'response.output_text.delta',
          sequence_number: sequenceNumber.getAndIncrement(),
        };

        // Accumulate the text into the response part
        state.textContentIndexAndOutput[1].text += delta.content;
      }

      // Handle refusals (model declines to answer)
      if (delta.refusal) {
        if (!state.refusalContentIndexAndOutput) {
          // Initialize a content tracker for streaming refusal text
          state.refusalContentIndexAndOutput = [
            state.textContentIndexAndOutput ? 1 : 0,
            {
              refusal: '',
              type: 'refusal',
            },
          ];

          // Start a new assistant message if one doesn't exist yet (in-progress)
          const assistantItem: ResponseOutputMessage = {
            id: FAKE_RESPONSES_ID,
            content: [],
            role: 'assistant',
            type: 'message',
            status: 'in_progress',
          };

          // Notify downstream that assistant message + first content part are starting
          yield {
            item: assistantItem,
            output_index: 0,
            type: 'response.output_item.added',
            sequence_number: sequenceNumber.getAndIncrement(),
          };

          yield {
            content_index: state.refusalContentIndexAndOutput[0],
            item_id: FAKE_RESPONSES_ID,
            output_index: 0,
            part: {
              text: '',
              type: 'output_text',
              annotations: [],
            },
            type: 'response.content_part.added',
            sequence_number: sequenceNumber.getAndIncrement(),
          };
        }

        // Emit the delta for this segment of refusal
        yield {
          content_index: state.refusalContentIndexAndOutput[0],
          delta: delta.refusal,
          item_id: FAKE_RESPONSES_ID,
          output_index: 0,
          type: 'response.refusal.delta',
          sequence_number: sequenceNumber.getAndIncrement(),
        };

        // Accumulate the refusal string in the output part
        state.refusalContentIndexAndOutput[1].refusal += delta.refusal;
      }

      // Handle tool calls
      // Because we don't know the name of the function until the end of the stream, we'll
      // save everything and yield events at the end
      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          if (!state.functionCalls.has(tcDelta.index)) {
            state.functionCalls.set(tcDelta.index, {
              id: FAKE_RESPONSES_ID,
              arguments: '',
              name: '',
              type: 'function_call',
              call_id: '',
            });
          }

          const tcFunction = tcDelta.function;
          const functionCall = state.functionCalls.get(tcDelta.index)!;

          functionCall.arguments += tcFunction?.arguments || '';
          functionCall.name += tcFunction?.name || '';
          functionCall.call_id += tcDelta.id || '';
        }
      }
    }

    let functionCallStartingIndex = 0;
    if (state.textContentIndexAndOutput) {
      functionCallStartingIndex += 1;
      // Send end event for this content part
      yield {
        content_index: state.textContentIndexAndOutput[0],
        item_id: FAKE_RESPONSES_ID,
        output_index: 0,
        part: state.textContentIndexAndOutput[1],
        type: 'response.content_part.done',
        sequence_number: sequenceNumber.getAndIncrement(),
      };
    }

    if (state.refusalContentIndexAndOutput) {
      functionCallStartingIndex += 1;
      // Send end event for this content part
      yield {
        content_index: state.refusalContentIndexAndOutput[0],
        item_id: FAKE_RESPONSES_ID,
        output_index: 0,
        part: state.refusalContentIndexAndOutput[1],
        type: 'response.content_part.done',
        sequence_number: sequenceNumber.getAndIncrement(),
      };
    }

    // Actually send events for the function calls
    for (const functionCall of state.functionCalls.values()) {
      // First, a ResponseOutputItemAdded for the function call
      yield {
        item: {
          id: FAKE_RESPONSES_ID,
          call_id: functionCall.call_id,
          arguments: functionCall.arguments,
          name: functionCall.name,
          type: 'function_call',
        },
        output_index: functionCallStartingIndex,
        type: 'response.output_item.added',
        sequence_number: sequenceNumber.getAndIncrement(),
      };

      // Then, yield the args
      yield {
        delta: functionCall.arguments,
        item_id: FAKE_RESPONSES_ID,
        output_index: functionCallStartingIndex,
        type: 'response.function_call_arguments.delta',
        sequence_number: sequenceNumber.getAndIncrement(),
      };

      // Finally, the ResponseOutputItemDone
      yield {
        item: {
          id: FAKE_RESPONSES_ID,
          call_id: functionCall.call_id,
          arguments: functionCall.arguments,
          name: functionCall.name,
          type: 'function_call',
        },
        output_index: functionCallStartingIndex,
        type: 'response.output_item.done',
        sequence_number: sequenceNumber.getAndIncrement(),
      };
    }

    // Finally, send the Response completed event
    const outputs: any[] = [];
    if (state.textContentIndexAndOutput || state.refusalContentIndexAndOutput) {
      const assistantMsg: ResponseOutputMessage = {
        id: FAKE_RESPONSES_ID,
        content: [],
        role: 'assistant',
        type: 'message',
        status: 'completed',
      };

      if (state.textContentIndexAndOutput) {
        assistantMsg.content.push(state.textContentIndexAndOutput[1]);
      }
      if (state.refusalContentIndexAndOutput) {
        assistantMsg.content.push(state.refusalContentIndexAndOutput[1]);
      }

      outputs.push(assistantMsg);

      // send a ResponseOutputItemDone for the assistant message
      yield {
        item: assistantMsg,
        output_index: 0,
        type: 'response.output_item.done',
        sequence_number: sequenceNumber.getAndIncrement(),
      };
    }

    for (const functionCall of state.functionCalls.values()) {
      outputs.push(functionCall);
    }

    const finalResponse = {
      ...response,
      output: outputs,
      usage: usage
        ? {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            output_tokens_details: {
              reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
            },
            input_tokens_details: {
              cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
            },
          }
        : null,
    };

    yield {
      response: finalResponse,
      type: 'response.completed',
      sequence_number: sequenceNumber.getAndIncrement(),
    };
  }
} 