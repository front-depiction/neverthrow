import { ErrOf, ErrTuple, OkOf, OkTuple, SomeResult, UnknownError } from './_internals/types'
import { Err, Ok, Result, SerializedResult } from './result'
import { ErrorConfig } from './_internals/error'

function isResultLike<T, E>(value: T | Result<T, E>): value is Result<T, E> {
  return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
}

export class ResultAsync<T, E> implements PromiseLike<Result<T, E>> {
  constructor(private readonly promise: PromiseLike<Result<T, E>>) {}

  apply<U, V>(
    this: ResultAsync<(arg: U) => V, E>,
    arg: ResultAsync<U, E> | Result<U, E> | U,
  ): ResultAsync<V, E> {
    return new ResultAsync(
      this.promise.then(async (fnResult) => {
        if (fnResult.isErr()) return new Err<V, E>(fnResult.error)

        let argValue: U
        if (arg instanceof ResultAsync) {
          const argResult = await arg.promise
          if (argResult.isErr()) return new Err<V, E>(argResult.error)
          argValue = argResult.value
        } else if (isResultLike(arg)) {
          if (arg.isErr()) return new Err<V, E>(arg.error)
          argValue = arg.value
        } else {
          argValue = arg
        }

        try {
          const result = fnResult.value(argValue)
          return new Ok<V, E>(result)
        } catch (error) {
          return new Err<V, E>(error as E)
        }
      }),
    )
  }

  // ==================== CORE TRANSFORMATIONS ====================

