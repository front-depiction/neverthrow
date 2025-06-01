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

import { Result, ok, err } from '.'

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never

/**
 * ArgumentInput: Represents the different ways arguments can be provided to a ResultCallable
 * - T: A direct value
 * - Result<T, E>: A Result that may contain the value or an error
 * - () => Result<T, E>: A function that lazily produces a Result
 */
export type ArgumentInput<T, E = unknown> = T | (() => T) | Result<T, E> | (() => Result<T, E>)

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
 * Provides a lazy, composable way to build and execute functions that work with Results.
 * Implements "railway-oriented programming" where operations can be chained and will short-circuit on the first error.
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
   * Creates a new ResultCallable wrapper around a function
   */
  constructor(
    private fn: (...args: Args) => Result<FnRes, FnErr>,
    private readonly argsList: ArgumentInput<unknown, unknown>[] = [],
  ) {}

  /**
   * processArgument: ArgumentInput<T, E> -> Result<T, E>
   * Converts any argument input type into a Result, handling lazy evaluation.
   * - If argument is a function, call it and return the Result
   * - If argument is already a Result, return it as-is
   * - If argument is a plain value, wrap it in ok()
   * - If any step throws, wrap the error in err()
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
   * processArgsAndExecute: ArgumentInput<unknown, unknown>[] -> Result<FnRes, FnErr>
   * Processes all arguments in order and executes the function, short-circuiting on first error.
   * Arguments are processed left-to-right in the order they were applied.
   */
  private processArgsAndExecute(allArgs: ArgumentInput<unknown, unknown>[]): Result<FnRes, FnErr> {
    const processedArgs: unknown[] = []

    // Process each argument in order, short-circuit on first error
    for (const arg of allArgs) {
      const result = this.processArgument(arg)
      if (result.isErr()) {
        return result as Result<FnRes, FnErr>
      }
      processedArgs.push(result.value)
    }
    console.log('calling fn', this.fn, 'with args: ', processedArgs)
    // All args processed successfully, call the function
    return this.fn(...(processedArgs as Args))
  }

  /**
   * applyArg: ArgumentInput<Head<Args>, ParamErr> -> ResultCallable<Tail<Args>, FnRes, FnErr | ParamErr>
   * Applies one argument to the function, returning a new ResultCallable with one fewer parameter.
   * The argument is stored for lazy evaluation rather than being processed immediately.
   * Each call creates a new instance with the argument added to the list.
   * Arguments are processed in left-to-right order when the function is executed.
   */
  applyArg<ParamErr = never>(
    arg: ArgumentInput<Head<Args>, ParamErr>,
  ): ResultCallable<Tail<Args>, FnRes, FnErr | ParamErr> {
    // Create NEW args list (immutable)
    const newArgsList = [...this.argsList, arg]

    // Return new ResultCallable instance, we can safely cast because we control the arguments passed in during execution
    return (resultFn(this.fn, newArgsList) as unknown) as ResultCallable<
      Tail<Args>,
      FnRes,
      FnErr | ParamErr
    >
  }

  /**
   * map: ((value: FnRes) => U) -> ResultCallable<Args, U, FnErr>
   * Transforms the success value of the ResultCallable when executed.
   * The transformation only occurs if the Result is Ok.
   */
  map<U>(f: (value: FnRes) => U): ResultCallable<Args, U, FnErr> {
    const newFn = (...args: Args) => this.fn(...args).map(f)
    return resultFn(newFn, this.argsList)
  }

  /**
   * mapErr: ((error: FnErr) => E2) -> ResultCallable<Args, FnRes, E2>
   * Transforms the error value of the ResultCallable when executed.
   * The transformation only occurs if the Result is Err.
   */
  mapErr<E2>(f: (error: FnErr) => E2): ResultCallable<Args, FnRes, E2> {
    const newFn = (...args: Args) => this.fn(...args).mapErr(f)
    return resultFn(newFn, this.argsList)
  }

  /**
   * andThen: ((value: FnRes) => Result<U, E2>) -> ResultCallable<Args, U, FnErr | E2>
   * Chains another Result-producing operation after this one.
   * Allows chaining operations that can fail.
   */
  andThen<U, E2>(f: (value: FnRes) => Result<U, E2>): ResultCallable<Args, U, FnErr | E2> {
    const newFn = (...args: Args) => this.fn(...args).andThen(f)
    return resultFn(newFn, this.argsList)
  }

  /**
   * _execute: ...Args -> Result<FnRes, FnErr>
   * Executes the composed function with the given arguments.
   * All lazy evaluation and argument processing happens here.
   */
  _execute(...args: Args): Result<FnRes, FnErr> {
    const allArgs = [...this.argsList, ...args]
    return this.processArgsAndExecute(allArgs)
  }
}

// =============================================================================
// FACTORY FUNCTION AND PROXY MAGIC
// =============================================================================

/**
 * resultFn: ((...args: Args) => R | Result<R, E>) -> ResultCallable<Args, R, E>
 * Creates a ResultCallable from a regular function that may or may not return a Result.
 * Handles functions that:
 * 1. Return plain values (wraps in ok())
 * 2. Return Results (uses as-is)
 * 3. Throw exceptions (catches and wraps in err())
 *
 * Uses JavaScript's proxy capabilities to make the returned object both:
 * - Callable like a function (for direct execution)
 * - Have methods like applyArg, map, etc. (for composition)
 */
export function resultFn<Args extends unknown[], R, E = never>(
  fn: (...args: Args) => R | Result<R, E>,
  argsList: ArgumentInput<unknown, unknown>[] = [],
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

  const instance = new _ResultCallable(wrappedFn, argsList)

  // Proxy Magic: Create a function that can be called directly but also has methods
  // This allows: resultFn(f)(args) AND resultFn(f).applyArg(arg)
  const proxyFn = (...args: Args) => instance._execute(...args)
  Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(instance))
  Object.assign(proxyFn, instance)

  return proxyFn as ResultCallable<Args, R, E>
}

/**
 * from: Alias for resultFn
 * Provides a more descriptive name for creating ResultCallables from existing functions.
 * Use `resultFn` when defining new functions, `from` when adapting existing functions.
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
