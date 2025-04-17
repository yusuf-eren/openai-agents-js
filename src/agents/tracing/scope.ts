import { ContextVar, Token } from './context-vars';
import { logger } from '../logger';
import { Span } from './spans';
import { Trace } from './traces';

// Holds the current active span
const _currentSpan = new ContextVar<Span<any> | null>('current_span', null);

// Holds the current active trace
const _currentTrace = new ContextVar<Trace | null>('current_trace', null);

/**
 * Manages the current trace and span context
 */
export class Scope {
  /**
   * Get the current span, if any
   */
  static getCurrentSpan(): Span<any> | null {
    return _currentSpan.get() ?? null;
  }

  /**
   * Set the current span
   * @param span The span to set as current
   * @returns A token that can be used to reset the current span
   */
  static setCurrentSpan(
    span: Span<any> | null
  ): Token<Span<any> | null | undefined> {
    return _currentSpan.set(span ?? null);
  }

  /**
   * Reset the current span using a token from a previous setCurrentSpan() call
   * @param token The token from a previous setCurrentSpan() call
   */
  static resetCurrentSpan(token: Token<Span<any> | null | undefined>): void {
    _currentSpan.reset(token);
  }

  /**
   * Get the current trace, if any
   */
  static getCurrentTrace(): Trace | null {
    return _currentTrace.get() ?? null;
  }

  /**
   * Set the current trace
   * @param trace The trace to set as current
   * @returns A token that can be used to reset the current trace
   */
  static setCurrentTrace(trace: Trace | null): Token<Trace | null | undefined> {
    logger.debug(`Setting current trace: ${trace ? trace.traceId : null}`);
    return _currentTrace.set(trace);
  }

  /**
   * Reset the current trace using a token from a previous setCurrentTrace() call
   * @param token The token from a previous setCurrentTrace() call
   */
  static resetCurrentTrace(token: Token<Trace | null>): void {
    logger.debug('Resetting current trace');
    _currentTrace.reset(token);
  }
}
