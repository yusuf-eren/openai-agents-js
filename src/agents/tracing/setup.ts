import * as os from 'os';
import { logger } from '../logger';
import { genTraceId } from './utils';
import { TracingProcessor } from './processor-interface';
import { Scope } from './scope';
import { NoOpSpan, Span, SpanImpl } from './spans';
import { NoOpTrace, Trace, TraceImpl } from './traces';
import { SpanData } from './span-data';

/**
 * Forwards all calls to a list of TracingProcessors, in order of registration.
 */
export class SynchronousMultiTracingProcessor implements TracingProcessor {
  private _processors: TracingProcessor[] = [];
  private _lock = new Set<string>(); // Simple mutex simulation

  /**
   * Add a processor to the list of processors. Each processor will receive all traces/spans.
   */
  addTracingProcessor(tracingProcessor: TracingProcessor): void {
    const lockId = Date.now().toString();
    while (this._lock.size > 0) {
      // Simple spinlock - in real code use a proper mutex
    }

    this._lock.add(lockId);
    try {
      this._processors = [...this._processors, tracingProcessor];
    } finally {
      this._lock.delete(lockId);
    }
  }

  /**
   * Set the list of processors. This will replace the current list of processors.
   */
  setProcessors(processors: TracingProcessor[]): void {
    const lockId = Date.now().toString();
    while (this._lock.size > 0) {
      // Simple spinlock - in real code use a proper mutex
    }

    this._lock.add(lockId);
    try {
      this._processors = [...processors];
    } finally {
      this._lock.delete(lockId);
    }
  }

  /**
   * Called when a trace is started.
   */
  onTraceStart(trace: Trace): void {
    for (const processor of this._processors) {
      processor.onTraceStart(trace);
    }
  }

  /**
   * Called when a trace is finished.
   */
  onTraceEnd(trace: Trace): void {
    for (const processor of this._processors) {
      processor.onTraceEnd(trace);
    }
  }

  /**
   * Called when a span is started.
   */
  onSpanStart<T extends SpanData>(span: Span<T>): void {
    for (const processor of this._processors) {
      processor.onSpanStart(span);
    }
  }

  /**
   * Called when a span is finished.
   */
  onSpanEnd<T extends SpanData>(span: Span<T>): void {
    for (const processor of this._processors) {
      processor.onSpanEnd(span);
    }
  }

  /**
   * Called when the application stops.
   */
  shutdown(): void {
    for (const processor of this._processors) {
      logger.debug(`Shutting down trace processor ${processor}`);
      processor.shutdown();
    }
  }

  /**
   * Force the processors to flush their buffers.
   */
  force_flush(): void {
    for (const processor of this._processors) {
      processor.forceFlush();
    }
  }

  // Alias for TypeScript naming convention
  forceFlush(): void {
    this.force_flush();
  }
}

/**
 * Provider for creating traces and spans
 */
export class TraceProvider {
  private _multiProcessor: SynchronousMultiTracingProcessor;
  private _disabled: boolean;

  constructor() {
    this._multiProcessor = new SynchronousMultiTracingProcessor();
    this._disabled =
      process.env.OPENAI_AGENTS_DISABLE_TRACING?.toLowerCase() === 'true' ||
      process.env.OPENAI_AGENTS_DISABLE_TRACING === '1';
  }

  /**
   * Add a processor to the list of processors. Each processor will receive all traces/spans.
   */
  registerProcessor(processor: TracingProcessor): void {
    this._multiProcessor.addTracingProcessor(processor);
  }

  /**
   * Set the list of processors. This will replace the current list of processors.
   */
  setProcessors(processors: TracingProcessor[]): void {
    this._multiProcessor.setProcessors(processors);
  }

  /**
   * Returns the currently active trace, if any.
   */
  getCurrentTrace(): Trace | null {
    return Scope.getCurrentTrace();
  }

  /**
   * Returns the currently active span, if any.
   */
  getCurrentSpan(): Span<any> | null {
    return Scope.getCurrentSpan();
  }

  /**
   * Set whether tracing is disabled.
   */
  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
  }

  /**
   * Create a new trace.
   */
  createTrace(
    name: string,
    traceId: string | null = null,
    groupId: string | null = null,
    metadata: Record<string, any> | null = null,
    disabled: boolean = false
  ): Trace {
    if (this._disabled || disabled) {
      logger.debug(`Tracing is disabled. Not creating trace ${name}`);
      return new NoOpTrace();
    }

    traceId = traceId || genTraceId();

    logger.debug(`Creating trace ${name} with id ${traceId}`);

    return new TraceImpl(name, traceId, groupId, metadata, this._multiProcessor);
  }

  /**
   * Create a new span.
   */
  createSpan<T extends SpanData>(
    spanData: T,
    spanId: string | null = null,
    parent: Trace | Span<any> | null = null,
    disabled: boolean = false
  ): Span<T> {
    if (this._disabled || disabled) {
      logger.debug(`Tracing is disabled. Not creating span ${spanData}`);
      return new NoOpSpan(spanData);
    }

    let traceId: string;
    let parentId: string | null = null;

    if (!parent) {
      const currentSpan = Scope.getCurrentSpan();
      const currentTrace = Scope.getCurrentTrace();
      if (currentTrace === null) {
        logger.error('No active trace. Make sure to start a trace with `trace()` first. ' + 'Returning NoOpSpan.');
        return new NoOpSpan(spanData);
      } else if (currentTrace instanceof NoOpTrace || currentSpan instanceof NoOpSpan) {
        logger.debug(`Parent ${currentSpan} or ${currentTrace} is no-op, returning NoOpSpan`);
        return new NoOpSpan(spanData);
      }

      parentId = currentSpan ? currentSpan.spanId : null;
      traceId = currentTrace.traceId;
    } else if (parent instanceof Trace) {
      if (parent instanceof NoOpTrace) {
        logger.debug(`Parent ${parent} is no-op, returning NoOpSpan`);
        return new NoOpSpan(spanData);
      }
      traceId = parent.traceId;
      parentId = null;
    } else {
      // parent is a Span
      if (parent instanceof NoOpSpan) {
        logger.debug(`Parent ${parent} is no-op, returning NoOpSpan`);
        return new NoOpSpan(spanData);
      }
      parentId = parent.spanId;
      traceId = parent.traceId;
    }

    logger.debug(`Creating span ${spanData} with id ${spanId}`);

    return new SpanImpl(traceId, spanId, parentId, this._multiProcessor, spanData);
  }

  /**
   * Shut down the trace provider and all processors.
   */
  shutdown(): void {
    try {
      logger.debug('Shutting down trace provider');
      this._multiProcessor.shutdown();
    } catch (e) {
      logger.error(`Error shutting down trace provider: ${e}`);
    }
  }
}

/**
 * Global trace provider instance
 */
export const GLOBAL_TRACE_PROVIDER = new TraceProvider();
