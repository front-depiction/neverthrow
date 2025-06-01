// =============================================================================
// ARCHITECTURAL NOTES
// =============================================================================

/*
 * HOW IT ALL FITS TOGETHER:
 *
 * 1. PROBLEM: neverthrow's Result type is great for error handling, but composing
 *    functions that take multiple arguments and may fail is verbose and error-prone.
 *
 * 2. SOLUTION: ResultCallable provides a "function builder" pattern that:
 *    - Allows partial application of arguments (some now, some later)
 *    - Handles Result types automatically (no manual unwrapping)
 *    - Provides lazy evaluation (errors short-circuit early)
 *    - Maintains full type safety
 *
 * 3. KEY PATTERNS IMPLEMENTED:
 *    - Railway-Oriented Programming: Operations compose and errors short-circuit
 *    - Partial Application: Functions can be built up argument by argument
 *    - Lazy Evaluation: Nothing executes until you call the final function
 *    - Proxy Pattern: Objects that are both callable and have methods
 *
 * 4. INTEGRATION WITH NEVERTHROW:
 *    - ResultCallable wraps regular functions to work with Result<T, E>
 *    - All standard Result methods (map, andThen, mapErr) are available
 *    - Seamlessly converts between Result and ResultCallable contexts
 *    - Preserves all type information for compile-time safety
 *
 * 5. USAGE PATTERNS:
 *    - Direct: resultFn(fn)(arg1, arg2, arg3)
 *    - Partial: resultFn(fn).applyArg(arg1).applyArg(arg2)(arg3)
 *    - Composed: resultFn(fn).applyArg(arg1).map(transform).andThen(chain)()
 */

import { Result, ok, err, Err } from '.'

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never

/**
 * ArgumentInput: Represents the different ways arguments can be provided to a ResultCallable
 * - T: A direct value
 * - Result<T, E>: A Result that may contain the value or an error
 * - () => Result<T, E>: A function that lazily produces a Result
 *
 * Examples:
 * - 42 (direct value)
 * - ok(42) (Result value)
 * - () => ok(42) (lazy Result producer)
 */
export type ArgumentInput<T, E = unknown> = T | Result<T, E> | (() => Result<T, E>)

// =============================================================================
// HELPER PREDICATES
// =============================================================================

function isResultLike<T, E>(value: T | Result<T, E>): value is Result<T, E> {
  return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
}

function isFunction(value: unknown): value is () => unknown {
  return typeof value === 'function'
}

// =============================================================================
// CORE RESULT CALLABLE CLASS
// =============================================================================

/**
 * _ResultCallable: A wrapper class that enables functional composition with Result types
 *
 * Purpose: Provides a lazy, composable way to build and execute functions that work with Results.
 * This class implements the "railway-oriented programming" pattern where operations can be
 * chained together and will short-circuit on the first error.
 *
 * Key Design Principles:
 * 1. Lazy Evaluation: Arguments are not processed until execution time
 * 2. Error Short-Circuiting: If any argument evaluation fails, the entire chain fails
 * 3. Composability: Methods return new ResultCallable instances for chaining
 * 4. Type Safety: Maintains proper TypeScript types throughout the chain
 */
class _ResultCallable<Args extends unknown[], FnRes, FnErr = never> {
  /**
   * constructor: ((...args: Args) => Result<FnRes, FnErr>) -> _ResultCallable
   * Purpose: Creates a new ResultCallable wrapper around a function
   */
  constructor(private fn: (...args: Args) => Result<FnRes, FnErr>) {}

  /**
   * processArgument: ArgumentInput<T, E> -> Result<T, E>
   * Purpose: Converts any argument input type into a Result, handling lazy evaluation
   *
   * Strategy:
   * 1. If argument is a function, call it and return the Result
   * 2. If argument is already a Result, return it as-is
   * 3. If argument is a plain value, wrap it in ok()
   * 4. If any step throws, wrap the error in err()
   *
   * Examples:
   * processArgument(42) => ok(42)
   * processArgument(ok(42)) => ok(42)
   * processArgument(() => ok(42)) => ok(42)
   * processArgument(() => { throw new Error() }) => err(Error)
   */
  private processArgument<T, E>(arg: ArgumentInput<T, E>): Result<T, E> {
    try {
      if (isFunction(arg)) {
        return (arg as () => Result<T, E>)()
      }
      if (isResultLike<T, E>(arg)) {
        return arg
      }
      return ok(arg as T)
    } catch (e) {
      return err(e as E)
    }
  }

