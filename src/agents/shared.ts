import { OpenAI } from 'openai';

let _defaultOpenaiKey: string | null = null;
let _defaultOpenaiClient: OpenAI | null = null;
let _useResponsesByDefault: boolean = true;

/**
 * Set the default OpenAI API key.
 * @param key - The API key to set as default
 */
export function setDefaultOpenaiKey(key: string): void {
  _defaultOpenaiKey = key;
}

/**
 * Get the default OpenAI API key.
 * @returns The default API key or null if not set
 */
export function getDefaultOpenaiKey(): string | null {
  return _defaultOpenaiKey;
}

/**
 * Set the default OpenAI client.
 * @param client - The OpenAI client to set as default
 */
export function setDefaultOpenaiClient(client: OpenAI): void {
  _defaultOpenaiClient = client;
}

/**
 * Get the default OpenAI client.
 * @returns The default OpenAI client or null if not set
 */
export function getDefaultOpenaiClient(): OpenAI | null {
  return _defaultOpenaiClient;
}

/**
 * Set whether to use responses by default.
 * @param useResponses - Whether to use responses by default
 */
export function setUseResponsesByDefault(useResponses: boolean): void {
  _useResponsesByDefault = useResponses;
}

/**
 * Get whether to use responses by default.
 * @returns Whether to use responses by default
 */
export function getUseResponsesByDefault(): boolean {
  return _useResponsesByDefault;
}
