import { Result } from 'core/result'
import { err, ok } from 'constructors/creators'

/**
 * Maps function arguments to Result types
 */
type ToResults<T extends readonly unknown[]> = {
  [K in keyof T]: Result<T[K], unknown>
}

/**
 * Clean type for lifted functions - much easier to read than the raw generic
 */
export type LiftedFunction<F> = F extends (...args: infer Args) => infer R
  ? (...args: ToResults<Args>) => R extends Result<unknown, unknown> ? R : Result<R, unknown>
  : never

function isResultLike<T, E>(value: T | Result<T, E>): value is Result<T, E> {
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
export function lift<F extends (...args: readonly any[]) => unknown | Result<unknown, unknown>>(
  fn: F,
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
