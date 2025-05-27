import { Result, ok, err } from '.'

export type ErrorFactory<E> = (reason?: unknown) => E
export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never
export type ArgumentInput<T, E = never> = T | Result<T, E> | (() => Result<T, E>)

export type FutureResult<Args extends unknown[], R, CollectedE> = Args extends [
  infer Head,
  ...infer Rest
]
  ? {
      (...args: Args): Result<R, CollectedE>
      pushArgs<E2 = never>(arg: ArgumentInput<Head, E2>): FutureResult<Rest, R, CollectedE | E2>
    }
  : (...args: Args) => Result<R, CollectedE>

const isResult = <T, E>(value: unknown): value is Result<T, E> =>
  typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value

const isFunction = (value: unknown): value is () => unknown => typeof value === 'function'

const processArgument = <T, E>(
  arg: ArgumentInput<T, E>,
  errorFn: ErrorFactory<E>,
): Result<T, E> => {
  try {
    return isFunction(arg) ? arg() : isResult<T, E>(arg) ? arg : ok(arg as T)
  } catch (e) {
    return err(errorFn(e))
  }
}

export function futureResult<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): FutureResult<Args, R, never> {
  const collectedArgs: unknown[] = []
  let cachedFailure: Result<never, unknown> | undefined

  const makeInvoke = <A extends unknown[], CollectedE>(): FutureResult<A, R, CollectedE> => {
    const invoke = ((...args: A): Result<R, CollectedE> => {
      if (cachedFailure) return cachedFailure as Result<never, CollectedE>
      try {
        const allArgs = [...collectedArgs, ...args] as Args
        const result = fn(...allArgs)
        return ok(result)
      } catch (e) {
        return err(e as CollectedE)
      }
    }) as FutureResult<A, R, CollectedE>

    if (fn.length - collectedArgs.length > 0) {
      type Head = A[0]
      type Rest = Tail<A>

      Object.assign(invoke, {
        pushArgs: <E2 = never>(
          arg: ArgumentInput<Head, E2>,
        ): FutureResult<Rest, R, CollectedE | E2> => {
          if (cachedFailure) {
            // Still return a valid FutureResult that short-circuits
            return makeInvoke<Rest, CollectedE | E2>()
          }
          const result = processArgument<Head, E2>(arg, (e) => e as E2)

          if (result.isErr()) {
            cachedFailure = result as Result<never, CollectedE | E2>
            return makeInvoke<Rest, CollectedE | E2>()
          }

          collectedArgs.push(result.value)
          return makeInvoke<Rest, CollectedE | E2>()
        },
      })
    }

    return invoke
  }

  return makeInvoke<Args, never>()
}

// Convenience alias
export const from = futureResult
