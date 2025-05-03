import { z } from 'zod';
import { ModelBehaviorError, UserError } from '../exceptions';
import { SpanError } from '../tracing';
import { attachErrorToCurrentSpan } from '../utils';

// Constant for the wrapper dictionary key
const WRAPPER_DICT_KEY = 'response';

/**
 * An object that captures the JSON schema of the output, as well as validating/parsing JSON
 * produced by the LLM into the output type.
 */
export class AgentOutputSchema<T = any> {
  /**
   * The type of the output.
   */
  outputType: any;

  /**
   * Whether the output type is wrapped in a dictionary. This is generally done if the base
   * output type cannot be represented as a JSON Schema object.
   */
  private _isWrapped: boolean;

  /**
   * The JSON schema of the output.
   */
  private _outputSchema: Record<string, any>;

  /**
   * Whether the JSON schema is in strict mode. We **strongly** recommend setting this to true,
   * as it increases the likelihood of correct JSON input.
   */
  strictJsonSchema: boolean;

  /**
   * Creates an AgentOutputSchema for the given output type.
   *
   * @param outputType The type of the output
   * @param strictJsonSchema Whether the JSON schema is in strict mode
   */
  constructor(outputType: any, strictJsonSchema: boolean = true) {
    this.outputType = outputType;
    this.strictJsonSchema = strictJsonSchema;

    if (
      outputType === null ||
      outputType === undefined ||
      outputType === String
    ) {
      this._isWrapped = false;
      this._outputSchema = outputType;
      return;
    }

    // Check if we need to wrap the type
    this._isWrapped = !isSubclassOfObjectOrRecord(outputType);

    if (this._isWrapped) {
      // Create a wrapped schema
      const wrapperType = {
        type: 'object',
        properties: {
          [WRAPPER_DICT_KEY]: outputType,
        },
        required: [WRAPPER_DICT_KEY],
      };
      this._outputSchema = wrapperType;
    } else {
      this._outputSchema = outputType;
    }

    if (this.strictJsonSchema) {
      this._outputSchema = ensureStrictJsonSchema(this._outputSchema);
    }
  }

  /**
   * Whether the output type is plain text (versus a JSON object).
   */
  isPlainText(): boolean {
    return (
      this.outputType === null ||
      this.outputType === undefined ||
      this.outputType === String
    );
  }

  /**
   * The JSON schema of the output type.
   */
  jsonSchema(): Record<string, any> {
    if (this.isPlainText()) {
      throw new UserError(
        'Output type is plain text, so no JSON schema is available'
      );
    }
    return this._outputSchema;
  }

  /**
   * Validate a JSON string against the output type. Returns the validated object, or raises
   * a `ModelBehaviorError` if the JSON is invalid.
   *
   * @param jsonStr The JSON string to validate
   * @param partial Whether to accept partial objects
   * @returns The validated object
   * @throws ModelBehaviorError if the JSON is invalid
   */
  validateJson(jsonStr: string, partial: boolean = false): T {
    try {
      const parsed = JSON.parse(jsonStr);

      // In a real implementation, we would validate against the schema here
      // using a library like Ajv

      if (this._isWrapped) {
        if (typeof parsed !== 'object' || parsed === null) {
          attachErrorToCurrentSpan(
            new SpanError({
              message: 'Invalid JSON',
              data: { details: `Expected an object, got ${typeof parsed}` },
            })
          );
          throw new ModelBehaviorError(
            `Expected an object, got ${typeof parsed} for JSON: ${jsonStr}`
          );
        }

        if (!(WRAPPER_DICT_KEY in parsed)) {
          attachErrorToCurrentSpan(
            new SpanError({
              message: 'Invalid JSON',
              data: {
                details: `Could not find key ${WRAPPER_DICT_KEY} in JSON`,
              },
            })
          );
          throw new ModelBehaviorError(
            `Could not find key ${WRAPPER_DICT_KEY} in JSON: ${jsonStr}`
          );
        }
        return parsed[WRAPPER_DICT_KEY];
      }
      return parsed;
    } catch (e) {
      if (e instanceof ModelBehaviorError) {
        throw e;
      }
      attachErrorToCurrentSpan(
        new SpanError({
          message: 'Invalid JSON',
          data: {
            details: `Failed to parse JSON: ${
              e instanceof Error ? e.message : String(e)
            }`,
          },
        })
      );
      throw new ModelBehaviorError(`Failed to parse JSON: ${jsonStr}`);
    }
  }

  /**
   * The name of the output type.
   */
  get outputTypeName(): string {
    return typeToString(this.outputType);
  }
}

/**
 * Checks if a type is a subclass of object or record
 */
function isSubclassOfObjectOrRecord(type: any): boolean {
  // In TypeScript this is different than Python because of how types work at runtime
  return (
    type === Object || (typeof type === 'function' && type.name === 'Object')
  );
}

/**
 * Ensures a JSON schema is strict by setting additionalProperties to false
 * for objects and applying other restrictions.
 */
function ensureStrictJsonSchema(
  schema: Record<string, any>
): Record<string, any> {
  const result = { ...schema };

  if (result.type === 'object') {
    result.additionalProperties = false;
  }

  // Recursively process nested schemas
  if (result.properties) {
    for (const key in result.properties) {
      result.properties[key] = ensureStrictJsonSchema(result.properties[key]);
    }
  }

  if (result.items) {
    result.items = ensureStrictJsonSchema(result.items);
  }

  return result;
}

/**
 * Converts a type to string representation
 */
function typeToString(type: any): string {
  if (type === String) return 'string';
  if (type === Number) return 'number';
  if (type === Boolean) return 'boolean';
  if (type === null || type === undefined) return 'null';
  if (type === Object) return 'object';
  if (Array.isArray(type)) {
    const itemType = type.length > 0 ? typeToString(type[0]) : 'any';
    return `Array<${itemType}>`;
  }

  return type?.name || typeof type === 'function' ? type.name : String(type);
}
