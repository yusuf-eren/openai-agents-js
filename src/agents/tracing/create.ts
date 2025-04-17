import { Response } from 'openai/resources/responses/responses';
import { logger } from '../logger';
import { GLOBAL_TRACE_PROVIDER } from './setup';
import {
  AgentSpanData,
  CustomSpanData,
  FunctionSpanData,
  GenerationSpanData,
  GuardrailSpanData,
  HandoffSpanData,
  MCPListToolsSpanData,
  ResponseSpanData,
  SpeechGroupSpanData,
  SpeechSpanData,
  TranscriptionSpanData,
} from './span-data';
import { Span } from './spans';
import { Trace } from './traces';

/**
 * Create a new trace. The trace will not be started automatically; you should either use
 * it as a context manager (`with trace(...):`) or call `trace.start()` + `trace.finish()`
 * manually.
 *
 * In addition to the workflow name and optional grouping identifier, you can provide
 * an arbitrary metadata dictionary to attach additional user-defined information to
 * the trace.
 *
 * @param workflowName - The name of the logical app or workflow. For example, you might provide
 * "code_bot" for a coding agent, or "customer_support_agent" for a customer support agent.
 * @param traceId - The ID of the trace. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genTraceId()` to generate a trace ID, to guarantee that IDs are
 * correctly formatted.
 * @param groupId - Optional grouping identifier to link multiple traces from the same conversation
 * or process. For instance, you might use a chat thread ID.
 * @param metadata - Optional dictionary of additional metadata to attach to the trace.
 * @param disabled - If True, we will return a Trace but the Trace will not be recorded. This will
 * not be checked if there's an existing trace and `even_if_trace_running` is True.
 * @returns The newly created trace object.
 */
export function trace(
  workflowName: string,
  traceId: string | null = null,
  groupId: string | null = null,
  metadata: Record<string, any> | null = null,
  disabled: boolean = false
): Trace {
  const currentTrace = GLOBAL_TRACE_PROVIDER.getCurrentTrace();
  if (currentTrace) {
    logger.warning(
      'Trace already exists. Creating a new trace, but this is probably a mistake.'
    );
  }

  return GLOBAL_TRACE_PROVIDER.createTrace(
    workflowName,
    traceId,
    groupId,
    metadata,
    disabled
  );
}

/**
 * Returns the currently active trace, if present.
 */
export function getCurrentTrace(): Trace | null {
  return GLOBAL_TRACE_PROVIDER.getCurrentTrace();
}

/**
 * Returns the currently active span, if present.
 */
export function getCurrentSpan(): Span<any> | null {
  return GLOBAL_TRACE_PROVIDER.getCurrentSpan();
}

/**
 * Create a new agent span. The span will not be started automatically, you should either do
 * `with agent_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param name - The name of the agent.
 * @param handoffs - Optional list of agent names to which this agent could hand off control.
 * @param tools - Optional list of tool names available to this agent.
 * @param outputType - Optional name of the output type produced by the agent.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created agent span.
 */
