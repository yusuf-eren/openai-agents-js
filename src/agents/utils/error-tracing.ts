import { logger } from '../logger';
import { Span, SpanError, getCurrentSpan } from '../tracing';

/**
 * Attaches an error to a specific span
 *
 * @param span The span to attach the error to
 * @param error The error to attach
 */
export function attachErrorToSpan<T>(span: Span<any>, error: SpanError): void {
  span.setError(error);
}

/**
 * Attaches an error to the current span if one exists
 *
 * @param error The error to attach
 */
export function attachErrorToCurrentSpan(error: SpanError): void {
  const span = getCurrentSpan();
  if (span) {
    attachErrorToSpan(span, error);
  } else {
    logger.warning(`No span to add error ${error} to`);
  }
}
