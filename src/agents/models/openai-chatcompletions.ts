import { OpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { Model, ModelProvider, ModelTracing, ModelTracingUtils } from './interface';
import { AgentOutputSchema } from '../agent-outputs';
import { Handoff } from '../handoffs';
import { ModelResponse, TResponseInputItem, TResponseOutputItem, TResponseStreamEvent } from '../items';
import { FunctionTool, Tool } from '../tools';
import { ModelSettings } from './model-settings';
import { FAKE_RESPONSES_ID } from './fake-id';
import { DONT_LOG_MODEL_DATA } from '../debug';
import { logger } from '../logger';
import { generationSpan } from '../tracing';
import { withGenerationSpan } from '../tracing/utils';
import { GenerationSpanData } from '../tracing/span-data';
import { Span } from '../tracing/spans';
import { Usage } from '../usage';
import { AgentsException, UserError } from '../exceptions';

const _USER_AGENT = `Agents/Node`;
const _HEADERS = { 'User-Agent': _USER_AGENT };

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

export class OpenAIChatCompletionsModel implements Model {
  private model: string;
  private _client: OpenAI | null;

  constructor({ model, openaiClient }: { model: string; openaiClient: OpenAI }) {
    this.model = model;
    this._client = openaiClient;
  }

  private _nonNullOrNotGiven(value: any): any {
    return value !== null ? value : undefined;
  }

  async getResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    tracing: ModelTracing,
    previousResponseId?: string
  ): Promise<ModelResponse> {
    const convertedInput =
      typeof input === 'string' ? [{ role: 'user', content: input }] : _Converter.itemsToMessages(input);

    return withGenerationSpan(
      convertedInput,
      this.model,
      {
        ...modelSettings,
        baseUrl: this._client?.baseURL,
      },
      async span => {
        const response = await this._fetchResponse(
          systemInstructions,
          input,
          modelSettings,
          tools,
          outputSchema,
          handoffs,
          span,
          tracing,
          false
        );

        if (DONT_LOG_MODEL_DATA) {
          logger.debug('Received model response');
        } else {
          logger.debug(`LLM resp:\n${JSON.stringify(response.choices[0].message, null, 2)}\n`);
        }

        const usage = response.usage
          ? new Usage({
              requests: 1,
              input_tokens: response.usage.prompt_tokens,
              output_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            })
          : new Usage();

        if (ModelTracingUtils.includeData(tracing)) {
          span.spanData.output = [response.choices[0].message];
        }
        span.spanData.usage = {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        };

        const items = _Converter.messageToOutputItems(response.choices[0].message);

        return new ModelResponse(items, usage, null);
      }
    );
  }

  async *streamResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    tracing: ModelTracing,
    previousResponseId?: string
  ): AsyncGenerator<TResponseStreamEvent> {
    const convertedInput =
      typeof input === 'string' ? [{ role: 'user', content: input }] : _Converter.itemsToMessages(input);

    const span = generationSpan(
      convertedInput,
      null,
      this.model,
      {
        ...modelSettings,
        baseUrl: this._client?.baseURL,
      },
      null
    );

    try {
      span.start(true);

      const [response, stream] = await this._fetchResponse(
        systemInstructions,
        input,
        modelSettings,
        tools,
        outputSchema,
        handoffs,
        span,
        tracing,
        true
      );

      let finalResponse: any = null;
      let usage: any = null;
      const state: StreamingState = {
        started: false,
        textContentIndexAndOutput: null,
        refusalContentIndexAndOutput: null,
        functionCalls: new Map(),
      };

      for await (const chunk of stream) {
        if (!state.started) {
          state.started = true;
          yield {
            type: 'response.created',
            response,
          };
        }

        usage = chunk.usage;

        if (!chunk.choices?.[0]?.delta) continue;

        const delta = chunk.choices[0].delta;

        // Handle text
        if (delta.content) {
          if (!state.textContentIndexAndOutput) {
            state.textContentIndexAndOutput = [
              state.refusalContentIndexAndOutput ? 1 : 0,
              {
                text: '',
                type: 'output_text',
                annotations: [],
              },
            ];

            const assistantItem: ResponseOutputMessage = {
              id: FAKE_RESPONSES_ID,
              content: [],
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
            };

            yield {
              type: 'response.output_item.added',
              item: assistantItem,
              output_index: 0,
            };

            yield {
              type: 'response.content_part.added',
              content_index: state.textContentIndexAndOutput[0],
              item_id: FAKE_RESPONSES_ID,
              output_index: 0,
              part: {
                text: '',
                type: 'output_text',
                annotations: [],
              },
            };
          }

          yield {
            type: 'response.output_text.delta',
            content_index: state.textContentIndexAndOutput[0],
            delta: delta.content,
            item_id: FAKE_RESPONSES_ID,
            output_index: 0,
          };

          state.textContentIndexAndOutput[1].text += delta.content;
        }

        // Handle refusals
        if (delta.refusal) {
          if (!state.refusalContentIndexAndOutput) {
            state.refusalContentIndexAndOutput = [
              state.textContentIndexAndOutput ? 1 : 0,
              {
                refusal: '',
                type: 'refusal',
              },
            ];

            const assistantItem: ResponseOutputMessage = {
              id: FAKE_RESPONSES_ID,
              content: [],
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
            };

            yield {
              type: 'response.output_item.added',
              item: assistantItem,
              output_index: 0,
            };

            yield {
              type: 'response.content_part.added',
              content_index: state.refusalContentIndexAndOutput[0],
              item_id: FAKE_RESPONSES_ID,
              output_index: 0,
              part: {
                text: '',
                type: 'output_text',
                annotations: [],
              },
            };
          }

          yield {
            type: 'response.refusal.delta',
            content_index: state.refusalContentIndexAndOutput[0],
            delta: delta.refusal,
            item_id: FAKE_RESPONSES_ID,
            output_index: 0,
          };

          state.refusalContentIndexAndOutput[1].refusal += delta.refusal;
        }

        // Handle tool calls
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
        functionCallStartingIndex++;
        yield {
          type: 'response.content_part.done',
          content_index: state.textContentIndexAndOutput[0],
          item_id: FAKE_RESPONSES_ID,
          output_index: 0,
          part: state.textContentIndexAndOutput[1],
        };
      }

      if (state.refusalContentIndexAndOutput) {
        functionCallStartingIndex++;
        yield {
          type: 'response.content_part.done',
          content_index: state.refusalContentIndexAndOutput[0],
          item_id: FAKE_RESPONSES_ID,
          output_index: 0,
          part: state.refusalContentIndexAndOutput[1],
        };
      }

      // Send function call events
      for (const functionCall of state.functionCalls.values()) {
        yield {
          type: 'response.output_item.added',
          item: {
            id: FAKE_RESPONSES_ID,
            call_id: functionCall.call_id,
            arguments: functionCall.arguments,
            name: functionCall.name,
            type: 'function_call',
          },
          output_index: functionCallStartingIndex,
        };

        yield {
          type: 'response.function_call_arguments.delta',
          delta: functionCall.arguments,
          item_id: FAKE_RESPONSES_ID,
          output_index: functionCallStartingIndex,
        };

        yield {
          type: 'response.output_item.done',
          item: {
            id: FAKE_RESPONSES_ID,
            call_id: functionCall.call_id,
            arguments: functionCall.arguments,
            name: functionCall.name,
            type: 'function_call',
          },
          output_index: functionCallStartingIndex,
        };
      }

      // Send final response
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

        yield {
          type: 'response.output_item.done',
          item: assistantMsg,
          output_index: 0,
        };
      }

      for (const functionCall of state.functionCalls.values()) {
        outputs.push(functionCall);
      }

      finalResponse = {
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
        type: 'response.completed',
        response: finalResponse,
      };

      if (ModelTracingUtils.includeData(tracing) && finalResponse) {
        span.spanData.output = [finalResponse];
      }

      if (finalResponse?.usage) {
        span.spanData.usage = {
          input_tokens: finalResponse.usage.input_tokens,
          output_tokens: finalResponse.usage.output_tokens,
        };
      }
    } finally {
      span.finish(true);
    }
  }

  private async _fetchResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    span: Span<GenerationSpanData>,
    tracing: ModelTracing,
    stream: boolean = false
  ): Promise<[any, any] | any> {
    const convertedMessages = _Converter.itemsToMessages(input);

    if (systemInstructions) {
      convertedMessages.unshift({
        content: systemInstructions,
        role: 'system',
      });
    }

    if (ModelTracingUtils.includeData(tracing)) {
      span.spanData.input = convertedMessages;
    }

    const parallelToolCalls = modelSettings.parallel_tool_calls && tools.length > 0 ? true : undefined;

    const toolChoice = _Converter.convertToolChoice(modelSettings.tool_choice ?? null);
    const responseFormat = _Converter.convertResponseFormat(outputSchema);

    const convertedTools = tools.map(tool => ToolConverter.toOpenAI(tool));

    for (const handoff of handoffs) {
      convertedTools.push(ToolConverter.convertHandoffTool(handoff));
    }

    if (DONT_LOG_MODEL_DATA) {
      logger.debug('Calling LLM');
    } else {
      logger.debug(
        `Messages:\n${JSON.stringify(convertedMessages, null, 2)}\n
        Tools:\n${JSON.stringify(convertedTools, null, 2)}\n
        Stream:\n${stream}\n
        Tool choice:\n${toolChoice}\n
        Response format:\n${responseFormat}\n
        `
      );
    }

    const store = modelSettings.store ?? true;

    const ret = await this._client!.chat.completions.create({
      model: this.model,
      messages: convertedMessages,
      tools: convertedTools.length > 0 ? convertedTools : undefined,
      temperature: this._nonNullOrNotGiven(modelSettings.temperature),
      top_p: this._nonNullOrNotGiven(modelSettings.top_p),
      frequency_penalty: this._nonNullOrNotGiven(modelSettings.frequency_penalty),
      presence_penalty: this._nonNullOrNotGiven(modelSettings.presence_penalty),
      max_tokens: this._nonNullOrNotGiven(modelSettings.max_tokens),
      tool_choice: tools.length > 0 ? toolChoice : undefined,
      response_format: responseFormat,
      parallel_tool_calls: parallelToolCalls,
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
      store,
    });

    if (!stream) {
      return ret;
    }

    const response = {
      id: FAKE_RESPONSES_ID,
      created_at: Date.now() / 1000,
      model: this.model,
      object: 'response',
      output: [],
      tool_choice: toolChoice || 'auto',
      top_p: modelSettings.top_p,
      temperature: modelSettings.temperature,
      tools: [],
      parallel_tool_calls: parallelToolCalls || false,
    };

    return [response, ret];
  }
}

