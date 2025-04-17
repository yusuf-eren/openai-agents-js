import { ComparisonFilter, CompoundFilter } from 'openai/resources/shared';
import {
  FileSearchTool as file_search_tool,
  WebSearchTool as web_search_tool,
} from 'openai/resources/responses/responses';

import { RunItem } from '../items';
import { RunContextWrapper } from '../run-context';
import { Computer, AsyncComputer } from '../computer';
import { logger } from '../logger';
import { SpanError } from '../tracing';
import { attachErrorToCurrentSpan } from '../utils';
import { DocstringStyle, functionSchema } from '../function-schema';
import { ModelBehaviorError } from '../exceptions';

const DEBUG = {
  DONT_LOG_TOOL_DATA: false,
};

/**
 * Types for different tool functions with and without context
 */
export type ToolFunctionWithoutContext<
  TParams extends any[] = any[],
  TReturn = any
> = (...args: TParams) => TReturn | Promise<TReturn>;

export type ToolFunctionWithContext<
  TContext = any,
  TParams extends any[] = any[],
  TReturn = any
> = (
  context: RunContextWrapper<TContext>,
  ...args: TParams
) => TReturn | Promise<TReturn>;

export type ToolFunction<
  TContext = any,
  TParams extends any[] = any[],
  TReturn = any
> =
  | ToolFunctionWithoutContext<TParams, TReturn>
  | ToolFunctionWithContext<TContext, TParams, TReturn>;

/**
 * Constructor parameters for FunctionToolResult
 */
export interface FunctionToolResultProps {
  tool: FunctionTool;
  output: any;
  run_item: RunItem;
}

/**
 * Result of running a function tool
 */
export class FunctionToolResult {
  /**
   * The tool that was run
   */
  tool: FunctionTool;

  /**
   * The output of the tool
   */
  output: any;

  /**
   * The run item that was produced as a result of the tool call
   */
  run_item: RunItem;

  constructor({ tool, output, run_item }: FunctionToolResultProps) {
    this.tool = tool;
    this.output = output;
    this.run_item = run_item;
  }
}

/**
 * Constructor parameters for FunctionTool
 */
export interface FunctionToolProps {
  name: string;
  description: string;
  params_json_schema: Record<string, any>;
  on_invoke_tool: ({
    context,
    input,
  }: {
    context: RunContextWrapper<any>;
    input: string;
  }) => Promise<any>;
  strict_json_schema?: boolean;
}

/**
 * A tool that wraps a function. In most cases, you should use the `functionTool` helpers to
 * create a FunctionTool, as they let you easily wrap a TypeScript function.
 */
export class FunctionTool {
  /**
   * The name of the tool, as shown to the LLM. Generally the name of the function.
   */
  name: string;

  /**
   * A description of the tool, as shown to the LLM.
   */
  description: string;

  /**
   * The JSON schema for the tool's parameters.
   */
  params_json_schema: Record<string, any>;

  /**
   * A function that invokes the tool with the given context and parameters. The params passed
   * are:
   * 1. The tool run context.
   * 2. The arguments from the LLM, as a JSON string.
   *
   * You must return a string representation of the tool output, or something we can call `String()` on.
   * In case of errors, you can either throw an Exception (which will cause the run to fail) or
   * return a string error message (which will be sent back to the LLM).
   */
  on_invoke_tool: ({
    context,
    input,
  }: {
    context: RunContextWrapper<any>;
    input: string;
  }) => Promise<any>;

  /**
   * Whether the JSON schema is in strict mode. We **strongly** recommend setting this to true,
   * as it increases the likelihood of correct JSON input.
   */
  strict_json_schema: boolean;

  constructor({
    name,
    description,
    params_json_schema,
    on_invoke_tool,
    strict_json_schema = true,
  }: FunctionToolProps) {
    this.name = name;
    this.description = description;
    this.params_json_schema = params_json_schema;
    this.on_invoke_tool = on_invoke_tool;
    this.strict_json_schema = strict_json_schema;
  }
}

/**
 * Constructor parameters for FileSearchTool
 */
export interface FileSearchToolProps {
  vector_store_ids: string[];
  max_num_results?: number;
  include_search_results?: boolean;
  ranking_options?: file_search_tool.RankingOptions;
  filters?: ComparisonFilter | CompoundFilter;
}

/**
 * A hosted tool that lets the LLM search through a vector store. Currently only supported with
 * OpenAI models, using the Responses API.
 */
export class FileSearchTool {
  /**
   * The IDs of the vector stores to search.
   */
  vector_store_ids: string[];

  /**
   * The maximum number of results to return.
   */
  max_num_results?: number;

