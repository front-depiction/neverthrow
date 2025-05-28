import { Result, ok, err } from '.'

export type ErrorFactory<E> = (reason?: unknown) => E
export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
export type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never
export type ArgumentInput<T, E = never> = T | Result<T, E> | (() => Result<T, E>)

// Main class
export class ResultCallable<Args extends unknown[], FnRes, FnErr = never, CollectedE = never> {
  private readonly originalFn: (...args: Args) => FnRes | Result<FnRes, FnErr>
  private readonly collectedArgs: unknown[] = []
  private readonly cachedFailure: Result<never, CollectedE> | null = null

  constructor(
    fn: (...args: Args) => FnRes | Result<FnRes, FnErr>,
    collectedArgs: unknown[] = [],
    cachedFailure: Result<never, CollectedE> | null = null,
  ) {
    this.originalFn = fn
    this.collectedArgs = [...collectedArgs]
    this.cachedFailure = cachedFailure
  }

  // Core execution logic
  private execute(...args: [...Args]): Result<FnRes, FnErr | CollectedE> {
    if (this.cachedFailure) {
      return this.cachedFailure as Result<never, CollectedE>
    }

    try {
      const allArgs = [...this.collectedArgs, ...args] as Args
      const result = this.originalFn(...allArgs)
      return this.isResult(result) ? result : ok(result)
    } catch (e) {
      return err(e as CollectedE)
    }
  }

  // Type guard for Result
  private isResult<T, E>(value: unknown): value is Result<T, E> {
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
      return err(e)
    }
  }

  // PushArgs method - only available when we need more arguments
  pushArgs<ParamErr = never>(
    arg: ArgumentInput<Head<Args>, ParamErr>,
  ): ResultCallableType<Tail<Args>, FnRes, CollectedE | FnErr | ParamErr> {
    if (!arg) {
      throw new Error('Missing params')
    }
    if (this.cachedFailure) {
      return this.createProxied(this.originalFn, this.collectedArgs, this.cachedFailure)
    }
    const result = this.processArgument(arg)
    if (result.isErr()) {
      return this.createProxied(
        this.originalFn,
        this.collectedArgs,
        result as Result<never, ParamErr>, //store the error as the next cached error
      )
    }
    return this.createProxied(this.originalFn, [...this.collectedArgs, result.value], null)
  }

  // Helper method to create proxied instances
  private createProxied<TailArgs extends unknown[], NewR, NewE, CollectedE>(
    fn: (...args: Args) => NewR | Result<NewR, NewE>,
    collectedArgs: unknown[] = [],
    cachedFailure: Result<never, CollectedE> | null = null,
  ): ResultCallableType<TailArgs, NewR, NewE | CollectedE> {
    // we manage the passing of the head arguments, so we can safely cast this fn to a new fn with only the tail as argumnets
    const newFn = (fn as unknown) as (...args: TailArgs) => NewR

    const inst = new ResultCallable(newFn, collectedArgs, cachedFailure)
    const proxyFn = (...args: TailArgs) => inst._execute(...args)
    Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(inst))
    Object.assign(proxyFn, inst)

    return proxyFn as ResultCallableType<TailArgs, NewR, NewE | CollectedE>
  }

  // Result method implementations - each returns a proxied callable version
  map<U>(f: (value: FnRes) => U): ResultCallableType<Args, U, FnErr | CollectedE> {
    const newFn = (...args: Args) => {
      const result = this.execute(...args)
      return result.map(f)
    }
    return this.createProxied(newFn, this.collectedArgs, this.cachedFailure)
  }

  mapErr<E2>(f: (error: CollectedE | FnErr) => E2): ResultCallableType<Args, FnRes, E2> {
    const newFn = (...args: Args) => {
      const result = this.execute(...args)
      return result.mapErr(f)
    }
    return this.createProxied(newFn, this.collectedArgs)
  }

  andThen<U, E2>(
    f: (value: FnRes) => Result<U, E2>,
  ): ResultCallableType<Args, U, FnErr | CollectedE | E2> {
    const newFn = (...args: Args) => {
      const result = this.execute(...args)
      return result.andThen(f)
    }
    return this.createProxied(newFn, this.collectedArgs, this.cachedFailure)
  }

  // Execute the computation and return the actual Result
  _execute(...args: Args): Result<FnRes, FnErr | CollectedE> {
    return this.execute(...args)
  }
}

// Simple proxy factory function
export function resultFn<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): ResultCallableType<Args, R, never> {
  const instance = new ResultCallable(fn)

  // Simple proxy function that delegates to execute
  const proxyFn = (...args: Args) => instance._execute(...args)

  // Copy all methods and properties from instance to the proxy function
  Object.setPrototypeOf(proxyFn, Object.getPrototypeOf(instance))
  Object.assign(proxyFn, instance)

  return proxyFn as ResultCallableType<Args, R, never>
}

// Convenience alias
export const from = resultFn

type Callable<Args extends unknown[], R, E> = (...args: Args) => Result<R, E>
type UnfilledResultCallable<Args extends unknown[], R, E = never> = Callable<Args, R, E> &
  ResultCallable<Args, R, E>

type FilledResultCallable<R, E = never> = Callable<[], R, E> &
  Omit<ResultCallable<[], R, E>, 'pushArgs'>

export type ResultCallableType<Args extends unknown[], R, E = never> = Args extends [
  unknown,
  ...unknown[]
]
  ? // if there *is* at least one argument left, we add our pushArgs method only
    UnfilledResultCallable<Args, R, E>
  : // otherwise, *just* callable + instance WITHOUT pushArgs
    FilledResultCallable<R, E>
