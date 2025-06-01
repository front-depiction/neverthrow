
import { Ok, Err, SerializedResult, Result as ResultType } from './result'
import { resultFn, ResultCallable } from './result-function'

/**
 * Short circuits on the FIRST Err value that we find
 */
function combineResultList<T, E>(list: readonly ResultType<T, E>[]): ResultType<readonly T[], E> {
  const out: T[] = []
  for (const r of list) {
    if (r.isErr()) return err(r.error)
      
    out.push(r.value)
  }
  return ok(out)
}

/**
 * Accumulate *all* Err<E> into an array. If unknown errors, Err<E[]>;
 * otherwise Ok<T[]> of all the values.
 */
function combineResultListWithAllErrors<T, E>(
  list: readonly ResultType<T, E>[],
): ResultType<readonly T[], E[]> {
  const oks: T[] = []
  const errs: E[] = []

  for (const r of list) {
    r.match(
      (v) => oks.push(v),
      (e) => errs.push(e),
    )
  }

  return errs.length > 0 ? err(errs) : ok(oks)
}

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

/** Recursive type to extract only value types, using Head/Tail pattern */
type CombineValues<T> = T extends []
  ? []
  : T extends readonly [infer H, ...infer Rest]
  ? H extends ResultType<infer V, infer _E>
    ? [V, ...CombineValues<Rest>]
    : never
  : never

/** Recursive type to extract only error types, using Head/Tail pattern */
type CombineSingleErrors<T> = T extends []
  ? never
  : T extends readonly [infer H, ...infer Rest]
  ? H extends ResultType<infer _V, infer E>
    ? unknown extends E
      ? CombineSingleErrors<Rest>
      : E | CombineSingleErrors<Rest>
    : never
  : never

/** Updated CombineResults using the recursive types */
export type CombineSingleResults<T> = T extends []
  ? ResultType<never, never>
  : ResultType<CombineValues<T>, CombineSingleErrors<T>>

// eslint-disable-next-line prettier/prettier
export function combine<const T extends readonly [...ResultType<unknown, unknown>[]]>(
  resultList: T,
): CombineSingleResults<T> {
  return combineResultList(resultList) as CombineSingleResults<T>
}

export type CombineMultipleResults<T> = T extends []
  ? ResultType<never, never>
  : ResultType<CombineValues<T>, CombineMultipleErrors<T>>

type CombineMultipleErrors<T> = T extends []
  ? []
  : T extends readonly [infer H, ...infer Rest]
  ? H extends ResultType<unknown, infer E>
    ? unknown extends E
      ? CombineMultipleErrors<Rest>
      : [E, ...CombineMultipleErrors<Rest>]
    : never
  : never

/**
 * Combines multiple Results into a single Result, collecting all errors
 * If all Results are Ok, returns Ok with array of all values
 * If any Result is Err, returns Err with array of all errors
 */
export function combineWithAllErrors<const T extends readonly [...ResultType<unknown, unknown>[]]>(
  resultList: T,
): CombineMultipleResults<T> {
  return combineResultListWithAllErrors(resultList) as CombineMultipleResults<T>
}

// =============================================================================
// LIFT FUNCTION - Simple function lifting into Result world
// =============================================================================

/**
 * Maps function arguments to Result types
 */
type ToResults<T extends readonly unknown[]> = {
  [K in keyof T]: ResultType<T[K], unknown>
}

/**
 * Clean type for lifted functions - much easier to read than the raw generic
 */
export type LiftedFunction<F> = F extends (...args: infer Args) => infer R
  ? (...args: ToResults<Args>) => R extends ResultType<unknown, unknown> ? R : ResultType<R, unknown>
  : never

function isResultLike<T, E>(value: T | ResultType<T, E>): value is ResultType<T, E> {
  return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
}

/**
 * Lifts a regular function to work with Result arguments
 * 
 * @example
 * // Unary function
 * const double = (x: number) => x * 2
 * const liftedDouble = lift(double)
 * const result = liftedDouble(ok(5)) // Ok(10)
 * 
 * // Binary function
 * const add = (a: number, b: number) => a + b
 * const liftedAdd = lift(add)
 * const result = liftedAdd(ok(2), ok(3)) // Ok(5)
 * 
 * // Ternary function
 * const makeFullName = (first: string, middle: string, last: string) => `${first} ${middle} ${last}`
 * const liftedMakeFullName = lift(makeFullName)
 * const result = liftedMakeFullName(ok("John"), ok("Q"), ok("Doe")) // Ok("John Q Doe")
 * 
 * // Any arity function
 * const combine = (...args: string[]) => args.join(' ')
 * const liftedCombine = lift(combine)
 * const result = liftedCombine(ok("Hello"), ok("beautiful"), ok("world")) // Ok("Hello beautiful world")
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lift<F extends (...args: readonly any[]) => unknown | ResultType<unknown, unknown>>(
  fn: F
): LiftedFunction<F> {
  return ((...results) => {
    // Extract values from all Results, short-circuiting on first error
    const values: unknown[] = []
    for (const result of results) {
      if (result.isErr()) {
        return err(result.error)
      }
      values.push(result.value)
    }
    
    // All Results are Ok, call the function with extracted values
    try {
      const result = fn(...values)
  
      if (isResultLike(result)) {
        return result
      }
      return ok(result)
    } catch (error) {
      return err(error)
    }
  }) as LiftedFunction<F>
}

