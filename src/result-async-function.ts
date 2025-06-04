// =============================================================================
// ARCHITECTURAL NOTES
// =============================================================================

/*
 * HOW IT ALL FITS TOGETHER:
 *
 * 1. PROBLEM: neverthrow's Result type is great for error handling, but composing
 *    functions that take multiple arguments and may fail is verbose and error-prone.
 *
 * 2. SOLUTION: ResultAsyncCallable provides a "function builder" pattern that:
 *    - Allows partial application of arguments (some now, some later)
 *    - Handles Result and ResultAsync types automatically (no manual unwrapping)
 *    - Provides lazy evaluation (errors short-circuit early)
 *    - Uses Promise.all for parallel argument processing
 *    - Maintains full type safety
 *
 * 3. KEY PATTERNS IMPLEMENTED:
 *    - Railway-Oriented Programming: Operations compose and errors short-circuit
 *    - Partial Application: Functions can be built up argument by argument
 *    - Lazy Evaluation: Nothing executes until you call the final function
 *    - Parallel Processing: Arguments are processed concurrently for performance
 *    - Proxy Pattern: Objects that are both callable and have methods
 *
 * 4. INTEGRATION WITH NEVERTHROW:
 *    - ResultAsyncCallable wraps regular functions to work with ResultAsync<T, E>
 *    - All standard ResultAsync methods (map, andThen, mapErr) are available
 *    - Seamlessly converts between Result, ResultAsync and ResultAsyncCallable contexts
 *    - Preserves all type information for compile-time safety
 *
 * 5. USAGE PATTERNS:
 *    - Direct: resultFnAsync(fn)(arg1, arg2, arg3)
 *    - Partial: resultFnAsync(fn).applyArg(arg1).applyArg(arg2)(arg3)
 *    - Composed: resultFnAsync(fn).applyArg(arg1).map(transform).andThen(chain)()
 */

import { ArgumentInput } from './result-function'
import { Result, ResultAsync, okAsync, errAsync } from '.'
import { combineAsync } from './result-utils'

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never

function isResultLike<T, E>(value: T | Result<T, E>): value is Result<T, E> {
  return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
}

/**
 * AsyncArgumentInput: Represents the different ways arguments can be provided to a ResultAsyncCallable
 * - T: A direct value
 * - Result<T, E>: A Result that may contain the value or an error
 * - ResultAsync<T, E>: An async Result that may contain the value or an error
 * - PromiseLike<T>: A promise that resolves to a value
 * - () => T | Result<T, E> | ResultAsync<T, E> | PromiseLike<T>: Lazy functions
 */
export type AsyncArgumentInput<T, E = unknown> =
  | ArgumentInput<T, E>
  | PromiseLike<T>
  | (() => PromiseLike<T>)
  | ResultAsync<T, E>
  | (() => ResultAsync<T, E>)

// =============================================================================
// HELPER PREDICATES
// =============================================================================
function isFunction(value: unknown): value is () => unknown {
  return typeof value === 'function'
}

function isResultAsyncLike<T, E>(value: unknown): value is ResultAsync<T, E> {
  return typeof value === 'object' && value !== null && 'then' in value && 'map' in value
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === 'object' && value !== null && 'then' in value
}

// =============================================================================
// CORE RESULT CALLABLE ASYNC CLASS
// =============================================================================

/**
 * _ResultAsyncCallable: A wrapper class that enables functional composition with ResultAsync types
 *
 * Provides a lazy, composable way to build and execute functions that work with ResultAsync.
 * Implements "railway-oriented programming" where operations can be chained and will short-circuit on the first error.
 *
 * Key Design Principles:
 * 1. Lazy Evaluation: Arguments are not processed until execution time
 * 2. Parallel Processing: Arguments are processed concurrently with Promise.all
 * 3. Error Short-Circuiting: If any argument evaluation fails, the entire chain fails
 * 4. Composability: Methods return new ResultAsyncCallable instances for chaining
 * 5. Type Safety: Maintains proper TypeScript types throughout the chain
 */
class _ResultAsyncCallable<
  Args extends unknown[],
  FnRes,
  FnErr = never,
  ArgsList extends AsyncArgumentInput<unknown, unknown>[] = []