  /**
   * Whether to include the search results in the output produced by the LLM.
   */
  include_search_results: boolean;

  /**
   * Ranking options for search.
   */
  ranking_options?: file_search_tool.RankingOptions;

  /**
   * A filter to apply based on file attributes.
   */
  filters?: ComparisonFilter | CompoundFilter;

  /**
   * The name of the tool
   */
  get name(): string {
    return 'file_search';
  }

  constructor({
    vector_store_ids,
    max_num_results,
    include_search_results = false,
    ranking_options,
    filters,
  }: FileSearchToolProps) {
    this.vector_store_ids = vector_store_ids;
    this.max_num_results = max_num_results;
    this.include_search_results = include_search_results;
    this.ranking_options = ranking_options;
    this.filters = filters;
  }
}

/**
 * Constructor parameters for WebSearchTool
 */
export interface WebSearchToolProps {
  user_location?: web_search_tool.UserLocation;
  search_context_size?: 'low' | 'medium' | 'high';
}

/**
 * A hosted tool that lets the LLM search the web. Currently only supported with OpenAI models,
 * using the Responses API.
 */
export class WebSearchTool {
  /**
   * Optional location for the search. Lets you customize results to be relevant to a location.
   */
  user_location?: web_search_tool.UserLocation;

  /**
   * The amount of context to use for the search.
   */
  search_context_size: 'low' | 'medium' | 'high';

  /**
   * The name of the tool
   */
  get name(): string {
    return 'web_search_preview';
  }

  constructor({
    user_location,
    search_context_size = 'medium',
  }: WebSearchToolProps) {
    this.user_location = user_location;
    this.search_context_size = search_context_size;
  }
}

/**
 * Constructor parameters for ComputerTool
 */
export interface ComputerToolProps {
  computer: Computer | AsyncComputer;
}

/**
 * A hosted tool that lets the LLM control a computer.
 */
export class ComputerTool {
  /**
   * The computer implementation, which describes the environment and dimensions of the computer,
   * as well as implements the computer actions like click, screenshot, etc.
   */
  computer: Computer | AsyncComputer;

  /**
   * The name of the tool
   */
  get name(): string {
    return 'computer_use_preview';
  }

  constructor({ computer }: ComputerToolProps) {
    this.computer = computer;
  }
}

/**
 * A tool that can be used in an agent.
 */
export type Tool = FunctionTool | FileSearchTool | WebSearchTool | ComputerTool;

/**
 * Function type for handling tool errors
 */
export type ToolErrorFunction<TContext = any> = (
  ctx: RunContextWrapper<TContext>,
  error: Error
) => string | Promise<string>;

/**
 * The default tool error function, which just returns a generic error message.
 */
export const defaultToolErrorFunction: ToolErrorFunction = (
  ctx: RunContextWrapper<any>,
  error: Error
): string => {
  return `An error occurred while running the tool. Please try again. Error: ${error.message}`;
};

/**
 * Options for creating a function tool
 */
export interface FunctionToolOptions {
  /**
   * Override the name of the tool (defaults to function name)
   */
  nameOverride?: string;

  /**
   * Override the description of the tool (defaults to function docstring)
   */
  descriptionOverride?: string;

  /**
   * Style of the docstring
   */
  docstringStyle?: DocstringStyle;

  /**
   * Whether to use the function's docstring for descriptions
   */
  useDocstringInfo?: boolean;

  /**
   * Function to handle errors in the tool
   */
  failureErrorFunction?: ToolErrorFunction | null;

  /**
   * Whether to use strict mode for JSON schema validation
   */
  strictMode?: boolean;
}

/**
 * Creates a FunctionTool from a function.
 *
 * By default, we will:
 * 1. Parse the function signature to create a JSON schema for the tool's parameters.
 * 2. Use the function's JSDoc to populate the tool's description.
 * 3. Use the function's JSDoc to populate argument descriptions.
 *
 * If the function takes a RunContextWrapper as the first argument, it *must* match the
 * context type of the agent that uses the tool.
 *
 * @example
 * ```typescript
 * // Basic usage - wrap a function directly
 * const randomNumber = functionTool((max: number): number => {
 *   return Math.floor(Math.random() * max);
 * });
 *
 * // With options
 * const weatherTool = functionTool(
 *   {
 *     nameOverride: 'get_weather',
 *     descriptionOverride: 'Get weather for a location',
 *     failureErrorFunction: (ctx, error) => `Weather lookup failed: ${error.message}`
 *   }
 * )((location: string) => {
 *   return getWeatherData(location);
 * });
 * ```
 *
 * @param funcOrOptions - The function to wrap or options for creating the tool
 * @param options - Additional options for creating the tool
 * @param options.nameOverride - Override the name of the tool (defaults to function name)
 * @param options.descriptionOverride - Override the description (defaults to function JSDoc)
 * @param options.docstringStyle - Style of JSDoc parsing
 * @param options.useDocstringInfo - Whether to use JSDoc for descriptions (default: true)
 * @param options.failureErrorFunction - Function to handle tool errors. If null, errors will be thrown.
 * @param options.strictMode - Enable strict JSON schema validation (strongly recommended, default: true)
 * @returns A FunctionTool instance or a factory function
 */
