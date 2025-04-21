import { OpenAI } from 'openai';
import { Model, ModelProvider } from './interface';
import { OpenAIChatCompletionsModel } from './openai-chatcompletions';
import { OpenAIResponsesModel } from './openai-responses';
import {
  _useResponsesByDefault,
  getDefaultOpenaiClient,
  getDefaultOpenaiKey,
  getUseResponsesByDefault,
} from '../_openai-shared';
import { AllModels } from 'openai/resources/shared';

export const DEFAULT_MODEL: AllModels = 'gpt-4o';

/**
 * Provider for OpenAI models.
 */
export class OpenAIProvider implements ModelProvider {
  private _client: OpenAI | null = null;
  private _storedApiKey: string | null = null;
  private _storedBaseUrl: string | null = null;
  private _storedOrganization: string | null = null;
  private _storedProject: string | null = null;
  private _useResponses: boolean = _useResponsesByDefault;

  constructor({
    apiKey,
    baseUrl,
    openaiClient,
    organization,
    project,
    useResponses,
  }: {
    apiKey?: string | null;
    baseUrl?: string | null;
    openaiClient?: OpenAI | null;
    organization?: string | null;
    project?: string | null;
    useResponses?: boolean | null;
  } = {}) {
    /**
     * Create a new OpenAI provider.
     *
     * @param apiKey - The API key to use for the OpenAI client. If not provided, we will use the
     *   default API key.
     * @param baseUrl - The base URL to use for the OpenAI client. If not provided, we will use the
     *   default base URL.
     * @param openaiClient - An optional OpenAI client to use. If not provided, we will create a new
     *   OpenAI client using the apiKey and baseUrl.
     * @param organization - The organization to use for the OpenAI client.
     * @param project - The project to use for the OpenAI client.
     * @param useResponses - Whether to use the OpenAI responses API.
     */
    if (openaiClient !== undefined) {
      if (apiKey !== undefined || baseUrl !== undefined) {
        throw new Error(
          "Don't provide apiKey or baseUrl if you provide openaiClient"
        );
      }
      this._client = openaiClient;
    } else {
      this._client = null;
      this._storedApiKey = apiKey || null;
      this._storedBaseUrl = baseUrl || null;
      this._storedOrganization = organization || null;
      this._storedProject = project || null;
    }

    if (useResponses !== undefined) {
      this._useResponses = useResponses ?? false;
    } else {
      this._useResponses = getUseResponsesByDefault();
    }
  }

  /**
   * We lazy load the client in case you never actually use OpenAIProvider(). Otherwise
   * AsyncOpenAI() raises an error if you don't have an API key set.
   */
  private _getClient(): OpenAI {
    if (this._client === null) {
      const defaultClient = getDefaultOpenaiClient();
      if (defaultClient) {
        this._client = defaultClient;
      } else {
        const apiKey = this._storedApiKey || getDefaultOpenaiKey();
        if (!apiKey) {
          throw new Error('OpenAI API key is required');
        }
        this._client = new OpenAI({
          apiKey,
          baseURL: this._storedBaseUrl || undefined,
          organization: this._storedOrganization || undefined,
          project: this._storedProject || undefined,
          defaultHeaders: {
            'Content-Type': 'application/json',
          },
          defaultQuery: {},
          maxRetries: 3,
        });
      }
    }
    return this._client;
  }

  getModel(modelName: string | null | undefined): Model {
    if (modelName === null || modelName === undefined) {
      modelName = DEFAULT_MODEL;
    }

    const client = this._getClient();

    return this._useResponses
      ? new OpenAIResponsesModel(modelName, client)
      : new OpenAIChatCompletionsModel({
          model: modelName,
          openaiClient: client,
        });
  }
}
