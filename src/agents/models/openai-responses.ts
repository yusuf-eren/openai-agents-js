import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { AgentOutputSchema } from '../agent-outputs';
import { Handoff } from '../handoffs';
import {
  ModelResponse,
  TResponseInputItem,
  TResponseStreamEvent,
  TResponseOutputItem,
  ItemHelpers,
} from '../items';
import {
  Tool,
  FunctionTool,
  FileSearchTool,
  WebSearchTool,
  ComputerTool,
} from '../tools';
import { ModelSettings } from './model-settings';
import { Model, ModelTracing, ModelTracingUtils } from './interface';

import { Stream } from 'openai/streaming';
import {
  Response,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseIncludable,
  ResponseStreamEvent,
  ResponseTextConfig,
  Tool as OpenAITool,
} from 'openai/resources/responses/responses';
import { APIPromise } from 'openai/core';

type ResponseAPIResponse =
  | APIPromise<Response>
  | APIPromise<Stream<ResponseStreamEvent>>
  | APIPromise<Stream<ResponseStreamEvent> | Response>
  | APIPromise<Stream<ResponseStreamEvent>>;

const USER_AGENT = `Agents/Node 1.0.0`;
const HEADERS = { 'User-Agent': USER_AGENT };

type IncludeLiteral =
  | 'file_search_call.results'
  | 'message.input_image.image_url'
  | 'computer_call_output.output.image_url';

interface ConvertedTools {
  tools: OpenAITool[];
  includes: IncludeLiteral[];
}

export class Converter {
  static convertToolChoice(
    toolChoice: 'auto' | 'required' | 'none' | string | undefined
  ): ResponseCreateParams['tool_choice'] {
    if (!toolChoice) return 'none';

    switch (toolChoice) {
      case 'auto':
      case 'required':
      case 'none':
        return toolChoice;
      case 'file_search':
        return { type: 'file_search' };
      case 'web_search_preview':
        return { type: 'web_search_preview' };
      case 'computer_use_preview':
        return { type: 'computer_use_preview' };
      default:
        return { type: 'function', name: toolChoice };
    }
  }

  static getResponseFormat(
    outputSchema: AgentOutputSchema | null
  ): ResponseTextConfig | undefined {
    if (!outputSchema || outputSchema.isPlainText()) return undefined;
    return {
      format: zodTextFormat(
        z.object({ response: outputSchema.outputType.outputType }),
        'final_output'
      ),
    };
  }

  static convertTools(
    tools: Tool[],
    handoffs: Handoff<any>[]
  ): { tools: OpenAITool[]; includes: ResponseIncludable[] } {
    const convertedTools: OpenAITool[] = [];
    const includes: ResponseIncludable[] = [];

    const computerTools = tools.filter(
      (tool): tool is ComputerTool => tool instanceof ComputerTool
    );
    if (computerTools.length > 1) {
      throw new Error(
        `Only one computer tool is allowed. Got ${computerTools.length}`
      );
    }

    for (const tool of tools) {
      const { convertedTool, include } = this.convertTool(tool);
      convertedTools.push(convertedTool);
      if (include) includes.push(include);
    }

    for (const handoff of handoffs) {
      convertedTools.push(this.convertHandoffTool(handoff));
    }

    return { tools: convertedTools, includes };
  }

  private static convertTool(tool: Tool): {
    convertedTool: any;
    include: ResponseIncludable | null;
  } {
    if (tool instanceof FunctionTool) {
      const schema = tool.params_json_schema;
      if (schema.type === 'object') {
        schema.additionalProperties = false;
      }
      return {
        convertedTool: {
          type: 'function',
          name: tool.name,
          parameters: schema,
          strict: tool.strict_json_schema,
          description: tool.description ?? '',
        },
        include: null,
      };
    }

    if (tool instanceof WebSearchTool) {
      return {
        convertedTool: {
          type: 'web_search_preview',
          user_location: tool.user_location,
          search_context_size: tool.search_context_size,
        },
        include: null,
      };
    }

    if (tool instanceof FileSearchTool) {
      const convertedTool: any = {
        type: 'file_search',
        vector_store_ids: tool.vector_store_ids,
      };

      if (tool.max_num_results) {
        convertedTool.max_num_results = tool.max_num_results;
      }

      if (tool.ranking_options) {
        convertedTool.ranking_options = tool.ranking_options;
      }

      if (tool.filters) {
        convertedTool.filters = tool.filters;
      }

      return {
        convertedTool,
        include: tool.include_search_results
          ? 'file_search_call.results'
          : null,
      };
    }

    if (tool instanceof ComputerTool) {
      return {
        convertedTool: {
          type: 'computer_use_preview',
          environment: tool.computer.environment,
          display_width: tool.computer.dimensions[0],
          display_height: tool.computer.dimensions[1],
        },
        include: 'computer_call_output.output.image_url',
      };
    }

    throw new Error(`Unknown tool type: ${(tool as any).type}`);
  }

