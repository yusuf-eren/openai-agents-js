import { AgentOutputSchema } from '../agent-outputs';
import { Handoff } from '../handoffs';
import {
  ModelResponse,
  TResponseInputItem,
  TResponseStreamEvent,
} from '../items';
import { Tool } from '../tools';
import { ModelSettings } from './model-settings';

ModelResponse;
/**
 * Controls how model tracing is configured.
 */
export enum ModelTracing {
  /**
   * Tracing is disabled entirely.
   */
  DISABLED = 0,

  /**
   * Tracing is enabled, and all data is included.
   */
  ENABLED = 1,

  /**
   * Tracing is enabled, but inputs/outputs are not included.
   */
  ENABLED_WITHOUT_DATA = 2,
}

/**
 * Abstract class for ModelTracing utilities.
 */
export abstract class ModelTracingUtils {
  /**
   * Check if tracing is disabled
   */
  static isDisabled(tracing: ModelTracing): boolean {
    return tracing === ModelTracing.DISABLED;
  }

  /**
   * Check if data should be included in traces
   */
  static includeData(tracing: ModelTracing): boolean {
    return tracing === ModelTracing.ENABLED;
  }
}

/**
 * The base interface for calling an LLM.
 */
export abstract class Model {
  /**
   * Get a response from the model.
   *
   * @param systemInstructions - The system instructions to use
   * @param input - The input items to the model, in OpenAI Responses format
   * @param modelSettings - The model settings to use
   * @param tools - The tools available to the model
   * @param outputSchema - The output schema to use
   * @param handoffs - The handoffs available to the model
   * @param tracing - Tracing configuration
   * @returns The full model response
   */
  abstract getResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    tracing: ModelTracing,
    previousResponseId?: string
  ): Promise<ModelResponse>;

  /**
   * Stream a response from the model.
   *
   * @param systemInstructions - The system instructions to use
   * @param input - The input items to the model, in OpenAI Responses format
   * @param modelSettings - The model settings to use
   * @param tools - The tools available to the model
   * @param outputSchema - The output schema to use
   * @param handoffs - The handoffs available to the model
   * @param tracing - Tracing configuration
   * @returns An async iterator of response stream events, in OpenAI Responses format
   */
  abstract streamResponse(
    systemInstructions: string | null,
    input: string | TResponseInputItem[],
    modelSettings: ModelSettings,
    tools: Tool[],
    outputSchema: AgentOutputSchema | null,
    handoffs: Handoff<any>[],
    tracing: ModelTracing,
    previousResponseId?: string
  ): AsyncIterableIterator<TResponseStreamEvent>;
}

/**
 * The base interface for a model provider.
 *
 * Model provider is responsible for looking up Models by name.
 */
export abstract class ModelProvider {
  /**
   * Get a model by name.
   *
   * @param modelName - The name of the model to get
   * @returns The model instance
   */
  abstract getModel(modelName: string | null): Model;
}
