import { config } from 'dotenv';
config();

/**
 * Helper function to check if a debug flag is enabled in environment variables
 */
function _debugFlagEnabled(flag: string): boolean {
  const flagValue = process.env[flag];
  return flagValue !== undefined && (flagValue === '1' || flagValue.toLowerCase() === 'true');
}

/**
 * By default we don't log LLM inputs/outputs, to prevent exposing sensitive information. Set this
 * flag to enable logging them.
 */
export const DONT_LOG_MODEL_DATA = _debugFlagEnabled('OPENAI_AGENTS_DONT_LOG_MODEL_DATA');

/**
 * By default we don't log tool call inputs/outputs, to prevent exposing sensitive information. Set
 * this flag to enable logging them.
 */
export const DONT_LOG_TOOL_DATA = _debugFlagEnabled('OPENAI_AGENTS_DONT_LOG_TOOL_DATA');