  private static convertHandoffTool(handoff: Handoff<any>): any {
    return {
      name: handoff.toolName,
      parameters: handoff.inputJsonSchema,
      strict: handoff.strictJsonSchema,
      type: 'function',
      description: handoff.toolDescription,
    };
  }
}

export class OpenAIResponsesModel implements Model {
  constructor(private model: string, private client: OpenAI) {}

  private nonNullOrUndefined<T>(value: T | null | undefined): T | undefined {
    return value ?? undefined;
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
    try {
      const response = await this.fetchResponse(
        systemInstructions,
        input,
        modelSettings,
        tools,
        outputSchema,
        handoffs,
        false,
        previousResponseId
      );

      if (!('usage' in response) || !response.usage) {
        throw new Error('Response does not contain usage information');
      }

      const usage = {
        requests: 1,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.total_tokens,
        add(other: any) {
          return {
            requests: this.requests + (other.requests || 0),
            input_tokens: this.input_tokens + (other.input_tokens || 0),
            output_tokens: this.output_tokens + (other.output_tokens || 0),
            total_tokens: this.total_tokens + (other.total_tokens || 0),
            add: this.add,
          };
        },
      };

      const output: TResponseOutputItem[] = [];
      const content = response.output;

      if (content) {
        output.push(ItemHelpers.inputToNewInputList(content)[0]);
      }

      return new ModelResponse(output, usage, response.id);
    } catch (error) {
      console.error('Error getting response:', error);
      throw error;
    }
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
  ): AsyncIterableIterator<TResponseStreamEvent> {
    const stream = await this.fetchResponse(
      systemInstructions,
      input,
      modelSettings,
      tools,
      outputSchema,
      handoffs,
      true,
      previousResponseId
    );

    if (!(stream instanceof Stream)) {
      throw new Error('Expected a Stream but got a non-stream response');
    }

    for await (const chunk of stream) {
      yield chunk as unknown as TResponseStreamEvent;
    }
  }

  private async fetchResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    stream: boolean,
    previousResponseId?: string
  ): Promise<Response | Stream<ResponseStreamEvent>> {
    const listInput = Array.isArray(input)
      ? input
      : [{ type: 'input_text', text: input }];

    const toolChoice = Converter.convertToolChoice(modelSettings.tool_choice);
    const { tools: convertedTools, includes } = Converter.convertTools(
      tools,
      handoffs
    );
    const responseFormat = Converter.getResponseFormat(outputSchema);

    const params:
      | ResponseCreateParamsNonStreaming
      | ResponseCreateParamsStreaming = {
      model: this.model,
      input: listInput,
      include: includes,
      instructions: systemInstructions,
      metadata: modelSettings.metadata,
      tools: [
        // {
        //   type: 'web_search_preview',
        //   user_location: {
        //     type: 'approximate',
        //   },
        //   search_context_size: 'medium',
        // },
        ...convertedTools,
      ],
      tool_choice: toolChoice,
      parallel_tool_calls: modelSettings.parallel_tool_calls ?? undefined,
      temperature: this.nonNullOrUndefined(modelSettings.temperature),
      top_p: this.nonNullOrUndefined(modelSettings.top_p),
      truncation: modelSettings.truncation ?? undefined,
      max_output_tokens: modelSettings.max_tokens ?? undefined,
      stream: stream,
      text: responseFormat,
      store: modelSettings.store ?? undefined,
      reasoning: modelSettings.reasoning ?? null,
      previous_response_id: previousResponseId ?? undefined,
    };

    return this.client.responses.create(params);
  }
}
