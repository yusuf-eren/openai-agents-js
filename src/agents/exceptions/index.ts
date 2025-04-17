import { InputGuardrailResult, OutputGuardrailResult } from '../guardrails';

/**
 * Base class for all exceptions in the Agents SDK.
 */
export class AgentsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    // This maintains proper stack traces in modern JS engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Exception raised when the maximum number of turns is exceeded.
 */
export class MaxTurnsExceeded extends AgentsException {
  /**
   * The error message
   */
  message: string;

  constructor(message: string) {
    super(message);
    this.message = message;
  }
}

/**
 * Exception raised when the model does something unexpected, e.g. calling a tool that doesn't
 * exist, or providing malformed JSON.
 */
export class ModelBehaviorError extends AgentsException {
  /**
   * The error message
   */
  message: string;

  constructor(message: string) {
    super(message);
    this.message = message;
  }
}

/**
 * Exception raised when the user makes an error using the SDK.
 */
export class UserError extends AgentsException {
  /**
   * The error message
   */
  message: string;

  constructor(message: string) {
    super(message);
    this.message = message;
  }
}

/**
 * Exception raised when a guardrail tripwire is triggered.
 */
export class InputGuardrailTripwireTriggered extends AgentsException {
  /**
   * The result data of the guardrail that was triggered.
   */
  guardrail_result: InputGuardrailResult;

  constructor(guardrail_result: InputGuardrailResult) {
    super(
      `Guardrail ${guardrail_result.guardrail.constructor.name} triggered tripwire`
    );
    this.guardrail_result = guardrail_result;
  }
}

/**
 * Exception raised when a guardrail tripwire is triggered.
 */
export class OutputGuardrailTripwireTriggered extends AgentsException {
  /**
   * The result data of the guardrail that was triggered.
   */
  guardrail_result: OutputGuardrailResult;

  constructor(guardrail_result: OutputGuardrailResult) {
    super(
      `Guardrail ${guardrail_result.guardrail.constructor.name} triggered tripwire`
    );
    this.guardrail_result = guardrail_result;
  }
}
