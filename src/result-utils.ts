import { Ok, Err, SerializedResult, Result as ResultType } from './result'
import { resultFn, ResultCallable } from './result-function'
import { ErrTuple, OkTuple } from './_internals/types'

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
// eslint-disable-next-line @typescript-eslint/no-namespace

/**
 * Creates a Result from a serialized object
 */
export function fromJSON<T, E>(serialized: SerializedResult<T, E>): ResultType<T, E> {
  if (serialized.type === 'Ok') {
    return new Ok<T, E>(serialized.value)
  } else {
    return new Err<T, E>(serialized.error)
  }
}

/**
 * Deserializes a Result from a JSON string
 */
export function deserialize<T, E>(json: string): ResultType<T, E> {
  try {
    const parsed = JSON.parse(json) as SerializedResult<T, E>
    return fromJSON(parsed)
  } catch (error) {
    return new Err<T, E>(error as E)
  }
}

/**
 * Wraps a function with a try catch, creating a new function with the same
 * arguments but returning `Ok` if successful, `Err` if the function throws
 */
export function fromThrowable<T, E, Args extends unknown[]>(
  fn: (...args: Args) => T,
  errorFn: (e: unknown) => E = (e: unknown) => e as E,
): ResultCallable<Args, T, E> {
  return (resultFn(fn).mapErr(errorFn) as unknown) as ResultCallable<Args, T, E>
}

/** First-error-wins combine (handles the empty list case) */
export type CombineResults<
  T extends readonly [ResultType<unknown, unknown>, ...ResultType<unknown, unknown>[]]
> = T extends [] ? ResultType<never, never> : ResultType<OkTuple<T>, ErrTuple<T>[number]>

/** Collect-all-errors combine (handles the empty list case) */
export type CombineResultsWithAllErrorsArray<
  T extends readonly ResultType<unknown, unknown>[]
> = T extends [] ? ResultType<never, never> : ResultType<OkTuple<T>, ErrTuple<T>[number][]>

/**
 * Combines multiple Results into a single Result
 * If all Results are Ok, returns Ok with array of all values
 * If any Result is Err, returns the first Err encountered
 */
export function combine<
  A extends readonly [ResultType<unknown, unknown>, ...ResultType<unknown, unknown>[]]
>(...resultList: A): CombineResults<A>
export function combine(
  resultList: readonly ResultType<unknown, unknown>[],
): ResultType<unknown, unknown> {
  const values: unknown[] = []
  for (const result of resultList) {
    if (result.isErr()) {
      return new Err(result.error)
    }
    values.push(result.value)
  }
  return new Ok(values)
}

/**
 * Combines multiple Results into a single Result, collecting all errors
 * If all Results are Ok, returns Ok with array of all values
 * If any Result is Err, returns Err with array of all errors
 */
export function combineWithAllErrors<
  T extends readonly [ResultType<unknown, unknown>, ...ResultType<unknown, unknown>[]]
>(resultList: [...T]): CombineResultsWithAllErrorsArray<T>
export function combineWithAllErrors<A extends readonly ResultType<unknown, unknown>[]>(
  resultList: A,
): CombineResultsWithAllErrorsArray<A>
export function combineWithAllErrors(
  resultList: readonly ResultType<unknown, unknown>[],
): ResultType<unknown, unknown> {
  const values: unknown[] = []
  const errors: unknown[] = []

  for (const result of resultList) {
    if (result.isOk()) {
      values.push(result.value)
    } else {
      errors.push(result.error)
    }
  }

  return errors.length > 0 ? new Err(errors) : new Ok(values)
}
