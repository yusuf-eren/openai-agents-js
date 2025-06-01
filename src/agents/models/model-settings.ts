import { Reasoning } from 'openai/resources/shared';
/**
 * Specifies how tools should be chosen by the model.
 * - 'auto': Model decides when to use tools
 * - 'required': Model must use a tool
 * - 'none': Model cannot use tools
 */
type ToolChoice = 'auto' | 'required' | 'none';

/**
 * Settings to use when calling an LLM.
 *
 * This class holds optional model configuration parameters (e.g. temperature,
 * top_p, penalties, truncation, etc.).
 *
 * Not all models/providers support all of these parameters, so please check the API documentation
 * for the specific model and provider you are using.
 */
export class ModelSettings {
  /** Control randomness: 0 = deterministic, 1 = maximum variety */
  temperature?: number;
  /** Nucleus sampling parameter */
  top_p?: number;
  /** Discourages repetition of tokens */
  frequency_penalty?: number;
  /** Encourages using new tokens */
  presence_penalty?: number;
  /** Controls how tools are chosen by the model */
  tool_choice?: string & ToolChoice;
  /** Whether to allow parallel tool calls when calling the model.
   * Defaults to False if not provided. */
  parallel_tool_calls?: boolean;
  /** The truncation strategy to use when calling the model */
  truncation?: 'auto' | 'disabled';
  /** The maximum number of output tokens to generate */
  max_tokens?: number;
  /** Whether to store the generated model response for later retrieval.
   * Defaults to True if not provided. */
  store?: boolean;
  /** Whether to include reasoning in the response */
  reasoning?: Reasoning | null;
  /** Additional metadata to include with the request */
  metadata?: any;

  constructor(settings?: Partial<ModelSettings>) {
    Object.assign(this, {
      temperature: undefined,
      top_p: undefined,
      frequency_penalty: undefined,
      presence_penalty: undefined,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      truncation: 'auto',
      max_tokens: undefined,
      store: true,
      reasoning: null,
      metadata: undefined,
      ...settings,
    });
  }

  /**
   * Produce a new ModelSettings instance by overlaying non-undefined values from override
   * on top of this instance.
   */
  resolve(override?: ModelSettings | null): ModelSettings {
    if (!override) {
      return this;
    }

    const changes: Partial<ModelSettings> = {};

    // Only copy non-undefined values from override
    if (override.temperature !== undefined) changes.temperature = override.temperature;
    if (override.top_p !== undefined) changes.top_p = override.top_p;
    if (override.frequency_penalty !== undefined) changes.frequency_penalty = override.frequency_penalty;
    if (override.presence_penalty !== undefined) changes.presence_penalty = override.presence_penalty;
    if (override.tool_choice !== undefined) changes.tool_choice = override.tool_choice;
    if (override.parallel_tool_calls !== undefined) changes.parallel_tool_calls = override.parallel_tool_calls;
    if (override.max_tokens !== undefined) changes.max_tokens = override.max_tokens;
    if (override.store !== undefined) changes.store = override.store;
    if (override.truncation !== undefined) changes.truncation = override.truncation;
    if (override.reasoning !== undefined) changes.reasoning = override.reasoning;
    if (override.metadata !== undefined) changes.metadata = override.metadata;

    return new ModelSettings({ ...this, ...changes });
  }
}
