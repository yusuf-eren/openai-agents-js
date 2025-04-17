/**
 * Simple implementation of context variables for Node.js
 * Provides similar functionality to Python's contextvars module
 */

// Using Node.js AsyncLocalStorage as the underlying mechanism
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Represents a token for resetting a context variable
 */
export class Token<T> {
  constructor(
    public readonly value: T,
    public readonly context: ContextVar<T>
  ) {}
}

/**
 * A context variable implementation
 */
export class ContextVar<T> {
  private storage: AsyncLocalStorage<Map<string, any>>;
  private defaultValue: T | undefined;
  private identifier: string;

  /**
   * Create a new context variable
   * @param identifier Unique identifier for this context variable
   * @param defaultValue Optional default value
   */
  constructor(identifier: string, defaultValue?: T) {
    this.storage = new AsyncLocalStorage<Map<string, any>>();
    this.defaultValue = defaultValue;
    this.identifier = identifier;
  }

  /**
   * Get the current value of the context variable
   */
  get(): T | undefined {
    const store = this.storage.getStore();
    if (!store) {
      return this.defaultValue;
    }

    const value = store.get(this.identifier);
    return value !== undefined ? value : this.defaultValue;
  }

  /**
   * Set a new value for the context variable
   * @param value New value
   * @returns A token that can be used to reset the variable to its previous value
   */
  set(value: T): Token<T | undefined> {
    const store = this.storage.getStore() || new Map<string, any>();
    const oldValue = store.get(this.identifier);

    store.set(this.identifier, value);

    if (!this.storage.getStore()) {
      this.storage.enterWith(store);
    }

    return new Token<T | undefined>(oldValue, this);
  }

  /**
   * Reset the context variable using a token from a previous set() call
   * @param token The token from a previous set() call
   */
  reset(token: Token<T | undefined>): void {
    if (token.context !== this) {
      throw new Error('Token belongs to a different context variable');
    }

    const store = this.storage.getStore();
    if (!store) {
      throw new Error('No context is active');
    }

    if (token.value === undefined) {
      store.delete(this.identifier);
    } else {
      store.set(this.identifier, token.value);
    }
  }

  /**
   * Run a callback with a specific value for this context variable
   * @param value The value to set
   * @param callback The callback to run
   * @returns The result of the callback
   */
  run<R>(value: T, callback: () => R): R {
    const store = new Map<string, any>();
    store.set(this.identifier, value);

    return this.storage.run(store, callback);
  }
}
