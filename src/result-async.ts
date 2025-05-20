import { Err, Ok, Result } from './'
import { combineResultAsyncList, combineResultAsyncListWithAllErrors } from './_internals/utils'
import { ErrOf, ErrTuple, OkOf, OkTuple, SomeResult } from './_internals/types'

export class ResultAsync<T, E> implements PromiseLike<Result<T, E>> {
  private readonly _promise: PromiseLike<Result<T, E>>

  constructor(promise: PromiseLike<Result<T, E>>) {
    this._promise = promise
  }

  static fromSafePromise<T, E = never>(promise: PromiseLike<T>): ResultAsync<T, E> {
    const newPromise = promise.then((value: T) => new Ok<T, E>(value))
    return new ResultAsync(newPromise)
  }

  /**
   * Wrap a promise-producing function into ResultAsync, mapping rejections via errorFn
   */
  static fromPromise<T, E>(
    promise: PromiseLike<T>,
    errorFn: (err: unknown) => E,
  ): ResultAsync<T, E> {
    const p = promise.then(
      (value) => new Ok<T, E>(value),
      (err) => new Err<T, E>(errorFn(err)),
    )
    return new ResultAsync(p)
  }

  static fromThrowable<A extends readonly any[], R, E>(
    fn: (...args: A) => Promise<R>,
    errorFn?: (err: unknown) => E,
  ): (...args: A) => ResultAsync<R, E> {
    return (...args) => {
      try {
        const p = fn(...args).then(
          (v) => new Ok<R, never>(v),
          (error) => new Err<never, E>(errorFn ? errorFn(error) : error),
        )
        return new ResultAsync(p)
      } catch (error) {
        const p = Promise.resolve(new Err<never, E>(errorFn ? errorFn(error) : error))
        return new ResultAsync(p)
      }
    }
  }

  /** First-error-wins combine */
  static combine<
    T extends readonly [ResultAsync<unknown, unknown>, ...ResultAsync<unknown, unknown>[]] // literal, non-empty tuple
  >(arr: [...T]): CombineResultsAsync<T>

  static combine<
    A extends readonly ResultAsync<unknown, unknown>[] // any array
  >(arr: A): CombineResultsAsync<A>

  /* single runtime implementation shared by both overloads */
  static combine(arr: readonly ResultAsync<unknown, unknown>[]): ResultAsync<unknown, unknown> {
    return combineResultAsyncList(arr) // existing JS helper
  }

  /** Collect-all-errors combine */
  static combineWithAllErrors<
    T extends readonly [ResultAsync<unknown, unknown>, ...ResultAsync<unknown, unknown>[]]
  >(arr: [...T]): CombineResultsAsyncWithAllErrorsArray<T>

  static combineWithAllErrors<A extends readonly ResultAsync<unknown, unknown>[]>(
    arr: A,
  ): CombineResultsAsyncWithAllErrorsArray<A>

  static combineWithAllErrors(
    arr: readonly ResultAsync<unknown, unknown>[],
  ): ResultAsync<unknown, unknown> {
    return combineResultAsyncListWithAllErrors(arr)
  }

  /** Map the Ok value, preserving or mapping Promise returns */
  map<U>(f: (t: T) => U | Promise<U>): ResultAsync<U, E> {
    const p = this._promise.then(async (res) => {
      return res.isErr()
        ? (res as Err<never, E>)
        : Promise.resolve(f(res.value)).then((v) => new Ok<U, never>(v))
    })
    return new ResultAsync(p)
  }

  /** Map the Err value, preserving or mapping Promise returns */
  mapErr<F>(f: (e: E) => F | Promise<F>): ResultAsync<T, F> {
    const p = this._promise.then(async (res) => {
      return res.isOk()
        ? (res as Ok<T, never>)
        : Promise.resolve(f(res.error)).then((v) => new Err<never, F>(v))
    })
    return new ResultAsync(p)
  }

  /** caller wants full inference of both Ok & Err via OkOf/ErrOf */
  andThen<R extends SomeResult<unknown, unknown>>(
    f: (t: T) => R,
  ): ResultAsync<OkOf<R>, E | ErrOf<R>>
  /** caller knows their output shape U,F exactly */
  andThen<U, F>(f: (t: T) => Result<U, F> | ResultAsync<U, F>): ResultAsync<U, E | F>
  /** implementation must accept the union of both overloads */
  andThen(f: (t: T) => SomeResult<unknown, unknown>): ResultAsync<unknown, unknown> {
    const p = this._promise.then((res) => (res.isErr() ? res : f(res.value)))
    return new ResultAsync<unknown, unknown>(p)
  }

