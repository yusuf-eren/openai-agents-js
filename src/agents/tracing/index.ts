export * from './create';
export * from './span-data';
export * from './spans';
export * from './traces';
export * from './context-vars';
export * from './processor-interface';
export * from './scope';
export * from './utils';
export * from './setup';
export * from './processors';

import { TracingProcessor } from './processor-interface';
import { defaultExporter, defaultProcessor } from './processors';
import { GLOBAL_TRACE_PROVIDER } from './setup';

/**
 * Adds a new trace processor. This processor will receive all traces/spans.
 */
export function addTraceProcessor(spanProcessor: TracingProcessor): void {
  GLOBAL_TRACE_PROVIDER.registerProcessor(spanProcessor);
}

/**
 * Set the list of trace processors. This will replace the current list of processors.
 */
export function setTraceProcessors(processors: TracingProcessor[]): void {
  GLOBAL_TRACE_PROVIDER.setProcessors(processors);
}

/**
 * Set whether tracing is globally disabled.
 */
export function setTracingDisabled(disabled: boolean): void {
  GLOBAL_TRACE_PROVIDER.setDisabled(disabled);
}

/**
 * Set the OpenAI API key for the backend exporter.
 */
export function setTracingExportApiKey(apiKey: string): void {
  defaultExporter().setApiKey(apiKey);
}

// Add the default processor, which exports traces and spans to the backend in batches.
// You can change the default behavior by either:
// 1. calling addTraceProcessor(), which adds additional processors, or
// 2. calling setTraceProcessors(), which replaces the default processor.
addTraceProcessor(defaultProcessor());

/**
 * Shutdown the trace provider when the process is terminated.
 */
process.on('SIGTERM', () => {
  GLOBAL_TRACE_PROVIDER.shutdown();
});

/**
 * Shutdown the trace provider when the process is interrupted.
 */
process.on('SIGINT', () => {
  GLOBAL_TRACE_PROVIDER.shutdown();
});
