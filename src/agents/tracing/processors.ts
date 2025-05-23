import { Span } from './spans';
import { Trace } from './traces';
import { TracingExporter, TracingProcessor } from './processor-interface';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { logger } from '../logger';

/**
 * Prints the traces and spans to the console.
 */
export class ConsoleSpanExporter implements TracingExporter {
  export(items: Array<Trace | Span<any>>): void {
    for (const item of items) {
      if (item instanceof Trace) {
        logger.debug(`[Exporter] Export trace_id=${item.traceId}, name=${item.name}`);
      } else {
        logger.debug(`[Exporter] Export span: ${item.export()}`);
      }
    }
  }
}

/**
 * Exports traces and spans to the OpenAI backend.
 */
export class BackendSpanExporter implements TracingExporter {
  private _apiKey: string | null;
  private _organization: string | null;
  private _project: string | null;
  private readonly endpoint: string;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly client: AxiosInstance;

  constructor(
    apiKey: string | null = null,
    organization: string | null = null,
    project: string | null = null,
    endpoint: string = 'https://api.openai.com/v1/traces/ingest',
    maxRetries: number = 3,
    baseDelay: number = 1.0,
    maxDelay: number = 30.0
  ) {
    this._apiKey = apiKey;
    this._organization = organization;
    this._project = project;
    this.endpoint = endpoint;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;

    this.client = axios.create({
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'traces=v1',
      },
    });
  }

  setApiKey(apiKey: string): void {
    this._apiKey = apiKey;
  }

  private get apiKey(): string | undefined {
    return this._apiKey || process.env.OPENAI_API_KEY;
  }

  private get organization(): string | undefined {
    return this._organization || process.env.OPENAI_ORG_ID;
  }

  private get project(): string | undefined {
    return this._project || process.env.OPENAI_PROJECT_ID;
  }

  async export(items: Array<Trace | Span<any>>): Promise<void> {
    if (!items.length) return;

    if (!this.apiKey) {
      logger.warning('OPENAI_API_KEY is not set, skipping trace export');
      return;
    }

    const data = items.map(item => item.export()).filter(Boolean);
    const payload = { data };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'traces=v1',
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

    let attempt = 0;
    let delay = this.baseDelay;

    while (true) {
      attempt++;
      try {
        const response = await this.client.post(this.endpoint, payload, { headers });

        if (response.status < 300) {
          logger.debug(`Exported ${items.length} items`);
          return;
        }

        logger.warning(`[non-fatal] Tracing: server error ${response.status}, retrying.`);
      } catch (error: any) {
        if (error instanceof AxiosError) {
          const errorResponse = error.response;
          if (errorResponse?.status && errorResponse.status >= 400 && errorResponse.status < 500) {
            logger.error(
              `[non-fatal] Tracing client error ${errorResponse.status}: ${JSON.stringify(errorResponse.data, null, 2)}`
            );
            return;
          }
        }
        logger.error(`[non-fatal] Tracing: request failed: ${JSON.stringify(error)}`);
      }

      if (attempt >= this.maxRetries) {
        logger.error('[non-fatal] Tracing: max retries reached, giving up on this batch.');
        return;
      }

      const sleepTime = delay + Math.random() * 0.1 * delay;
      await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
      delay = Math.min(delay * 2, this.maxDelay);
    }
  }

  close(): void {
    // Axios doesn't need explicit cleanup, but you can add any necessary cleanup here
    // It is a Python library implementation, so I'm leaving there empty. Maybe we need at some point idk
  }
}

/**
 * Processes traces and spans in batches.
 */
export class BatchTraceProcessor implements TracingProcessor {
  private readonly exporter: TracingExporter;
  private readonly queue: Array<Trace | Span<any>> = [];
  private readonly maxQueueSize: number;
  private readonly maxBatchSize: number;
  private readonly scheduleDelay: number;
  private readonly exportTriggerSize: number;
  private nextExportTime: number;
  private isShutdown: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    exporter: TracingExporter,
    maxQueueSize: number = 8192,
    maxBatchSize: number = 128,
    scheduleDelay: number = 5.0,
    exportTriggerRatio: number = 0.7
  ) {
    this.exporter = exporter;
    this.maxQueueSize = maxQueueSize;
    this.maxBatchSize = maxBatchSize;
    this.scheduleDelay = scheduleDelay;
    this.exportTriggerSize = Math.floor(maxQueueSize * exportTriggerRatio);
    this.nextExportTime = Date.now() + scheduleDelay * 1000;

    this.startProcessing();
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => this.processQueue(), 200);
  }

  onTraceStart(trace: Trace): void {
    if (this.queue.length < this.maxQueueSize) {
      this.queue.push(trace);
    } else {
      logger.warning('Queue is full, dropping trace.');
    }
  }

  onTraceEnd(trace: Trace): void {
    // We send traces via onTraceStart
  }

  onSpanStart(span: Span<any>): void {
    // We send spans via onSpanEnd
  }

  onSpanEnd(span: Span<any>): void {
    if (this.queue.length < this.maxQueueSize) {
      this.queue.push(span);
    } else {
      logger.warning('Queue is full, dropping span.');
    }
  }

  shutdown(): void {
    this.isShutdown = true;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    this.forceFlush();
  }

  forceFlush(): void {
    this.exportBatches(true);
  }

  private processQueue(): void {
    const currentTime = Date.now();
    const queueSize = this.queue.length;

    if (currentTime >= this.nextExportTime || queueSize >= this.exportTriggerSize) {
      this.exportBatches(false);
      this.nextExportTime = Date.now() + this.scheduleDelay * 1000;
    }
  }

  private exportBatches(force: boolean = false): void {
    while (true) {
      const itemsToExport: Array<Span<any> | Trace> = [];

      while (this.queue.length > 0 && (force || itemsToExport.length < this.maxBatchSize)) {
        const item = this.queue.shift();
        if (item) {
          itemsToExport.push(item);
        }
      }

      if (itemsToExport.length === 0) {
        break;
      }

      this.exporter.export(itemsToExport);
    }
  }
}

// Create shared global instances
const globalExporter = new BackendSpanExporter();
const globalProcessor = new BatchTraceProcessor(globalExporter);

export function defaultExporter(): BackendSpanExporter {
  return globalExporter;
}

export function defaultProcessor(): BatchTraceProcessor {
  return globalProcessor;
}