class _Converter {
  static convertToolChoice(toolChoice: 'auto' | 'required' | 'none' | string | null): any {
    if (toolChoice === null) {
      return undefined;
    } else if (toolChoice === 'auto') {
      return 'auto';
    } else if (toolChoice === 'required') {
      return 'required';
    } else if (toolChoice === 'none') {
      return 'none';
    } else {
      return {
        type: 'function',
        function: {
          name: toolChoice,
        },
      };
    }
  }

  static convertResponseFormat(finalOutputSchema: AgentOutputSchema | null): any {
    if (!finalOutputSchema || finalOutputSchema.isPlainText()) {
      return undefined;
    }

    return zodResponseFormat(z.object({ response: finalOutputSchema.outputType.outputType }), 'final_output');
  }

  static messageToOutputItems(message: any): TResponseOutputItem[] {
    const items: TResponseOutputItem[] = [];

    const messageItem: ResponseOutputMessage = {
      id: FAKE_RESPONSES_ID,
      content: [],
      role: 'assistant',
      type: 'message',
      status: 'completed',
    };

    if (message.content) {
      messageItem.content.push({
        text: message.content,
        type: 'output_text',
        annotations: [],
      });
    }

    if (message.refusal) {
      messageItem.content.push({
        refusal: message.refusal,
        type: 'refusal',
      });
    }

    if (message.audio) {
      throw new AgentsException('Audio is not currently supported');
    }

    if (messageItem.content.length > 0) {
      items.push(messageItem);
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        items.push({
          id: FAKE_RESPONSES_ID,
          call_id: toolCall.id,
          arguments: toolCall.function.arguments,
          name: toolCall.function.name,
          type: 'function_call',
        });
      }
    }

