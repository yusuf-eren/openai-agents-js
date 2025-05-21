import { Agent } from '../agent';
import { UserError } from '../exceptions';
import { TResponseInputItem } from '../items';
import { RunContextWrapper } from '../run-context';

/**
 * Represents a value that might be a Promise or a direct value
 */
export type MaybeAwaitable<T> = T | Promise<T>;

interface GuardrailFunctionOutputArgs {
  output_info: any;
  tripwire_triggered: boolean;
}

/**
 * The output of a guardrail function.
 */
export class GuardrailFunctionOutput {
  /**
   * Optional information about the guardrail's output. For example, the guardrail could include
   * information about the checks it performed and granular results.
   */
  output_info: any;

  /**
   * Whether the tripwire was triggered. If triggered, the agent's execution will be halted.
   */
  tripwire_triggered: boolean;

  constructor({ output_info, tripwire_triggered }: GuardrailFunctionOutputArgs) {
    this.output_info = output_info;
    this.tripwire_triggered = tripwire_triggered;
  }
}

/**
 * The result of an input guardrail run.
 */
export class InputGuardrailResult {
  /**
   * The guardrail that was run.
   */
  guardrail: InputGuardrail<any>;

  /**
   * The output of the guardrail function.
   */
  output: GuardrailFunctionOutput;

  constructor(guardrail: InputGuardrail<any>, output: GuardrailFunctionOutput) {
    this.guardrail = guardrail;
    this.output = output;
  }
}

/**
 * The result of an output guardrail run.
 */
export class OutputGuardrailResult {
  /**
   * The guardrail that was run.
   */
  guardrail: OutputGuardrail<any>;

  /**
   * The output of the agent that was checked by the guardrail.
   */
  agent_output: any;

  /**
   * The agent that was checked by the guardrail.
   */
  agent: Agent<any>;

  /**
   * The output of the guardrail function.
   */
  output: GuardrailFunctionOutput;

  constructor(
    guardrail: OutputGuardrail<any>,
    agent_output: any,
    agent: Agent<any>,
    output: GuardrailFunctionOutput
  ) {
    this.guardrail = guardrail;
    this.agent_output = agent_output;
    this.agent = agent;
    this.output = output;
  }
}

/**
 * Input guardrails are checks that run in parallel to the agent's execution.
 * They can be used to do things like:
 * - Check if input messages are off-topic
 * - Take over control of the agent's execution if an unexpected input is detected
 *
 * You can use the `input_guardrail()` decorator to turn a function into an `InputGuardrail`, or
 * create an `InputGuardrail` manually.
 *
 * Guardrails return a `GuardrailResult`. If `result.tripwire_triggered` is `True`, the agent
 * execution will immediately stop and a `InputGuardrailTripwireTriggered` exception will be raised
 */
export class InputGuardrail<TContext> {
  /**
   * A function that receives the agent input and the context, and returns a
   * `GuardrailResult`. The result marks whether the tripwire was triggered, and can optionally
   * include information about the guardrail's output.
   */
  guardrail_function: (
    context: RunContextWrapper<TContext>,
    agent: Agent<any>,
    input: string | TResponseInputItem[]
  ) => MaybeAwaitable<GuardrailFunctionOutput>;

  /**
   * The name of the guardrail, used for tracing. If not provided, we'll use the guardrail
   * function's name.
   */
  name: string | null;

  constructor(
    guardrail_function: (
      context: RunContextWrapper<TContext>,
      agent: Agent<any>,
      input: string | TResponseInputItem[]
    ) => MaybeAwaitable<GuardrailFunctionOutput>,
    name: string | null = null
  ) {
    this.guardrail_function = guardrail_function;
    this.name = name;
  }

  get_name(): string {
    if (this.name) {
      return this.name;
    }

    return this.guardrail_function.name;
  }

  async run(
    agent: Agent<any>,
    input: string | TResponseInputItem[],
    context: RunContextWrapper<TContext>
  ): Promise<InputGuardrailResult> {
    if (typeof this.guardrail_function !== 'function') {
      throw new UserError(
        `Guardrail function must be callable, got ${this.guardrail_function}`
      );
    }

    const output = this.guardrail_function(context, agent, input);

    if (output instanceof Promise) {
      return new InputGuardrailResult(this, await output);
    }

    return new InputGuardrailResult(this, output);
  }
}

/**
 * Output guardrails are checks that run on the final output of an agent.
 * They can be used to do check if the output passes certain validation criteria
 *
 * You can use the `output_guardrail()` decorator to turn a function into an `OutputGuardrail`,
 * or create an `OutputGuardrail` manually.
 *
 * Guardrails return a `GuardrailResult`. If `result.tripwire_triggered` is `True`, a
 * `OutputGuardrailTripwireTriggered` exception will be raised.
 */
export class OutputGuardrail<TContext> {
  /**
   * A function that receives the final agent, its output, and the context, and returns a
   * `GuardrailResult`. The result marks whether the tripwire was triggered, and can optionally
   * include information about the guardrail's output.
   */
  guardrail_function: (
    context: RunContextWrapper<TContext>,
    agent: Agent<any>,
    agent_output: any
  ) => MaybeAwaitable<GuardrailFunctionOutput>;

