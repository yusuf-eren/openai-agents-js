import { Token } from './context-vars';
import { logger } from '../logger';
import { TracingProcessor } from './processor-interface';
import { Scope } from './scope';
import { genTraceId } from './utils';

/**
 * A trace is the root level object that tracing creates. It represents a logical "workflow".
 */
export abstract class Trace {
  /**
   * Start the trace.
   *
   * @param markAsCurrent - If true, the trace will be marked as the current trace.
   */
  abstract start(markAsCurrent?: boolean): void;

  /**
   * Finish the trace.
   *
   * @param resetCurrent - If true, the trace will be reset as the current trace.
   */
  abstract finish(resetCurrent?: boolean): void;

  /**
   * The trace ID.
   */
  abstract get traceId(): string;

  /**
   * The name of the workflow being traced.
   */
  abstract get name(): string;

  /**
   * Export the trace as a dictionary.
   */
  abstract export(): Record<string, any> | null;

  /**
   * Use the trace as a context manager
   */
  abstract __enter__(): Trace;

  /**
   * Exit the context manager
   */
  abstract __exit__(excType: any, excVal: any, excTb: any): void;
}

/**
 * A no-op trace that will not be recorded.
 */
export class NoOpTrace implements Trace {
  private _started: boolean = false;
  private _prevContextToken: Token<Trace | null | undefined> | null = null;

  __enter__(): Trace {
    if (this._started) {
      if (!this._prevContextToken) {
        logger.error('Trace already started but no context token set');
      }
      return this;
    }

    this._started = true;
    this.start(true);

    return this;
  }

  __exit__(excType: any, excVal: any, excTb: any): void {
    this.finish(true);
  }

  start(markAsCurrent: boolean = false): void {
    if (markAsCurrent) {
      this._prevContextToken = Scope.setCurrentTrace(this);
    }
  }

  finish(resetCurrent: boolean = false): void {
    if (resetCurrent && this._prevContextToken !== null) {
      Scope.resetCurrentTrace(this._prevContextToken as Token<Trace | null>);
      this._prevContextToken = null;
    }
  }

  get traceId(): string {
    return 'no-op';
  }

  get name(): string {
    return 'no-op';
  }

  export(): Record<string, any> | null {
    return null;
  }
}

/**
 * Global no-op trace instance
 */
export const NO_OP_TRACE = new NoOpTrace();

/**
 * A trace that will be recorded by the tracing library.
 */
export class TraceImpl implements Trace {
  private _name: string;
  private _traceId: string;
  public groupId: string | null;
  public metadata: Record<string, any> | null;
  private _prevContextToken: Token<Trace | null | undefined> | null = null;
  private _processor: TracingProcessor;
  private _started: boolean = false;

  constructor(
    name: string,
    traceId: string | null,
    groupId: string | null,
    metadata: Record<string, any> | null,
    processor: TracingProcessor
  ) {
    this._name = name;
    this._traceId = traceId || genTraceId();
    this.groupId = groupId;
    this.metadata = metadata;
    this._processor = processor;
  }

  get traceId(): string {
    return this._traceId;
  }

  get name(): string {
    return this._name;
  }

  start(markAsCurrent: boolean = false): void {
    if (this._started) {
      return;
    }

    this._started = true;
    this._processor.onTraceStart(this);

    if (markAsCurrent) {
      this._prevContextToken = Scope.setCurrentTrace(this);
    }
  }

  finish(resetCurrent: boolean = false): void {
    if (!this._started) {
      return;
    }

    this._processor.onTraceEnd(this);

    if (resetCurrent && this._prevContextToken !== null) {
      Scope.resetCurrentTrace(this._prevContextToken as Token<Trace | null>);
      this._prevContextToken = null;
    }
  }

  __enter__(): Trace {
    if (this._started) {
      if (!this._prevContextToken) {
        logger.error('Trace already started but no context token set');
      }
      return this;
    }

    this.start(true);
    return this;
  }

  __exit__(excType: any, excVal: any, excTb: any): void {
    this.finish(excType !== 'GeneratorExit');
  }

  export(): Record<string, any> | null {
    return {
      object: 'trace',
      id: this.traceId,
      workflow_name: this.name,
      group_id: this.groupId,
      metadata: this.metadata,
    };
  }
}
