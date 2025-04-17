import { ModelBehaviorError } from '../exceptions';
import { SpanError } from '../tracing';
import { attachErrorToCurrentSpan } from './error-tracing';

/**
 * Type for JSON validation options
 */
interface ValidationOptions {
  allowPartial?: boolean;
}

/**
 * Interface for a schema validator
 */
export interface SchemaValidator<T> {
  /**
   * Validates data against a schema
   * @param data The data to validate
   * @returns Validated and typed data
   */
  validate(data: unknown): T;
}

/**
 * Validates JSON string using the provided schema validator
 *
 * @param jsonStr The JSON string to validate
 * @param validator The schema validator to use
 * @param options Validation options
 * @returns The validated object
 * @throws ModelBehaviorError if the JSON is invalid
 */
export function validateJson<T>(
  jsonStr: string,
  validator: SchemaValidator<T>,
  options: ValidationOptions = {}
): T {
  try {
    // First try to parse the JSON
    const parsed = JSON.parse(jsonStr);

    // Then validate against the schema
    return validator.validate(parsed);
  } catch (e) {
    attachErrorToCurrentSpan(
      new SpanError({
        message: 'Invalid JSON provided',
        data: {},
      })
    );

    throw new ModelBehaviorError(
      `Invalid JSON when parsing ${jsonStr} for schema validation: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}
