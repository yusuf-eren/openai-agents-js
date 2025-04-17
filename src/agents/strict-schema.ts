import { UserError } from './exceptions';

// Constants
const EMPTY_SCHEMA = {
  additionalProperties: false,
  type: 'object',
  properties: {},
  required: [],
};

/**
 * Mutates the given JSON schema to ensure it conforms to the `strict` standard
 * that the OpenAI API expects.
 */
export function ensureStrictJsonSchema(
  schema: Record<string, any>
): Record<string, any> {
  if (Object.keys(schema).length === 0) {
    return EMPTY_SCHEMA;
  }
  return ensureStrictJsonSchemaInternal(schema, [], schema);
}

/**
 * Internal implementation of ensuring a JSON schema is strict.
 *
 * @param jsonSchema The schema to make strict
 * @param path The current path within the schema
 * @param root The root schema
 * @returns The strict schema
 */
function ensureStrictJsonSchemaInternal(
  jsonSchema: any,
  path: string[],
  root: Record<string, any>
): Record<string, any> {
  if (!isDict(jsonSchema)) {
    throw new TypeError(
      `Expected ${jsonSchema} to be a dictionary; path=${path}`
    );
  }

  // Handle $defs
  const defs = jsonSchema.$defs;
  if (isDict(defs)) {
    for (const [defName, defSchema] of Object.entries(defs)) {
      ensureStrictJsonSchemaInternal(
        defSchema,
        [...path, '$defs', defName],
        root
      );
    }
  }

  // Handle definitions
  const definitions = jsonSchema.definitions;
  if (isDict(definitions)) {
    for (const [definitionName, definitionSchema] of Object.entries(
      definitions
    )) {
      ensureStrictJsonSchemaInternal(
        definitionSchema,
        [...path, 'definitions', definitionName],
        root
      );
    }
  }

  // Handle type-specific rules
  const typ = jsonSchema.type;
  if (typ === 'object' && !('additionalProperties' in jsonSchema)) {
    jsonSchema.additionalProperties = false;
  } else if (
    typ === 'object' &&
    'additionalProperties' in jsonSchema &&
    jsonSchema.additionalProperties
  ) {
    throw new UserError(
      'additionalProperties should not be set for object types. This could be because ' +
        "you're using an older version of validation library, or because you configured additional " +
        'properties to be allowed. If you really need this, update the function or output tool ' +
        'to not use a strict schema.'
    );
  }

  // Handle object properties
  const properties = jsonSchema.properties;
  if (isDict(properties)) {
    jsonSchema.required = Object.keys(properties);
    jsonSchema.properties = Object.fromEntries(
      Object.entries(properties).map(([key, propSchema]) => [
        key,
        ensureStrictJsonSchemaInternal(
          propSchema,
          [...path, 'properties', key],
          root
        ),
      ])
    );
  }

  // Handle arrays
  const items = jsonSchema.items;
  if (isDict(items)) {
    jsonSchema.items = ensureStrictJsonSchemaInternal(
      items,
      [...path, 'items'],
      root
    );
  }

  // Handle unions (anyOf)
  const anyOf = jsonSchema.anyOf;
  if (isArray(anyOf)) {
    jsonSchema.anyOf = anyOf.map((variant, i) =>
      ensureStrictJsonSchemaInternal(
        variant,
        [...path, 'anyOf', i.toString()],
        root
      )
    );
  }

  // Handle intersections (allOf)
  const allOf = jsonSchema.allOf;
  if (isArray(allOf)) {
    if (allOf.length === 1) {
      const result = ensureStrictJsonSchemaInternal(
        allOf[0],
        [...path, 'allOf', '0'],
        root
      );
      // Update the schema with the result and remove allOf
      Object.assign(jsonSchema, result);
      delete jsonSchema.allOf;
    } else {
      jsonSchema.allOf = allOf.map((entry, i) =>
        ensureStrictJsonSchemaInternal(
          entry,
          [...path, 'allOf', i.toString()],
          root
        )
      );
    }
  }

  // Strip `null` defaults
  if ('default' in jsonSchema && jsonSchema.default === null) {
    delete jsonSchema.default;
  }

  // Handle $ref with additional properties
  const ref = jsonSchema.$ref;
  if (ref && hasMoreThanNKeys(jsonSchema, 1)) {
    if (typeof ref !== 'string') {
      throw new Error(`Received non-string $ref - ${ref}`);
    }

    const resolved = resolveRef(root, ref);
    if (!isDict(resolved)) {
      throw new Error(
        `Expected $ref: ${ref} to resolve to a dictionary but got ${resolved}`
      );
    }

    // Properties from the JSON schema take priority over the ones on the $ref
    Object.assign(jsonSchema, { ...resolved, ...jsonSchema });
    delete jsonSchema.$ref;

    // Since the schema expanded from $ref might not have additionalProperties: false applied
    // we call ensureStrictJsonSchemaInternal again to fix the inlined schema and ensure it's valid
    return ensureStrictJsonSchemaInternal(jsonSchema, path, root);
  }

  return jsonSchema;
}

/**
 * Resolves a JSON Schema reference ($ref)
 *
 * @param root The root schema object
 * @param ref The reference string (e.g., "#/definitions/SomeType")
 * @returns The resolved schema
 */
function resolveRef(root: Record<string, any>, ref: string): any {
  if (!ref.startsWith('#/')) {
    throw new Error(`Unexpected $ref format "${ref}"; Does not start with #/`);
  }

  const path = ref.substring(2).split('/');
  let resolved: any = root;

  for (const key of path) {
    resolved = resolved[key];
    if (!isDict(resolved)) {
      throw new Error(
        `Encountered non-dictionary entry while resolving ${ref} - ${JSON.stringify(
          resolved
        )}`
      );
    }
  }

  return resolved;
}

/**
 * Type guard to check if an object is a dictionary
 */
function isDict(obj: any): obj is Record<string, any> {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Type guard to check if an object is an array
 */
function isArray(obj: any): obj is Array<any> {
  return Array.isArray(obj);
}

/**
 * Checks if a dictionary has more than n keys
 */
function hasMoreThanNKeys(obj: Record<string, any>, n: number): boolean {
  return Object.keys(obj).length > n;
}