export function agentSpan(
  name: string,
  handoffs: string[] | null = null,
  tools: string[] | null = null,
  outputType: string | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<AgentSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new AgentSpanData(name, handoffs, tools, outputType),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new function span. The span will not be started automatically, you should either do
 * `with function_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param name - The name of the function.
 * @param input - The input to the function.
 * @param output - The output of the function.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created function span.
 */
export function functionSpan(
  name: string,
  input: string | null = null,
  output: any | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<FunctionSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new FunctionSpanData(name, input, output),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new generation span. The span will not be started automatically, you should either
 * do `with generation_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * This span captures the details of a model generation, including the
 * input message sequence, any generated outputs, the model name and
 * configuration, and usage data. If you only need to capture a model
 * response identifier, use `responseSpan()` instead.
 *
 * @param input - The sequence of input messages sent to the model.
 * @param output - The sequence of output messages received from the model.
 * @param model - The model identifier used for the generation.
 * @param modelConfig - The model configuration (hyperparameters) used.
 * @param usage - A dictionary of usage information (input tokens, output tokens, etc.).
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created generation span.
 */
export function generationSpan(
  input: Array<Record<string, any>> | null = null,
  output: Array<Record<string, any>> | null = null,
  model: string | null = null,
  modelConfig: Record<string, any> | null = null,
  usage: Record<string, any> | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<GenerationSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new GenerationSpanData(input, output, model, modelConfig, usage),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new response span. The span will not be started automatically, you should either do
 * `with response_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param response - The OpenAI Response object.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created response span.
 */
export function responseSpan(
  response: Response | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<ResponseSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new ResponseSpanData(response),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new handoff span. The span will not be started automatically, you should either do
 * `with handoff_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param fromAgent - The name of the agent that is handing off.
 * @param toAgent - The name of the agent that is receiving the handoff.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created handoff span.
 */
export function handoffSpan(
  fromAgent: string | null = null,
  toAgent: string | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<HandoffSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new HandoffSpanData(fromAgent, toAgent),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new custom span, to which you can add your own metadata. The span will not be
 * started automatically, you should either do `with custom_span() ...` or call
 * `span.start()` + `span.finish()` manually.
 *
 * @param name - The name of the custom span.
 * @param data - Arbitrary structured data to associate with the span.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created custom span.
 */
export function customSpan(
  name: string,
  data: Record<string, any> | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<CustomSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new CustomSpanData(name, data || {}),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new guardrail span. The span will not be started automatically, you should either
 * do `with guardrail_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param name - The name of the guardrail.
 * @param triggered - Whether the guardrail was triggered.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created guardrail span.
 */
export function guardrailSpan(
  name: string,
  triggered: boolean = false,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<GuardrailSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new GuardrailSpanData(name, triggered),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new transcription span. The span will not be started automatically, you should
 * either do `with transcription_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param model - The name of the model used for the speech-to-text.
 * @param input - The audio input of the speech-to-text transcription, as a base64 encoded string of
 * audio bytes.
 * @param inputFormat - The format of the audio input (defaults to "pcm").
 * @param output - The output of the speech-to-text transcription.
 * @param modelConfig - The model configuration (hyperparameters) used.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created speech-to-text span.
 */
export function transcriptionSpan(
  model: string | null = null,
  input: string | null = null,
  inputFormat: string | null = 'pcm',
  output: string | null = null,
  modelConfig: Record<string, any> | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<TranscriptionSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new TranscriptionSpanData(input, inputFormat, output, model, modelConfig),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new speech span. The span will not be started automatically, you should either do
 * `with speech_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param model - The name of the model used for the text-to-speech.
 * @param input - The text input of the text-to-speech.
 * @param output - The audio output of the text-to-speech as base64 encoded string of PCM audio bytes.
 * @param outputFormat - The format of the audio output (defaults to "pcm").
 * @param modelConfig - The model configuration (hyperparameters) used.
 * @param firstContentAt - The time of the first byte of the audio output.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created speech span.
 */
export function speechSpan(
  model: string | null = null,
  input: string | null = null,
  output: string | null = null,
  outputFormat: string | null = 'pcm',
  modelConfig: Record<string, any> | null = null,
  firstContentAt: string | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<SpeechSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new SpeechSpanData(
      input,
      output,
      outputFormat,
      model,
      modelConfig,
      firstContentAt
    ),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new speech group span. The span will not be started automatically, you should
 * either do `with speech_group_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param input - The input text used for the speech request.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created speech group span.
 */
export function speechGroupSpan(
  input: string | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<SpeechGroupSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new SpeechGroupSpanData(input),
    spanId,
    parent,
    disabled
  );
}

/**
 * Create a new MCP list tools span. The span will not be started automatically, you should
 * either do `with mcp_tools_span() ...` or call `span.start()` + `span.finish()` manually.
 *
 * @param server - The name of the MCP server.
 * @param result - The result of the MCP list tools call.
 * @param spanId - The ID of the span. Optional. If not provided, we will generate an ID. We
 * recommend using `util.genSpanId()` to generate a span ID, to guarantee that IDs are
 * correctly formatted.
 * @param parent - The parent span or trace. If not provided, we will automatically use the current
 * trace/span as the parent.
 * @param disabled - If True, we will return a Span but the Span will not be recorded.
 * @returns The newly created MCP list tools span.
 */
export function mcpToolsSpan(
  server: string | null = null,
  result: string[] | null = null,
  spanId: string | null = null,
  parent: Trace | Span<any> | null = null,
  disabled: boolean = false
): Span<MCPListToolsSpanData> {
  return GLOBAL_TRACE_PROVIDER.createSpan(
    new MCPListToolsSpanData(server, result),
    spanId,
    parent,
    disabled
  );
}