  map<U>(f: (t: T) => U | PromiseLike<U>): ResultAsync<U, E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result as Err<never, E>
        const mapped = await Promise.resolve(f(result.value))
        return new Ok<U, E>(mapped)
      }),
    )
  }

  mapErr<F>(f: (e: E) => F | PromiseLike<F>): ResultAsync<T, F> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isOk()) return result as Ok<T, never>
        const mapped = await Promise.resolve(f(result.error))
        return new Err<T, F>(mapped)
      }),
    )
  }

  andThen<R extends SomeResult<unknown, unknown>>(
    f: (t: T) => R,
  ): ResultAsync<OkOf<R>, E | ErrOf<R>>
  andThen<U, F>(f: (t: T) => Result<U, F> | ResultAsync<U, F>): ResultAsync<U, E | F>
  andThen(f: (t: T) => SomeResult<unknown, unknown>): ResultAsync<unknown, unknown> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result
        const next = f(result.value)
        return (await next) as Result<unknown, unknown>
      }),
    )
  }

  // ==================== PURE DELEGATION (Zero Logic Duplication) ====================

  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R | ResultAsync<OkOf<R>, ErrOf<R>>,
  ): ResultAsync<[...U, OkOf<R>], ErrOf<R> | E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result as Err<[...U, OkOf<R>], ErrOf<R> | E>
        const next = f(result.value)
        const nextResult = (await next) as Result<OkOf<R>, ErrOf<R>>
        return result.andPush(() => nextResult)
      }),
    )
  }

  andPop<
    NewT,
    NewE,
    Last,
    R extends SomeResult<NewT, NewE>,
    Arr extends readonly [...unknown[], Last]
  >(this: ResultAsync<Arr, E>, f: (t: Last) => R): ResultAsync<NewT, NewE | E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result as Err<never, E>
        const [last] = result.value.slice(-1) as [Last]
        return (await f(last)) as Result<NewT, NewE | E>
      }),
    )
  }

  andTee(f: (t: T) => unknown | PromiseLike<unknown>): ResultAsync<T, E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result
        try {
          await Promise.resolve(f(result.value))
        } catch {
          // Ignore errors in tee operations
        }
        return result
      }),
    )
  }

  orTee(f: (e: E) => unknown | PromiseLike<unknown>): ResultAsync<T, E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isOk()) return result
        try {
          await Promise.resolve(f(result.error))
        } catch {
          // Ignore errors in tee operations
        }
        return result
      }),
    )
  }

  andThrough<R extends SomeResult<unknown, unknown>>(f: (t: T) => R): ResultAsync<T, E | ErrOf<R>>
  andThrough<F>(f: (t: T) => Result<unknown, F> | ResultAsync<unknown, F>): ResultAsync<T, E | F>
  andThrough(f: (t: T) => SomeResult<unknown, unknown>): ResultAsync<T, unknown> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isErr()) return result
        const newResult = await f(result.value)
        return newResult.isOk() ? result : (newResult as Result<never, unknown>)
      }),
    )
  }

  orElse<R extends SomeResult<unknown, unknown>>(f: (e: E) => R): ResultAsync<OkOf<R> | T, ErrOf<R>>
  orElse<U, F>(f: (e: E) => SomeResult<U, F>): ResultAsync<T | U, F>
  orElse(f: (e: E) => SomeResult<unknown, unknown>): ResultAsync<T | unknown, unknown> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (result.isOk()) return result
        const fallback = f(result.error)
        return (await fallback) as Result<T | unknown, unknown>
      }),
    )
  }

  // ==================== UNWRAPPING & MATCHING ====================

  unwrapOr<A>(v: A): PromiseLike<T | A> {
    return this.promise.then((result) => result.unwrapOr(v))
  }

  match<A, B = A>(
    okFn: (t: T) => A | PromiseLike<A>,
    errFn: (e: E) => B | PromiseLike<B>,
  ): PromiseLike<A | B> {
    return this.promise.then(async (result) => {
      if (result.isOk()) {
        return await Promise.resolve(okFn(result.value))
      } else {
        return await Promise.resolve(errFn(result.error))
      }
    })
  }

  _unsafeUnwrap(config?: ErrorConfig): PromiseLike<T> {
    return this.promise.then((result) => result._unsafeUnwrap(config))
  }

  _unsafeUnwrapErr(config?: ErrorConfig): PromiseLike<E> {
    return this.promise.then((result) => result._unsafeUnwrapErr(config))
  }

  // ==================== SERIALIZATION ====================

  toJSON(): PromiseLike<SerializedResult<T, E>> {
    return this.promise.then((result) => result.toJSON())
  }

  serialize(): PromiseLike<string> {
    return this.promise.then((result) => result.serialize())
  }

  // ==================== NULLABLE BRIDGE ====================

  toNullable(): PromiseLike<T | null> {
    return this.promise.then((result) => (result.isOk() ? result.value : null))
  }

  toUndefined(): PromiseLike<T | undefined> {
    return this.promise.then((result) => (result.isOk() ? result.value : undefined))
  }

  // ==================== ASYNC-SPECIFIC EXTENSIONS ====================

  retry(times: number, delayFn?: (attempt: number) => number): ResultAsync<T, E> {
    const attempt = async (remainingAttempts: number): Promise<Result<T, E>> => {
      const result = await this.promise
      if (result.isOk() || remainingAttempts <= 0) return result

      if (delayFn) {
        const delay = delayFn(times - remainingAttempts + 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      return attempt(remainingAttempts - 1)
    }

    return new ResultAsync(attempt(times))
  }

  timeout(ms: number, errorFactory?: () => E): ResultAsync<T, E> {
    const timeoutPromise = new Promise<Result<T, E>>((resolve) => {
      setTimeout(() => {
        const error = errorFactory ? errorFactory() : (('Timeout' as unknown) as E)
        resolve(new Err<T, E>(error))
      }, ms)
    })

    return new ResultAsync(Promise.race([this.promise, timeoutPromise]))
  }

  // ==================== PROMISELIKE IMPLEMENTATION ====================

  then<A, B>(
    onFulfilled?: (res: Result<T, E>) => A | PromiseLike<A>,
    onRejected?: (reason: unknown) => B | PromiseLike<B>,
  ): PromiseLike<A | B> {
    return this.promise.then(onFulfilled, onRejected)
  }

  static fromSafePromise<T, E = never>(promise: PromiseLike<T>): ResultAsync<T, E> {
    return new ResultAsync(promise.then((value) => new Ok<T, E>(value)))
  }

  static fromPromise<T, E = UnknownError>(
    promise: PromiseLike<T>,
    errorFn: (error: unknown) => E = (error: unknown) =>
      new UnknownError('Encountered an unknown error in ResultAsync.fromPromise', {
        cause: error,
      }) as E,
  ): ResultAsync<T, E> {
    return new ResultAsync(
      promise.then(
        (value) => new Ok<T, E>(value),
        (error) => new Err<T, E>(errorFn(error)),
      ),
    )
  }

  static fromThrowable<T, E = UnknownError, Args extends unknown[] = unknown[]>(
    fn: (...args: Args) => PromiseLike<T>,
    errorFn: (error: unknown) => E = (error: unknown) =>
      new UnknownError('Encountered an unknown error in ResultAsync.fromThrowable', {
        cause: error,
      }) as E,
  ): (...args: Args) => ResultAsync<T, E> {
    return (...args: Args) => {
      try {
        return new ResultAsync(
          fn(...args).then(
            (value) => new Ok<T, E>(value),
            (error) => new Err<T, E>(errorFn(error)),
          ),
        )
      } catch (error) {
        return errAsync<T, E>(errorFn(error))
      }
    }
  }
}

export const fromSafePromise = ResultAsync.fromSafePromise
export const fromPromise = ResultAsync.fromPromise
export const fromThrowable = ResultAsync.fromThrowable
// ==================== SHORTCUT CONSTRUCTORS ====================

export function okAsync<T, E = never>(value: T): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Ok<T, E>(value)))
}

export function errAsync<T = never, E = unknown>(error: E): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Err<T, E>(error)))
}

// ==================== TYPE DEFINITIONS ====================

export type CombineResultsAsync<T extends readonly ResultAsync<unknown, unknown>[]> = T extends []
  ? ResultAsync<never, never>
  : ResultAsync<OkTuple<T>, ErrTuple<T>[number]>

export type CombineResultsAsyncWithAllErrorsArray<
  T extends readonly ResultAsync<unknown, unknown>[]
> = T extends [] ? ResultAsync<never, never> : ResultAsync<OkTuple<T>, ErrTuple<T>[number][]>