    return items;
  }

  static maybeEasyInputMessage(item: any): any {
    if (typeof item !== 'object') {
      return null;
    }

    const keys = Object.keys(item);
    if (keys.length !== 2 || !('content' in item) || !('role' in item)) {
      return null;
    }

    const role = item.role;
    if (!['user', 'assistant', 'system', 'developer'].includes(role)) {
      return null;
    }

    return item;
  }

  static maybeInputMessage(item: any): any {
    if (typeof item === 'object' && item.type === 'message' && ['user', 'system', 'developer'].includes(item.role)) {
      return item;
    }

    return null;
  }

  static maybeFileSearchCall(item: any): any {
    if (typeof item === 'object' && item.type === 'file_search_call') {
      return item;
    }
    return null;
  }

  static maybeFunctionToolCall(item: any): any {
    if (typeof item === 'object' && item.type === 'function_call') {
      return item;
    }
    return null;
  }

  static maybeFunctionToolCallOutput(item: any): any {
    if (typeof item === 'object' && item.type === 'function_call_output') {
      return item;
    }
    return null;
  }

  static maybeItemReference(item: any): any {
    if (typeof item === 'object' && item.type === 'item_reference') {
      return item;
    }
    return null;
  }

  static maybeResponseOutputMessage(item: any): any {
    if (typeof item === 'object' && item.type === 'message' && item.role === 'assistant') {
      return item;
    }
    return null;
  }

  static extractTextContent(content: string | Iterable<any>): string | any[] {
    const allContent = this.extractAllContent(content);
    if (typeof allContent === 'string') {
      return allContent;
    }
    return allContent.filter(c => c.type === 'text');
  }

  static extractAllContent(content: string | Iterable<any>): string | any[] {
    if (typeof content === 'string') {
      return content;
    }

    const out: any[] = [];

    for (const c of content) {
      if (typeof c === 'object' && c.type === 'input_text') {
        out.push({
          type: 'text',
          text: c.text,
        });
      } else if (typeof c === 'object' && c.type === 'input_image') {
        if (!c.image_url) {
          throw new UserError(`Only image URLs are supported for input_image ${c}`);
        }
        out.push({
          type: 'image_url',
          image_url: {
            url: c.image_url,
            detail: c.detail,
          },
        });
      } else if (typeof c === 'object' && c.type === 'input_file') {
        throw new UserError(`File uploads are not supported for chat completions ${c}`);
      } else {
        throw new UserError(`Unknown content: ${c}`);
      }
    }

    return out;
  }

  static itemsToMessages(items: string | Iterable<TResponseInputItem>): any[] {
    // --- Add Logging ---
    // Convert Iterable to array for reliable logging
    const itemsArray = typeof items === 'string' ? [items] : Array.from(items);
    // --- End Logging ---

    if (typeof items === 'string') {
      return [
        {
          role: 'user',
          content: items || '',
        },
      ];
    }

    const result: any[] = [];
    let currentAssistantMsg: any = null;

    const flushAssistantMessage = () => {
      if (currentAssistantMsg) {
        if (!currentAssistantMsg.tool_calls?.length) {
          delete currentAssistantMsg.tool_calls;
        }
        if (currentAssistantMsg.content || currentAssistantMsg.tool_calls?.length) {
          result.push(currentAssistantMsg);
        }
        currentAssistantMsg = null;
      }
    };

    const ensureAssistantMessage = () => {
      if (!currentAssistantMsg) {
        currentAssistantMsg = { role: 'assistant' };
        currentAssistantMsg.tool_calls = [];
      }
      return currentAssistantMsg;
    };

    for (const item of items) {
      // 1) Check easy input message
      const easyMsg = this.maybeEasyInputMessage(item);
      if (easyMsg) {
        const { role, content } = easyMsg;

        if (role === 'user' && content !== undefined && content !== null) {
          flushAssistantMessage();

          result.push({
            role: 'user',
            content: this.extractAllContent(content) || '',
          });
        } else if (role === 'system') {
          flushAssistantMessage();
          result.push({
            role: 'system',
            content: this.extractTextContent(content) || '',
          });
        } else if (role === 'developer') {
          flushAssistantMessage();
          result.push({
            role: 'developer',
            content: this.extractTextContent(content) || '',
          });
        } else if (role === 'assistant') {
          flushAssistantMessage();
          result.push({
            role: 'assistant',
            content: this.extractTextContent(content) || '',
          });
        } else if (role === 'user') {
          logger.debug(`easyMsg matched user role but content was missing: ${JSON.stringify(item)}`);
          flushAssistantMessage();
        } else {
          throw new UserError(`Unexpected role in easy_input_message: ${role}`);
        }
        continue;
      }

      // 2) Check input message
      const inMsg = this.maybeInputMessage(item);
      if (inMsg) {
        const { role, content } = inMsg;
        flushAssistantMessage();

        if (role === 'user') {
          result.push({
            role: 'user',
            content: this.extractAllContent(content) || '',
          });
        } else if (role === 'system') {
          result.push({
            role: 'system',
            content: this.extractTextContent(content) || '',
          });
        } else if (role === 'developer') {
          result.push({
            role: 'developer',
            content: this.extractTextContent(content) || '',
          });
        } else {
          throw new UserError(`Unexpected role in input_message: ${role}`);
        }
        continue;
      }

      // 3) response output message => assistant
      const respMsg = this.maybeResponseOutputMessage(item);
      if (respMsg) {
        flushAssistantMessage();
        const newAsst: any = { role: 'assistant' };
        const contents = respMsg.content;

        const textSegments: string[] = [];
        for (const c of contents) {
          if (c.type === 'output_text') {
            textSegments.push(c.text);
          } else if (c.type === 'refusal') {
            newAsst.refusal = c.refusal;
          } else if (c.type === 'output_audio') {
            throw new UserError(`Only audio IDs are supported for chat completions, but got: ${c}`);
          } else {
            throw new UserError(`Unknown content type in ResponseOutputMessage: ${c}`);
          }
        }

        if (textSegments.length > 0) {
          newAsst.content = textSegments.join('\n');
        }

        newAsst.tool_calls = [];
        currentAssistantMsg = newAsst;
        continue;
      }

      // 4) function/file-search calls => attach to assistant
      const fileSearch = this.maybeFileSearchCall(item);
      if (fileSearch) {
        const asst = ensureAssistantMessage();
        const toolCalls = [...(asst.tool_calls || [])];
        toolCalls.push({
          id: fileSearch.id,
          type: 'function',
          function: {
            name: 'file_search_call',
            arguments: JSON.stringify({
              queries: fileSearch.queries || [],
              status: fileSearch.status,
            }),
          },
        });
        asst.tool_calls = toolCalls;
        continue;
      }

      const funcCall = this.maybeFunctionToolCall(item);
      if (funcCall) {
        const asst = ensureAssistantMessage();
        const toolCalls = [...(asst.tool_calls || [])];
        toolCalls.push({
          id: funcCall.call_id,
          type: 'function',
          function: {
            name: funcCall.name,
            arguments: funcCall.arguments,
          },
        });
        asst.tool_calls = toolCalls;
        continue;
      }

      // 5) function call output => tool message
      const funcOutput = this.maybeFunctionToolCallOutput(item);
      if (funcOutput) {
        flushAssistantMessage();
        result.push({
          role: 'tool',
          tool_call_id: funcOutput.call_id,
          content: funcOutput.output,
        });
        continue;
      }

      // 6) item reference => handle or raise
      const itemRef = this.maybeItemReference(item);
      if (itemRef) {
        throw new UserError(`Encountered an item_reference, which is not supported: ${itemRef}`);
      }

      // 7) If we haven't recognized it => fail or ignore
      throw new UserError(`Unhandled item type or structure: ${item}`);
    }

    flushAssistantMessage();
    return result;
  }
}

class ToolConverter {
  static toOpenAI(tool: Tool): any {
    if (tool instanceof FunctionTool) {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.params_json_schema,
        },
      };
    }

    throw new UserError(
      `Hosted tools are not supported with the ChatCompletions API. Got tool type: ${typeof tool}, tool: ${tool}`
    );
  }

  static convertHandoffTool(handoff: Handoff<any>): any {
    return {
      type: 'function',
      function: {
        name: handoff.toolName,
        description: handoff.toolDescription,
        parameters: handoff.inputJsonSchema,
      },
    };
  }
}
