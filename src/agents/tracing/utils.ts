import { v4 as uuidv4 } from 'uuid';
import { Span } from './spans';
import { GLOBAL_TRACE_PROVIDER } from './setup';
import { SpanData } from './span-data';

/**
 * Returns the current time in ISO 8601 format.
 */
export function timeIso(): string {
  return new Date().toISOString();
}

/**
 * Generates a new trace ID.
 */
export function genTraceId(): string {
  return `trace_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generates a new span ID.
 */
export function genSpanId(): string {
  return `span_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
}

/**
 * Generates a new group ID.
 */
export function genGroupId(): string {
  return `group_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
}

/**
 * Helper function to handle response spans, similar to Python's context manager.
 * @param spanData The data for the span
 * @param callback The async function to execute within the span
 * @returns The result of the callback function
 */
export async function withResponseSpan<T>(
  spanData: SpanData,
  callback: (span: Span<SpanData>) => Promise<T>
): Promise<T> {
  const span = GLOBAL_TRACE_PROVIDER.createSpan(spanData);
  span.start();
  try {
    return await callback(span);
  } finally {
    span.finish();
  }
}
