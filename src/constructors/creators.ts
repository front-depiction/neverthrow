import { Err, Ok } from '../core/result'
import { ResultAsync } from '../core/result-async'

/**
 * Creates an Ok Result with the given value
 */
export function ok<T, E = never>(value: T): Ok<T, E>
export function ok<T extends void = void, E = never>(value: void): Ok<void, E>
export function ok<T, E = never>(value: T): Ok<T, E> {
  return new Ok(value)
}

/**
 * Creates an Err Result with the given error
 */
export function err<T = never, E extends string = string>(error: E): Err<T, E>
export function err<T = never, E = unknown>(error: E): Err<T, E>
export function err<T = never, E extends void = void>(error: void): Err<T, void>
export function err<T = never, E = unknown>(error: E): Err<T, E> {
  return new Err(error)
}

export function okAsync<T, E = never>(value: T): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Ok<T, E>(value)))
}

export function errAsync<T = never, E = unknown>(error: E): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Err<T, E>(error)))
}
