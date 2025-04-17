import { logger } from '../logger';
import { Scope } from './scope';
import { SpanData } from './span-data';
import { TracingProcessor } from './processor-interface';
import { timeIso, genSpanId } from './utils';
import { Token } from './context-vars';

/**
 * Error information for a span
 */
export class SpanError {
  message: string;
  data: Record<string, any> | null;

  constructor(params: { message: string; data: Record<string, any> | null }) {
    this.message = params.message;
    this.data = params.data;
  }
}

/**
 * Base abstract interface for spans
 */
export abstract class Span<TSpanData extends SpanData> {
  /**
   * The trace ID of the span
   */
  abstract get traceId(): string;

  /**
   * The span ID
   */
  abstract get spanId(): string;

  /**
   * The span data
   */
  abstract get spanData(): TSpanData;

  /**
   * The parent span ID, if any
   */
  abstract get parentId(): string | null;

  /**
   * Start the span
   * @param markAsCurrent - Whether to mark this span as the current span
   */
  abstract start(markAsCurrent?: boolean): void;

  /**
   * Finish the span
   * @param resetCurrent - Whether to reset the current span
   */
  abstract finish(resetCurrent?: boolean): void;

  /**
   * Set an error on the span
   * @param error - The error information
   */
  abstract setError(error: SpanError): void;

  /**
   * Get the error on the span, if any
   */
  abstract get error(): SpanError | null;

  /**
   * Export the span as a plain object
   */
  abstract export(): Record<string, any> | null;

  /**
   * The time the span was started, as an ISO string
   */
  abstract get startedAt(): string | null;

  /**
   * The time the span was ended, as an ISO string
   */
  abstract get endedAt(): string | null;

  /**
   * Use the span as a context manager
   */
  abstract __enter__(): Span<TSpanData>;

  /**
   * Exit the context manager
   */
  abstract __exit__(excType: any, excVal: any, excTb: any): void;
}

/**
 * No-op implementation of a span
 */
export class NoOpSpan<TSpanData extends SpanData> implements Span<TSpanData> {
  private _spanData: TSpanData;
  private _prevSpanToken: Token<Span<any> | null | undefined> | null = null;

  constructor(spanData: TSpanData) {
    this._spanData = spanData;
  }

  get traceId(): string {
    return 'no-op';
  }

  get spanId(): string {
    return 'no-op';
  }

  get spanData(): TSpanData {
    return this._spanData;
  }

  get parentId(): string | null {
    return null;
  }

  start(markAsCurrent: boolean = false): void {
    if (markAsCurrent) {
      this._prevSpanToken = Scope.setCurrentSpan(this);
    }
  }

  finish(resetCurrent: boolean = false): void {
    if (resetCurrent && this._prevSpanToken !== null) {
      Scope.resetCurrentSpan(this._prevSpanToken);
      this._prevSpanToken = null;
    }
  }

  __enter__(): Span<TSpanData> {
    this.start(true);
    return this;
  }

  __exit__(excType: any, excVal: any, excTb: any): void {
    let resetCurrent = true;
    if (excType === 'GeneratorExit') {
      logger.debug('GeneratorExit, skipping span reset');
      resetCurrent = false;
    }

    this.finish(resetCurrent);
  }

  setError(error: SpanError): void {
    // No-op
  }

  get error(): SpanError | null {
    return null;
  }

  export(): Record<string, any> | null {
    return null;
  }

  get startedAt(): string | null {
    return null;
  }

  get endedAt(): string | null {
    return null;
  }
}

/**
 * Implementation of a span
 */
export class SpanImpl<TSpanData extends SpanData> implements Span<TSpanData> {
  private _traceId: string;
  private _spanId: string;
  private _parentId: string | null;
  private _startedAt: string | null = null;
  private _endedAt: string | null = null;
  private _error: SpanError | null = null;
  private _prevSpanToken: Token<Span<any> | null | undefined> | null = null;
  private _processor: TracingProcessor;
  private _spanData: TSpanData;

  constructor(
    traceId: string,
    spanId: string | null,
    parentId: string | null,
    processor: TracingProcessor,
    spanData: TSpanData
  ) {
    this._traceId = traceId;
    this._spanId = spanId || genSpanId();
    this._parentId = parentId;
    this._processor = processor;
    this._spanData = spanData;
  }

  get traceId(): string {
    return this._traceId;
  }

  get spanId(): string {
    return this._spanId;
  }

  get spanData(): TSpanData {
    return this._spanData;
  }

  get parentId(): string | null {
    return this._parentId;
  }

  start(markAsCurrent: boolean = false): void {
    if (this.startedAt !== null) {
      logger.warning('Span already started');
      return;
    }

    this._startedAt = timeIso();
    this._processor.onSpanStart(this);
    if (markAsCurrent) {
      this._prevSpanToken = Scope.setCurrentSpan(this);
    }
  }

  finish(resetCurrent: boolean = false): void {
    if (this.endedAt !== null) {
      logger.warning('Span already finished');
      return;
    }

    this._endedAt = timeIso();
    this._processor.onSpanEnd(this);
    if (resetCurrent && this._prevSpanToken !== null) {
      Scope.resetCurrentSpan(this._prevSpanToken);
      this._prevSpanToken = null;
    }
  }

  __enter__(): Span<TSpanData> {
    this.start(true);
    return this;
  }

  __exit__(excType: any, excVal: any, excTb: any): void {
    let resetCurrent = true;
    if (excType === 'GeneratorExit') {
      logger.debug('GeneratorExit, skipping span reset');
      resetCurrent = false;
    }

    this.finish(resetCurrent);
  }

  setError(error: SpanError): void {
    this._error = error;
  }

  get error(): SpanError | null {
    return this._error;
  }

  get startedAt(): string | null {
    return this._startedAt;
  }

  get endedAt(): string | null {
    return this._endedAt;
  }

  export(): Record<string, any> | null {
    return {
      object: 'trace.span',
      id: this.spanId,
      trace_id: this.traceId,
      parent_id: this._parentId,
      started_at: this._startedAt,
      ended_at: this._endedAt,
      span_data: this.spanData.export(),
      error: this._error,
    };
  }
}
