import { Span } from './spans';
import { Trace } from './traces';

/**
 * Interface for processing spans.
 */
export interface TracingProcessor {
  /**
   * Called when a trace is started.
   *
   * @param trace - The trace that started.
   */
  onTraceStart(trace: Trace): void;

  /**
   * Called when a trace is finished.
   *
   * @param trace - The trace that started.
   */
  onTraceEnd(trace: Trace): void;

  /**
   * Called when a span is started.
   *
   * @param span - The span that started.
   */
  onSpanStart(span: Span<any>): void;

  /**
   * Called when a span is finished. Should not block or raise exceptions.
   *
   * @param span - The span that finished.
   */
  onSpanEnd(span: Span<any>): void;

  /**
   * Called when the application stops.
   */
  shutdown(): void;

  /**
   * Forces an immediate flush of all queued spans/traces.
   */
  forceFlush(): void;
}

/**
 * Exports traces and spans. For example, could log them or send them to a backend.
 */
export interface TracingExporter {
  /**
   * Exports a list of traces and spans.
   *
   * @param items - The items to export.
   */
  export(items: Array<Trace | Span<any>>): void;
}