  /** full inference of Err via ErrOf<R> */
  andThrough<R extends SomeResult<unknown, unknown>>(f: (t: T) => R): ResultAsync<T, E | ErrOf<R>>
  /** caller knows their error type F exactly */
  andThrough<F>(f: (t: T) => Result<unknown, F> | ResultAsync<unknown, F>): ResultAsync<T, E | F>
  /** broad implementation */
  andThrough(f: (t: T) => SomeResult<unknown, unknown>): ResultAsync<T, unknown> {
    const p = this._promise.then((res) => {
      if (res.isErr()) return res
      const nr = f(res.value)
      return nr.match(
        () => res,
        () => nr as Err<never, unknown>,
      )
    })
    return new ResultAsync<T, unknown>(p)
  }

  /** Perform a side-effect on Ok without altering the result */
  andTee(f: (t: T) => unknown | Promise<unknown>): ResultAsync<T, E> {
    const p = this._promise.then(async (res) => {
      // if the promise fails return the failure directly
      if (res.isErr()) return res

      try {
        return Promise.resolve(f(res.value)).then(
          () => res,
          () => res,
        )
      } catch {
        // protects against sync throw
        return res
      }
    })

    return new ResultAsync(p)
  }

  /** Perform a side-effect on Err without altering the result */
  orTee(f: (e: E) => unknown | Promise<unknown>): ResultAsync<T, E> {
    const p = this._promise.then(async (res) => {
      // if the promise is successful return the sucess directly
      if (res.isOk()) return res

      try {
        return Promise.resolve(f(res.error)).then(
          () => res,
          () => res,
        )
      } catch {
        // protects against sync throw
        return res
      }
    })

    return new ResultAsync(p)
  }

  orElse<R extends SomeResult<unknown, unknown>>(f: (e: E) => R): ResultAsync<OkOf<R> | T, ErrOf<R>>
  orElse<U, F>(f: (e: E) => SomeResult<U, F>): ResultAsync<T | U, F>
  /** Fallback on Err, potentially recovering to Ok */
  orElse(f: (e: E) => SomeResult<unknown, unknown>): ResultAsync<T | unknown, unknown> {
    const p = this._promise.then(async (res) => {
      // if the promise is successful return the sucess directly
      if (res.isOk()) return res
      //run the side effect and return the original promise's error no matter what
      return f(res.error)
    })

    return new ResultAsync(p)
  }

  /** Unwrap to a Promise, running one of two callbacks */
  match<U, V>(ok: (t: T) => U, err: (e: E) => V): PromiseLike<U | V> {
    return this._promise.then((res) => res.match(ok, err))
  }

  unwrapOr(def: T): PromiseLike<T> {
    return this._promise.then((res) => res.unwrapOr(def))
  }

  // Implement PromiseLike
  then<A, B>(
    onFulfilled?: (res: Result<T, E>) => A | PromiseLike<A>,
    onRejected?: (reason: any) => B | PromiseLike<B>,
  ): PromiseLike<A | B> {
    return this._promise.then(onFulfilled, onRejected)
  }
}

/** Shortcut constructors */
export function okAsync<T, E = never>(value: T): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Ok<T, E>(value)))
}
export function errAsync<T = never, E = unknown>(error: E): ResultAsync<T, E> {
  return new ResultAsync(Promise.resolve(new Err<T, E>(error)))
}

export const fromSafePromise = ResultAsync.fromPromise
export const fromAsyncThrowable = ResultAsync.fromPromise

export type CombineResultsAsync<T extends readonly ResultAsync<unknown, unknown>[]> = T extends []
  ? ResultAsync<never, never> //     ⟶ Ok<never, never>
  : ResultAsync<OkTuple<T>, ErrTuple<T>[number]>

/** Collect-all-errors combine (handles the empty list case) */
export type CombineResultsAsyncWithAllErrorsArray<
  T extends readonly ResultAsync<unknown, unknown>[]
> = T extends [] ? ResultAsync<never, never> : ResultAsync<OkTuple<T>, ErrTuple<T>[number][]>
