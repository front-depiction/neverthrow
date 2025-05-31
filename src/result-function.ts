import { Result, ok, err, Err } from '.'

export type ErrorFactory<E> = (reason?: unknown) => E
export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
export type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never
export type ArgumentInput<T, E = unknown> = T | Result<T, E> | (() => Result<T, E>)

// Main class - much simpler with direct function composition
export class ResultCallable<Args extends unknown[], FnRes, FnErr = never> {
  constructor(private fn: (...args: Args) => Result<FnRes, FnErr>) {}

  // Type guard for Result
  private isResult<T, E>(value: T | Result<T, E>): value is Result<T, E> {
    return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
  }

  // Process argument input (value, Result, or function)
  private processArgument<T, E>(arg: ArgumentInput<T, E>): Result<T, E> {
    try {
      if (typeof arg === 'function') {
        return (arg as () => Result<T, E>)()
      }
      if (this.isResult<T, E>(arg)) {
        return arg
      }
      return ok(arg as T)
    } catch (e) {
      return err(e as E)
    }
  }

  // Apply an argument - stores the argument for lazy evaluation
  applyArg<ParamErr = never>(
    arg: ArgumentInput<Head<Args>, ParamErr>,
  ): ResultCallableType<Tail<Args>, FnRes, FnErr | ParamErr> {
    // Don't process the argument yet - store it for lazy evaluation
    const newFn = (...remainingArgs: Tail<Args>) => {
      // Process the argument at execution time
      const result = this.processArgument(arg)

      if (result.isErr()) {
        return result as Err<never, FnErr | ParamErr>
      }

      // If successful, continue with the original function
      const allArgs = [result.value, ...remainingArgs] as Args
      return this.fn(...allArgs)
    }
    return resultFn(newFn)
  }

  // Transform methods - each creates a new function that applies the transformation
  map<U>(f: (value: FnRes) => U): ResultCallableType<Args, U, FnErr> {
    const newFn = (...args: Args) => this.fn(...args).map(f)
    return resultFn(newFn)
  }

  mapErr<E2>(f: (error: FnErr) => E2): ResultCallableType<Args, FnRes, E2> {
    const newFn = (...args: Args) => this.fn(...args).mapErr(f)
    return resultFn(newFn)
  }

  andThen<U, E2>(f: (value: FnRes) => Result<U, E2>): ResultCallableType<Args, U, FnErr | E2> {
    const newFn = (...args: Args) => this.fn(...args).andThen(f)
    return resultFn(newFn)
  }

  // Execute the computation
  _execute(...args: Args): Result<FnRes, FnErr> {
    return this.fn(...args)
  }
}

// Factory function that wraps regular functions to handle Result/non-Result returns
export function resultFn<Args extends unknown[], R, E = never>(
  fn: (...args: Args) => R | Result<R, E>,
): ResultCallableType<Args, R, E> {
  const wrappedFn = (...args: Args): Result<R, E> => {
    try {
      const result = fn(...args)
      // Type guard to check if result is already a Result
      if (typeof result === 'object' && result !== null && 'isOk' in result && 'isErr' in result) {
        return result as Result<R, E>
      }
      return ok(result as R)
    } catch (e) {
      return err(e as E)
    }
  }

  const instance = new ResultCallable(wrappedFn)

  // Create proxy function that delegates to _execute and copy methods
  const proxyFn = (...args: Args) => instance._execute(...args)
  Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(instance))
  Object.assign(proxyFn, instance)

  return proxyFn as ResultCallableType<Args, R, E>
}

// Convenience alias
export const from = resultFn

// Type definitions - clean and simple
type Callable<Args extends unknown[], R, E> = (...args: Args) => Result<R, E>
type UnfilledResultCallable<Args extends unknown[], R, E = unknown> = Callable<Args, R, E> &
  ResultCallable<Args, R, E>

type FilledResultCallable<R, E = unknown> = Callable<[], R, E> &
  Omit<ResultCallable<[], R, E>, 'pushArgs'>

export type ResultCallableType<Args extends unknown[], R, E = never> = Args extends [
  unknown,
  ...unknown[]
]
  ? UnfilledResultCallable<Args, R, E>
  : FilledResultCallable<R, E>
