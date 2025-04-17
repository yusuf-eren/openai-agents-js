import {
  Response,
  ResponseInputItem,
} from 'openai/resources/responses/responses';

/**
 * Base abstract class for span data
 */
export abstract class SpanData {
  /**
   * Export span data as a plain object
   */
  abstract export(): Record<string, any>;

  /**
   * Type of the span data
   */
  abstract get type(): string;
}

/**
 * Span data for agent spans
 */
export class AgentSpanData extends SpanData {
  constructor(
    public name: string,
    public handoffs: string[] | null = null,
    public tools: string[] | null = null,
    public outputType: string | null = null
  ) {
    super();
  }

  get type(): string {
    return 'agent';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      name: this.name,
      handoffs: this.handoffs,
      tools: this.tools,
      output_type: this.outputType,
    };
  }
}

/**
 * Span data for function spans
 */
export class FunctionSpanData extends SpanData {
  constructor(
    public name: string,
    public input: string | null,
    public output: any | null,
    public mcpData: Record<string, any> | null = null
  ) {
    super();
  }

  get type(): string {
    return 'function';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      name: this.name,
      input: this.input,
      output: this.output ? String(this.output) : null,
      mcp_data: this.mcpData,
    };
  }
}

/**
 * Span data for generation spans
 */
export class GenerationSpanData extends SpanData {
  constructor(
    public input: Array<Record<string, any>> | null = null,
    public output: Array<Record<string, any>> | null = null,
    public model: string | null = null,
    public modelConfig: Record<string, any> | null = null,
    public usage: Record<string, any> | null = null
  ) {
    super();
  }

  get type(): string {
    return 'generation';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      input: this.input,
      output: this.output,
      model: this.model,
      model_config: this.modelConfig,
      usage: this.usage,
    };
  }
}

/**
 * Span data for response spans
 */
export class ResponseSpanData extends SpanData {
  constructor(
    public response: Response | null = null,
    public input: string | ResponseInputItem[] | null = null
  ) {
    super();
  }

  get type(): string {
    return 'response';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      response_id: this.response?.id || null,
    };
  }
}

/**
 * Span data for handoff spans
 */
export class HandoffSpanData extends SpanData {
  constructor(public fromAgent: string | null, public toAgent: string | null) {
    super();
  }

  get type(): string {
    return 'handoff';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      from_agent: this.fromAgent,
      to_agent: this.toAgent,
    };
  }
}

/**
 * Span data for custom spans
 */
export class CustomSpanData extends SpanData {
  constructor(public name: string, public data: Record<string, any>) {
    super();
  }

  get type(): string {
    return 'custom';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      name: this.name,
      data: this.data,
    };
  }
}

/**
 * Span data for guardrail spans
 */
export class GuardrailSpanData extends SpanData {
  constructor(public name: string, public triggered: boolean = false) {
    super();
  }

  get type(): string {
    return 'guardrail';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      name: this.name,
      triggered: this.triggered,
    };
  }
}

/**
 * Span data for transcription spans
 */
export class TranscriptionSpanData extends SpanData {
  constructor(
    public input: string | null = null,
    public inputFormat: string | null = 'pcm',
    public output: string | null = null,
    public model: string | null = null,
    public modelConfig: Record<string, any> | null = null
  ) {
    super();
  }

  get type(): string {
    return 'transcription';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      input: {
        data: this.input || '',
        format: this.inputFormat,
      },
      output: this.output,
      model: this.model,
      model_config: this.modelConfig,
    };
  }
}

/**
 * Span data for speech spans
 */
export class SpeechSpanData extends SpanData {
  constructor(
    public input: string | null = null,
    public output: string | null = null,
    public outputFormat: string | null = 'pcm',
    public model: string | null = null,
    public modelConfig: Record<string, any> | null = null,
    public firstContentAt: string | null = null
  ) {
    super();
  }

  get type(): string {
    return 'speech';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      input: this.input,
      output: {
        data: this.output || '',
        format: this.outputFormat,
      },
      model: this.model,
      model_config: this.modelConfig,
      first_content_at: this.firstContentAt,
    };
  }
}

/**
 * Span data for speech group spans
 */
export class SpeechGroupSpanData extends SpanData {
  constructor(public input: string | null = null) {
    super();
  }

  get type(): string {
    return 'speech-group';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      input: this.input,
    };
  }
}

/**
 * Span data for MCP list tools spans
 */
export class MCPListToolsSpanData extends SpanData {
  constructor(
    public server: string | null = null,
    public result: string[] | null = null
  ) {
    super();
  }

  get type(): string {
    return 'mcp_tools';
  }

  export(): Record<string, any> {
    return {
      type: this.type,
      server: this.server,
      result: this.result,
    };
  }
}