> {
  /**
   * constructor: ((...args: Args) => ResultAsync<FnRes, FnErr>) -> _ResultAsyncCallable
   * Creates a new ResultAsyncCallable wrapper around a function
   */
  constructor(
    private fn: (...args: Args) => ResultAsync<FnRes, FnErr>,
    private readonly argsList: ArgsList = ([] as unknown) as ArgsList,
  ) {}

  /**
   * processArgument: AsyncArgumentInput<T, E> -> ResultAsync<T, E>
   * Converts any argument input type into a ResultAsync, handling lazy evaluation.
   * - If argument is a function, call it and convert result to ResultAsync
   * - If argument is already a ResultAsync, return it as-is
   * - If argument is a Result, convert to ResultAsync
   * - If argument is a Promise, wrap with ResultAsync.fromSafePromise
   * - If argument is a plain value, wrap it in okAsync()
   * - If any step throws, wrap the error in errAsync()
   */
  private processArgument<T, E>(arg: AsyncArgumentInput<T, E>): ResultAsync<T, E> {
    try {
      if (isFunction(arg)) {
        const result = (arg as () => T | Result<T, E> | ResultAsync<T, E> | PromiseLike<T>)()

        if (isResultAsyncLike<T, E>(result)) {
          return result
        }
        if (isResultLike<T, E>(result as T | Result<T, E>)) {
          const typedResult = result as Result<T, E>
          return typedResult.isOk() ? okAsync(typedResult.value) : errAsync(typedResult.error)
        }
        if (isPromiseLike<T>(result)) {
          return ResultAsync.fromSafePromise(result)
        }
        return okAsync(result as T)
      }

      if (isResultAsyncLike<T, E>(arg)) {
        return arg
      }

      if (isResultLike<T, E>(arg as T | Result<T, E>)) {
        const typedArg = arg as Result<T, E>
        return typedArg.isOk() ? okAsync(typedArg.value) : errAsync(typedArg.error)
      }

      if (isPromiseLike<T>(arg)) {
        return ResultAsync.fromSafePromise(arg)
      }

      return okAsync(arg as T)
    } catch (e) {
      return errAsync(e as E)
    }
  }

  /**
   * processArgsAndExecute: AsyncArgumentInput<unknown, unknown>[] -> ResultAsync<FnRes, FnErr>
   * Processes all arguments in parallel using Promise.all and executes the function.
   * Arguments are processed concurrently for maximum performance.
   */
  private processArgsAndExecute(allArgs: [...ArgsList, ...Args]): ResultAsync<FnRes, FnErr> {
    // Process all arguments in parallel
    const processedArgs = allArgs.map((arg) => this.processArgument(arg))
    const combinedArgs = combineAsync(processedArgs)
    return combinedArgs.andThen((processedArgs: readonly unknown[]) =>
      this.fn(...(processedArgs as Args)),
    )
  }

  /**
   * applyArg: AsyncArgumentInput<Head<Args>, ParamErr> -> ResultAsyncCallable<Tail<Args>, FnRes, FnErr | ParamErr>
   * Applies one argument to the function, returning a new ResultAsyncCallable with one fewer parameter.
   * The argument is stored for lazy evaluation rather than being processed immediately.
   * Each call creates a new instance with the argument added to the list.
   * Arguments are processed in parallel when the function is executed.
   */
  applyArg<ParamErr = never>(
    arg: AsyncArgumentInput<Head<Args>, ParamErr>,
  ): ResultAsyncCallable<Tail<Args>, FnRes, FnErr | ParamErr> {
    const newArgsList = [...this.argsList, arg]
    // We can cast because we control the arguments passed in during execution
    const newFn = (this.fn as unknown) as (...args: Tail<Args>) => ResultAsync<FnRes, FnErr>
    return resultFnAsync(newFn, newArgsList)
  }

  /**
   * map: ((value: FnRes) => U | PromiseLike<U>) -> ResultAsyncCallable<Args, U, FnErr>
   * Transforms the success value of the ResultAsyncCallable when executed.
   * The transformation only occurs if the ResultAsync is Ok.
   */
  map<U>(f: (value: FnRes) => U | PromiseLike<U>): ResultAsyncCallable<Args, U, FnErr> {
    const newFn = (...args: Args) => this.fn(...args).map(f)
    return resultFnAsync(newFn, this.argsList)
  }

  /**
   * mapErr: ((error: FnErr) => E2 | PromiseLike<E2>) -> ResultAsyncCallable<Args, FnRes, E2>
   * Transforms the error value of the ResultAsyncCallable when executed.
   * The transformation only occurs if the ResultAsync is Err.
   */
  mapErr<E2>(f: (error: FnErr) => E2 | PromiseLike<E2>): ResultAsyncCallable<Args, FnRes, E2> {
    const newFn = (...args: Args) => this.fn(...args).mapErr(f)
    return resultFnAsync(newFn, this.argsList)
  }

  /**
   * andThen: ((value: FnRes) => ResultAsync<U, E2>) -> ResultAsyncCallable<Args, U, FnErr | E2>
   * Chains another ResultAsync-producing operation after this one.
   * Allows chaining operations that can fail.
   */
  andThen<U, E2>(
    f: (value: FnRes) => ResultAsync<U, E2>,
  ): ResultAsyncCallable<Args, U, FnErr | E2> {
    const newFn = (...args: Args) => this.fn(...args).andThen(f)
    return resultFnAsync(newFn, this.argsList)
  }

  /**
   * _execute: ...Args -> ResultAsync<FnRes, FnErr>
   * Executes the composed function with the given arguments.
   * All lazy evaluation and argument processing happens here.
   */
  _execute(...args: Args): ResultAsync<FnRes, FnErr> {
    const allArgs = [...this.argsList, ...args] as [...ArgsList, ...Args]
    return this.processArgsAndExecute(allArgs)
  }
}

