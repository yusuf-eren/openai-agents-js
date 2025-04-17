import { z } from 'zod';
import { RunContextWrapper } from './run-context';
import { ensureStrictJsonSchema } from './strict-schema';
import { UserError } from './exceptions';

export type DocstringStyle = 'google' | 'numpy' | 'sphinx';

interface FuncDocumentation {
  name: string;
  description: string | null;
  paramDescriptions: Record<string, string> | null;
}

interface FuncSchema {
  name: string;
  description: string | null;
  paramsSchema: z.ZodType;
  paramsJsonSchema: Record<string, any>;
  signature: Function;
  takesContext: boolean;
  strictJsonSchema: boolean;
}

function detectDocstringStyle(doc: string): DocstringStyle {
  const scores: Record<DocstringStyle, number> = {
    sphinx: 0,
    numpy: 0,
    google: 0,
  };

  // Sphinx style detection
  const sphinxPatterns = [/^:param\s/, /^:type\s/, /^:return:/, /^:rtype:/];
  for (const pattern of sphinxPatterns) {
    if (pattern.test(doc)) {
      scores.sphinx++;
    }
  }

  // Numpy style detection
  const numpyPatterns = [
    /^Parameters\s*\n\s*-{3,}/,
    /^Returns\s*\n\s*-{3,}/,
    /^Yields\s*\n\s*-{3,}/,
  ];
  for (const pattern of numpyPatterns) {
    if (pattern.test(doc)) {
      scores.numpy++;
    }
  }

  // Google style detection
  const googlePatterns = [/^(Args|Arguments):/, /^(Returns):/, /^(Raises):/];
  for (const pattern of googlePatterns) {
    if (pattern.test(doc)) {
      scores.google++;
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    return 'google';
  }

  // Priority order: sphinx > numpy > google in case of tie
  const styles: DocstringStyle[] = ['sphinx', 'numpy', 'google'];
  for (const style of styles) {
    if (scores[style] === maxScore) {
      return style;
    }
  }

  return 'google';
}

function generateFuncDocumentation(
  func: Function,
  style?: DocstringStyle
): FuncDocumentation {
  const name = func.name;
  const doc = func.toString().split('\n').slice(1).join('\n').trim();

  if (!doc) {
    return {
      name,
      description: null,
      paramDescriptions: null,
    };
  }

  const detectedStyle = style || detectDocstringStyle(doc);
  const parsed = parseDocstring(doc, detectedStyle);

  return {
    name: func.name,
    description: parsed.description,
    paramDescriptions: parsed.paramDescriptions || null,
  };
}

interface ParsedDocstring {
  description: string | null;
  paramDescriptions: Record<string, string> | null;
}

function parseDocstring(doc: string, style: DocstringStyle): ParsedDocstring {
  // Simple implementation - can be enhanced with more robust parsing
  const lines = doc.split('\n');
  const description: string[] = [];
  const paramDescriptions: Record<string, string> = {};

  let currentParam: string | null = null;
  let currentDescription: string[] = [];

  for (const line of lines) {
    if (style === 'google') {
      if (line.startsWith('Args:')) {
        continue;
      }
      if (line.startsWith('    ')) {
        const paramMatch = line.trim().match(/^(\w+):\s*(.+)$/);
        if (paramMatch) {
          if (currentParam) {
            paramDescriptions[currentParam] = currentDescription.join('\n');
          }
          currentParam = paramMatch[1];
          currentDescription = [paramMatch[2]];
        } else {
          currentDescription.push(line.trim());
        }
      } else if (!line.startsWith('Returns:') && !line.startsWith('Raises:')) {
        description.push(line.trim());
      }
    }
    // Add support for other styles as needed
  }

  if (currentParam) {
    paramDescriptions[currentParam] = currentDescription.join('\n');
  }

  return {
    description: description.length > 0 ? description.join('\n') : null,
    paramDescriptions:
      Object.keys(paramDescriptions).length > 0 ? paramDescriptions : null,
  };
}

export function functionSchema(
  func: Function,
  options: {
    docstringStyle?: DocstringStyle;
    nameOverride?: string;
    descriptionOverride?: string;
    useDocstringInfo?: boolean;
    strictJsonSchema?: boolean;
  } = {}
): FuncSchema {
  const {
    docstringStyle,
    nameOverride,
    descriptionOverride,
    useDocstringInfo = true,
    strictJsonSchema = true,
  } = options;

  // 1. Get docstring info
  const docInfo = useDocstringInfo
    ? generateFuncDocumentation(func, docstringStyle)
    : null;
  const paramDescs = docInfo?.paramDescriptions || {};

  const funcName = nameOverride || docInfo?.name || func.name;

  // 2. Get function signature and type hints
  const sig = func;
  const params = getFunctionParameters(func);
  let takesContext = false;
  const filteredParams: Array<[string, any]> = [];

  if (params.length > 0) {
    const [firstName, firstParam] = params[0];
    const firstType = getParameterType(func, firstName);

    if (firstType && firstType instanceof RunContextWrapper) {
      takesContext = true;
    } else {
      filteredParams.push([firstName, firstParam]);
    }
  }

  // Check other parameters for RunContextWrapper
  for (const [name, param] of params.slice(1)) {
    const type = getParameterType(func, name);
    if (type && type instanceof RunContextWrapper) {
      throw new UserError(
        `RunContextWrapper param found at non-first position in function ${func.name}`
      );
    }
    filteredParams.push([name, param]);
  }

  // 3. Build Zod schema
  const schemaFields: Record<string, z.ZodType> = {};

  for (const [name, param] of filteredParams) {
    const type = getParameterType(func, name);
    const defaultValue = getParameterDefault(func, name);
    const fieldDescription = paramDescs[name] || null;

    if (isRestParameter(param)) {
      // Handle rest parameters (*args)
      schemaFields[name] = z.array(type || z.any());
    } else if (isObjectRestParameter(param)) {
      // Handle object rest parameters (**kwargs)
      schemaFields[name] = z.record(z.string(), type || z.any());
    } else {
      // Normal parameter
      const baseSchema = type || z.any();
      schemaFields[name] =
        defaultValue === undefined
          ? baseSchema
          : baseSchema.default(defaultValue);
    }
  }

  // 4. Create Zod schema
  const paramsSchema = z.object(schemaFields);

  // 5. Build JSON schema
  const jsonSchema: Record<string, any> = {
    type: 'object',
    properties: {},
    required: [],
  };

  if (strictJsonSchema) {
    ensureStrictJsonSchema(jsonSchema);
  }

  return {
    name: funcName,
    description: descriptionOverride || docInfo?.description || null,
    paramsSchema,
    paramsJsonSchema: jsonSchema,
    signature: sig,
    takesContext,
    strictJsonSchema,
  };
}

// Helper functions
function getFunctionParameters(func: Function): Array<[string, any]> {
  // This is a simplified implementation
  // In a real implementation, you would need to parse the function signature
  // and handle all parameter types correctly
  return [];
}

function getParameterType(
  func: Function,
  paramName: string
): z.ZodType | undefined {
  // This is a simplified implementation
  // In a real implementation, you would need to extract type information
  // from the function's type annotations
  return undefined;
}

function getParameterDefault(func: Function, paramName: string): any {
  // This is a simplified implementation
  // In a real implementation, you would need to extract default values
  // from the function's parameters
  return undefined;
}

function isRestParameter(param: any): boolean {
  // This is a simplified implementation
  // In a real implementation, you would need to check if the parameter
  // is a rest parameter (*args)
  return false;
}

function isObjectRestParameter(param: any): boolean {
  // This is a simplified implementation
  // In a real implementation, you would need to check if the parameter
  // is an object rest parameter (**kwargs)
  return false;
}