  /**
   * applyArg: ArgumentInput<Head<Args>, ParamErr> -> ResultCallable<Tail<Args>, FnRes, FnErr | ParamErr>
   * Purpose: Applies one argument to the function, returning a new ResultCallable with one fewer parameter
   *
   * Key Insight: This implements "partial application" for Result-aware functions. The argument
   * is stored for lazy evaluation rather than being processed immediately, enabling efficient
   * composition and error short-circuiting.
   *
   * Note: Arguments are applied in a right-to-left order—meaning the last argument you apply
   * will be evaluated first when the function is eventually executed. This is due to how each
   * call to `applyArg` wraps the function, so the most recently applied argument is processed
   * before any previously applied arguments.
   *
   * Examples:
   * const add = resultFn((a: number, b: number) => a + b)
   * const add5 = add.applyArg(5)  // Now expects only one argument
   * add5(3) => ok(8)
   */
  applyArg<ParamErr = never>(
    arg: ArgumentInput<Head<Args>, ParamErr>,
  ): ResultCallable<Tail<Args>, FnRes, FnErr | ParamErr> {
    // Create a new function that processes the stored argument at execution time
    const newFn = (...remainingArgs: Tail<Args>) => {
      // Lazy evaluation: process the argument only when the function is called
      const result = this.processArgument(arg)

      if (result.isErr()) {
        return result as Err<never, FnErr | ParamErr>
      }

      // If successful, combine with remaining args and call the original function
      const allArgs = [result.value, ...remainingArgs] as Args
      return this.fn(...allArgs)
    }
    return resultFn(newFn)
  }

  /**
   * map: ((value: FnRes) => U) -> ResultCallable<Args, U, FnErr>
   * Purpose: Transforms the success value of the ResultCallable when executed
   *
   * This follows the Functor pattern - it lifts a regular function into the Result context.
   * The transformation only occurs if the Result is Ok.
   *
   * Examples:
   * const double = resultFn((x: number) => x * 2)
   * const doubleAndStringify = double.map(String)
   * doubleAndStringify(5) => ok("10")
   */
  map<U>(f: (value: FnRes) => U): ResultCallable<Args, U, FnErr> {
    const newFn = (...args: Args) => this.fn(...args).map(f)
    return resultFn(newFn)
  }

  /**
   * mapErr: ((error: FnErr) => E2) -> ResultCallable<Args, FnRes, E2>
   * Purpose: Transforms the error value of the ResultCallable when executed
   *
   * This allows error handling and transformation in the composition chain.
   * The transformation only occurs if the Result is Err.
   *
   * Examples:
   * const parseNumber = resultFn((s: string) => {
   *   const n = parseInt(s);
   *   if (isNaN(n)) throw new Error("Invalid");
   *   return n;
   * })
   * const withBetterError = parseNumber.mapErr(e => `Parse failed: ${e.message}`)
   */
  mapErr<E2>(f: (error: FnErr) => E2): ResultCallable<Args, FnRes, E2> {
    const newFn = (...args: Args) => this.fn(...args).mapErr(f)
    return resultFn(newFn)
  }

  /**
   * andThen: ((value: FnRes) => Result<U, E2>) -> ResultCallable<Args, U, FnErr | E2>
   * Purpose: Chains another Result-producing operation after this one
   *
   * This follows the Monad pattern - it allows chaining operations that can fail.
   * Also known as "flatMap" in other functional programming contexts.
   *
   * Examples:
   * const divide = resultFn((a: number, b: number) => b === 0 ? err("Division by zero") : ok(a / b))
   * const safeSqrt = divide.andThen(x => x < 0 ? err("Negative sqrt") : ok(Math.sqrt(x)))
   */
  andThen<U, E2>(f: (value: FnRes) => Result<U, E2>): ResultCallable<Args, U, FnErr | E2> {
    const newFn = (...args: Args) => this.fn(...args).andThen(f)
    return resultFn(newFn)
  }