// =============================================================================
// FACTORY FUNCTION AND PROXY MAGIC
// =============================================================================

/**
 * resultFnAsync: ((...args: Args) => R | Result<R, E> | ResultAsync<R, E> | PromiseLike<R>) -> ResultAsyncCallable<Args, R, E>
 * Creates a ResultAsyncCallable from a regular function that may return various async types.
 * Handles functions that:
 * 1. Return plain values (wraps in okAsync())
 * 2. Return Results (converts to ResultAsync)
 * 3. Return ResultAsync (uses as-is)
 * 4. Return Promises (wraps with ResultAsync.fromSafePromise)
 * 5. Throw exceptions (catches and wraps in errAsync())
 *
 * Uses JavaScript's proxy capabilities to make the returned object both:
 * - Callable like a function (for direct execution)
 * - Have methods like applyArg, map, etc. (for composition)
 */
export function resultFnAsync<Args extends unknown[], R, E = never, ArgsE = never>(
  fn: (...args: Args) => R | Result<R, E> | ResultAsync<R, E> | PromiseLike<R>,
  argsList: AsyncArgumentInput<unknown, ArgsE>[] = [],
): ResultAsyncCallable<Args, R, E | ArgsE> {
  // Wrap the function to ensure it always returns a ResultAsync
  const wrappedFn = (...args: Args): ResultAsync<R, E> => {
    try {
      const result = fn(...args)

      // Check if the result is already a ResultAsync
      if (isResultAsyncLike<R, E>(result)) {
        return result
      }

      // Check if the result is a Result
      if (isResultLike(result)) {
        return result.isOk() ? okAsync(result.value) : errAsync(result.error)
      }

      // Check if the result is a Promise
      if (isPromiseLike(result)) {
        return ResultAsync.fromSafePromise(result)
      }

      return okAsync(result as R)
    } catch (e) {
      return errAsync(e as E)
    }
  }

  const instance = new _ResultAsyncCallable(wrappedFn, argsList)

  // Proxy Magic: Create a function that can be called directly but also has methods
  // This allows: resultFnAsync(f)(args) AND resultFnAsync(f).applyArg(arg)
  const proxyFn = (...args: Args) => instance._execute(...args)
  Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(instance))
  Object.assign(proxyFn, instance)

  return proxyFn as ResultAsyncCallable<Args, R, E>
}

/**
 * fromAsync: Alias for resultFnAsync
 * Provides a more descriptive name for creating ResultAsyncCallable from existing functions.
 * Use `resultFnAsync` when defining new functions, `fromAsync` when adapting existing functions.
 */
export const fromAsync = resultFnAsync

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Core callable type that all ResultAsyncCallable implement
 */
type CallableAsync<Args extends unknown[], R, E> = (...args: Args) => ResultAsync<R, E>

/**
 * A ResultAsyncCallable that still needs arguments (has unfilled parameters)
 * Combines the callable interface with the composition methods
 */
type UnfilledResultAsyncCallable<
  Args extends [unknown, ...unknown[]],
  R,
  E = unknown
> = CallableAsync<Args, R, E> & _ResultAsyncCallable<Args, R, E>

/**
 * A ResultAsyncCallable that has all arguments filled (no parameters needed)
 * Can be called with no arguments, has composition methods but no applyArg
 */
type FilledResultAsyncCallable<R, E = unknown> = CallableAsync<[], R, E> &
  Omit<_ResultAsyncCallable<[], R, E>, 'applyArg'>

/**
 * ResultAsyncCallable: The main exported type that represents a composable, ResultAsync-aware function
 *
 * Type-level Pattern Matching:
 * - If Args extends [unknown, ...unknown[]] (has at least one arg): UnfilledResultAsyncCallable
 * - Otherwise (no args needed): FilledResultAsyncCallable
 *
 * This ensures type safety at compile time - you can't call applyArg on a function that
 * doesn't need any more arguments.
 */
export type ResultAsyncCallable<Args extends unknown[], R, E = never> = Args extends [
  unknown,
  ...unknown[]
]
  ? UnfilledResultAsyncCallable<Args, R, E>
  : FilledResultAsyncCallable<R, E>