  /**
   * The name of the guardrail, used for tracing. If not provided, we'll use the guardrail
   * function's name.
   */
  name: string | null;

  constructor(
    guardrail_function: (
      context: RunContextWrapper<TContext>,
      agent: Agent<any>,
      agent_output: any
    ) => MaybeAwaitable<GuardrailFunctionOutput>,
    name: string | null = null
  ) {
    this.guardrail_function = guardrail_function;
    this.name = name;
  }

  get_name(): string {
    if (this.name) {
      return this.name;
    }

    return this.guardrail_function.name;
  }

  async run(
    context: RunContextWrapper<TContext>,
    agent: Agent<any>,
    agent_output: any
  ): Promise<OutputGuardrailResult> {
    if (typeof this.guardrail_function !== 'function') {
      throw new UserError(
        `Guardrail function must be callable, got ${this.guardrail_function}`
      );
    }

    const output = this.guardrail_function(context, agent, agent_output);

    if (output instanceof Promise) {
      return new OutputGuardrailResult(this, agent_output, agent, await output);
    }

    return new OutputGuardrailResult(this, agent_output, agent, output);
  }
}

// Type definitions for guardrail functions
type InputGuardrailFuncSync<T> = (
  context: RunContextWrapper<T>,
  agent: Agent<any>,
  input: string | TResponseInputItem[]
) => GuardrailFunctionOutput;

type InputGuardrailFuncAsync<T> = (
  context: RunContextWrapper<T>,
  agent: Agent<any>,
  input: string | TResponseInputItem[]
) => Promise<GuardrailFunctionOutput>;

type OutputGuardrailFuncSync<T> = (
  context: RunContextWrapper<T>,
  agent: Agent<any>,
  agent_output: any
) => GuardrailFunctionOutput;

type OutputGuardrailFuncAsync<T> = (
  context: RunContextWrapper<T>,
  agent: Agent<any>,
  agent_output: any
) => Promise<GuardrailFunctionOutput>;

// Return type for decorators
type InputGuardrailDecorator<T> = (
  func: InputGuardrailFuncSync<T> | InputGuardrailFuncAsync<T>
) => InputGuardrail<T>;

type OutputGuardrailDecorator<T> = (
  func: OutputGuardrailFuncSync<T> | OutputGuardrailFuncAsync<T>
) => OutputGuardrail<T>;

/**
 * Decorator that transforms a sync or async function into an `InputGuardrail`.
 * It can be used directly (no parentheses) or with keyword args, e.g.:
 *
 *    const myGuardrail = input_guardrail(myFunction);
 *
 *    // Or with options
 *    const myGuardrail = input_guardrail({ name: "guardrail_name" })(myFunction);
 *
 * @param funcOrOptions - Function to decorate or options to use
 * @returns An InputGuardrail instance or a decorator function
 */
export function input_guardrail<T>(
  funcOrOptions?:
    | InputGuardrailFuncSync<T>
    | InputGuardrailFuncAsync<T>
    | { name?: string | null }
): InputGuardrail<T> | InputGuardrailDecorator<T> {
  // If first argument is a function, create the guardrail directly
  if (typeof funcOrOptions === 'function') {
    return new InputGuardrail<T>(
      funcOrOptions as (
        context: RunContextWrapper<T>,
        agent: Agent<any>,
        input: string | TResponseInputItem[]
      ) => MaybeAwaitable<GuardrailFunctionOutput>
    );
  }

  // If options were provided, create a decorator
  const options = funcOrOptions || {};
  return (func: InputGuardrailFuncSync<T> | InputGuardrailFuncAsync<T>) => {
    return new InputGuardrail(func, options.name || null);
  };
}

/**
 * Decorator that transforms a sync or async function into an `OutputGuardrail`.
 * It can be used directly (no parentheses) or with keyword args, e.g.:
 *
 *    const myGuardrail = output_guardrail(myFunction);
 *
 *    // Or with options
 *    const myGuardrail = output_guardrail({ name: "guardrail_name" })(myFunction);
 *
 * @param funcOrOptions - Function to decorate or options to use
 * @returns An OutputGuardrail instance or a decorator function
 */
export function output_guardrail<T>(
  funcOrOptions?:
    | OutputGuardrailFuncSync<T>
    | OutputGuardrailFuncAsync<T>
    | { name?: string | null }
): OutputGuardrail<T> | OutputGuardrailDecorator<T> {
  // If first argument is a function, create the guardrail directly
  if (typeof funcOrOptions === 'function') {
    return new OutputGuardrail<T>(
      funcOrOptions as (
        context: RunContextWrapper<T>,
        agent: Agent<any>,
        agent_output: any
      ) => MaybeAwaitable<GuardrailFunctionOutput>
    );
  }

  // If options were provided, create a decorator
  const options = funcOrOptions || {};
  return (func: OutputGuardrailFuncSync<T> | OutputGuardrailFuncAsync<T>) => {
    return new OutputGuardrail(func, options.name || null);
  };
}