  /**
   * _execute: ...Args -> Result<FnRes, FnErr>
   * Purpose: Executes the composed function with the given arguments
   *
   * This is the "escape hatch" from the composition world back to regular Results.
   * All lazy evaluation and argument processing happens here.
   */
  _execute(...args: Args): Result<FnRes, FnErr> {
    return this.fn(...args)
  }
}

// =============================================================================
// FACTORY FUNCTION AND PROXY MAGIC
// =============================================================================

/**
 * resultFn: ((...args: Args) => R | Result<R, E>) -> ResultCallable<Args, R, E>
 * Purpose: Creates a ResultCallable from a regular function that may or may not return a Result
 *
 * This is the main entry point for the ResultCallable system. It handles functions that:
 * 1. Return plain values (wraps in ok())
 * 2. Return Results (uses as-is)
 * 3. Throw exceptions (catches and wraps in err())
 *
 * The Proxy Pattern:
 * This function uses JavaScript's proxy capabilities to make the returned object both:
 * - Callable like a function (for direct execution)
 * - Have methods like applyArg, map, etc. (for composition)
 *
 * Examples:
 * const add = resultFn((a: number, b: number) => a + b)
 * add(2, 3) => ok(5)  // Direct call
 * add.applyArg(2)(3) => ok(5)  // Composed call
 */
export function resultFn<Args extends unknown[], R, E = never>(
  fn: (...args: Args) => R | Result<R, E>,
): ResultCallable<Args, R, E> {
  // Wrap the function to ensure it always returns a Result
  const wrappedFn = (...args: Args): Result<R, E> => {
    try {
      const result = fn(...args)

      // Check if the result is already a Result using our helper
      if (isResultLike(result)) {
        return result as Result<R, E>
      }
      return ok(result as R)
    } catch (e) {
      return err(e as E)
    }
  }

  const instance = new _ResultCallable(wrappedFn)

  // Proxy Magic: Create a function that can be called directly but also has methods
  // This allows: resultFn(f)(args) AND resultFn(f).applyArg(arg)
  const proxyFn = (...args: Args) => instance._execute(...args)
  Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(instance))
  Object.assign(proxyFn, instance)

  return proxyFn as ResultCallable<Args, R, E>
}

/**
 * from: Alias for resultFn
 * Purpose: Provides a more descriptive name for creating ResultCallables from existing functions
 *
 * Usage preference:
 * - Use `resultFn` when defining new functions
 * - Use `from` when adapting existing functions
 */
export const from = resultFn

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Core callable type that all ResultCallables implement
 */
type Callable<Args extends unknown[], R, E> = (...args: Args) => Result<R, E>

/**
 * A ResultCallable that still needs arguments (has unfilled parameters)
 * Combines the callable interface with the composition methods
 */
type UnfilledResultCallable<Args extends [unknown, ...unknown[]], R, E = unknown> = Callable<
  Args,
  R,
  E
> &
  _ResultCallable<Args, R, E>

/**
 * A ResultCallable that has all arguments filled (no parameters needed)
 * Can be called with no arguments, has composition methods but no applyArg
 */
type FilledResultCallable<R, E = unknown> = Callable<[], R, E> &
  Omit<_ResultCallable<[], R, E>, 'pushArgs'>

/**
 * ResultCallable: The main exported type that represents a composable, Result-aware function
 *
 * Type-level Pattern Matching:
 * - If Args extends [unknown, ...unknown[]] (has at least one arg): UnfilledResultCallable
 * - Otherwise (no args needed): FilledResultCallable
 *
 * This ensures type safety at compile time - you can't call applyArg on a function that
 * doesn't need any more arguments.
 */
export type ResultCallable<Args extends unknown[], R, E = never> = Args extends [
  unknown,
  ...unknown[]
]
  ? UnfilledResultCallable<Args, R, E>
  : FilledResultCallable<R, E>
