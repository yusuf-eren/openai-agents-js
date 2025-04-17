/**
 * Represents a value that could be either a Promise or a direct value
 */
export type MaybeAwaitable<T> = Promise<T> | T;