export function functionTool<TContext = any>(
  funcOrOptions: ToolFunction<TContext> | FunctionToolOptions,
  options: FunctionToolOptions = {}
): FunctionTool | ((func: ToolFunction<TContext>) => FunctionTool) {
  // If first argument is a function, create the tool directly
  if (typeof funcOrOptions === 'function') {
    return createFunctionTool(funcOrOptions, options);
  }

  // Otherwise, return a factory function that will create the tool when called
  const factoryOptions = funcOrOptions;
  return (func: ToolFunction<TContext>) =>
    createFunctionTool(func, factoryOptions);
}

/**
 * Internal helper to create a FunctionTool from a function
 */
function createFunctionTool<TContext = any>(
  func: ToolFunction<TContext>,
  options: FunctionToolOptions = {}
): FunctionTool {
  const {
    nameOverride,
    descriptionOverride,
    docstringStyle,
    useDocstringInfo = true,
    failureErrorFunction = defaultToolErrorFunction,
    strictMode = true,
  } = options;

  // Get schema from function
  const schema = functionSchema(func, {
    nameOverride,
    descriptionOverride,
    docstringStyle,
    useDocstringInfo,
    strictJsonSchema: strictMode,
  });

  // Create the invoke function
  const on_invoke_tool = async ({
    context,
    input,
  }: {
    context: RunContextWrapper<any>;
    input: string;
  }): Promise<any> => {
    try {
      return await invokeToolImplementation({ context, input, func, schema });
    } catch (e) {
      if (failureErrorFunction === null) {
        throw e;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      const result = failureErrorFunction(context, error);

      // Handle promise result
      if (result instanceof Promise) {
        return await result;
      }

      // Attach error to tracing span
      attachErrorToCurrentSpan(
        new SpanError({
          message: 'Error running tool (non-fatal)',
          data: {
            tool_name: schema.name,
            error: error.message,
          },
        })
      );

      return result;
    }
  };

  return new FunctionTool({
    name: schema.name,
    description: schema.description || '',
    params_json_schema: schema.paramsJsonSchema,
    on_invoke_tool,
    strict_json_schema: strictMode,
  });
}

/**
 * Internal implementation of tool invocation
 */
async function invokeToolImplementation<TContext = any>({
  context,
  input,
  func,
  schema,
}: {
  context: RunContextWrapper<TContext>;
  input: string;
  func: ToolFunction<TContext>;
  schema: any;
}): Promise<any> {
  try {
    const jsonData = input ? JSON.parse(input) : {};

    if (DEBUG.DONT_LOG_TOOL_DATA) {
      logger.debug(`Invoking tool ${schema.name}`);
    } else {
      logger.debug(`Invoking tool ${schema.name} with input ${input}`);
    }

    // In a real implementation, you would validate against the schema here
    // For now we'll assume the data is valid

    // Extract args for call
    const args: any[] = [];
    const kwargs: Record<string, any> = jsonData;

    // Determine if function takes context
    const takesContext = schema.takesContext;

    // Call the function appropriately
    const isAsync = func.constructor.name === 'AsyncFunction';
    if (isAsync) {
      if (takesContext) {
        return await (func as ToolFunctionWithContext<TContext>)(
          context,
          ...args,
          kwargs
        );
      } else {
        return await (func as ToolFunctionWithoutContext)(...args, kwargs);
      }
    } else {
      if (takesContext) {
        return (func as ToolFunctionWithContext<TContext>)(
          context,
          ...args,
          kwargs
        );
      } else {
        return (func as ToolFunctionWithoutContext)(...args, kwargs);
      }
    }
  } catch (e) {
    if (DEBUG.DONT_LOG_TOOL_DATA) {
      logger.debug(`Invalid JSON input for tool ${schema.name}`);
    } else {
      logger.debug(`Invalid JSON input for tool ${schema.name}: ${input}`);
    }

    throw new ModelBehaviorError(
      `Invalid JSON input for tool ${schema.name}: ${input}`
    );
  }
}
