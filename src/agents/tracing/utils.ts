import { v4 as uuidv4 } from 'uuid';

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
