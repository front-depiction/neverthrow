import { errAsync, ResultAsync } from './'
import { createNeverThrowError, ErrorConfig } from './_internals/error'
import { combineResultList, combineResultListWithAllErrors } from './_internals/utils'
import { ErrOf, ErrTuple, OkOf, OkTuple } from './_internals/types'

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Result {
  /**
   * Wraps a function with a try catch, creating a new function with the same
   * arguments but returning `Ok` if successful, `Err` if the function throws
   *
   * @param fn function to wrap with ok on success or err on failure
   * @param errorFn when an error is thrown, this will wrap the error result if provided
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function fromThrowable<Fn extends (...args: readonly any[]) => any, E>(
    fn: Fn,
    errorFn?: (e: unknown) => E,
  ): (...args: Parameters<Fn>) => Result<ReturnType<Fn>, E> {
    return (...args) => {
      try {
        const result = fn(...args)
        return ok(result)
      } catch (e) {
        return err(errorFn ? errorFn(e) : e)
      }
    }
  }

  export function combine<const A extends readonly Result<unknown, unknown>[]>(
    resultList: A,
  ): CombineResults<A>

  export function combine(
    resultList: readonly Result<unknown, unknown>[],
  ): Result<unknown, unknown> {
    // your existing JS
    return combineResultList(resultList)
  }

  export function combineWithAllErrors<
    T extends readonly [Result<unknown, unknown>, ...Result<unknown, unknown>[]]
  >(resultList: [...T]): CombineResultsWithAllErrorsArray<T>

  /* ② fallback – any Result[] variable (maybe empty, already widened) */
  export function combineWithAllErrors<A extends readonly Result<unknown, unknown>[]>(
    resultList: A,
  ): CombineResultsWithAllErrorsArray<A>

  /* single runtime implementation shared by both overloads */
  export function combineWithAllErrors(
    resultList: readonly Result<unknown, unknown>[],
  ): Result<unknown, unknown> {
    return combineResultListWithAllErrors(resultList)
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>

export function ok<T, E = never>(value: T): Ok<T, E>
export function ok<T extends void = void, E = never>(value: void): Ok<void, E>
export function ok<T, E = never>(value: T): Ok<T, E> {
  return new Ok(value)
}

export function err<T = never, E extends string = string>(err: E): Err<T, E>
export function err<T = never, E = unknown>(err: E): Err<T, E>
export function err<T = never, E extends void = void>(err: void): Err<T, void>
export function err<T = never, E = unknown>(err: E): Err<T, E> {
  return new Err(err)
}

/**
 * Evaluates the given generator to a Result returned or an Err yielded from it,
 * whichever comes first.
 *
 * This function is intended to emulate Rust's ? operator.
 * See `/tests/safeTry.test.ts` for examples.
 *
 * @param body - What is evaluated. In body, `yield* result` works as
 * Rust's `result?` expression.
 * @returns The first occurrence of either an yielded Err or a returned Result.
 */
export function safeTry<T, E>(body: () => Generator<Err<never, E>, Result<T, E>>): Result<T, E>
export function safeTry<
  YieldErr extends Err<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>
>(
  body: () => Generator<YieldErr, GeneratorReturnResult>,
): Result<OkOf<GeneratorReturnResult>, ErrOf<YieldErr> | ErrOf<GeneratorReturnResult>>

/**
 * Evaluates the given generator to a Result returned or an Err yielded from it,
 * whichever comes first.
 *
 * This function is intended to emulate Rust's ? operator.
 * See `/tests/safeTry.test.ts` for examples.
 *
 * @param body - What is evaluated. In body, `yield* result` and
 * `yield* resultAsync` work as Rust's `result?` expression.
 * @returns The first occurrence of either an yielded Err or a returned Result.
 */
export function safeTry<T, E>(
  body: () => AsyncGenerator<Err<never, E>, Result<T, E>>,
): ResultAsync<T, E>
export function safeTry<
  YieldErr extends Err<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>
>(
  body: () => AsyncGenerator<YieldErr, GeneratorReturnResult>,
): ResultAsync<OkOf<GeneratorReturnResult>, ErrOf<YieldErr> | ErrOf<GeneratorReturnResult>>
export function safeTry<T, E>(
  body:
    | (() => Generator<Err<never, E>, Result<T, E>>)
    | (() => AsyncGenerator<Err<never, E>, Result<T, E>>),
): Result<T, E> | ResultAsync<T, E> {
  const n = body().next()
  if (n instanceof Promise) {
    return new ResultAsync(n.then((r) => r.value))
  }
  return n.value
}

export interface IResult<T, E> {
  /**
   * Used to check if a `Result` is an `OK`
   *
   * @returns `true` if the result is an `OK` variant of Result
   */
  isOk(): this is Ok<T, E>

  /**
   * Used to check if a `Result` is an `Err`
   *
   * @returns `true` if the result is an `Err` variant of Result
   */
  isErr(): this is Err<T, E>

  /**
   * Maps a `Result<T, E>` to `Result<U, E>`
   * by applying a function to a contained `Ok` value, leaving an `Err` value
   * untouched.
   *
   * @param f The function to apply an `OK` value
   * @returns the result of applying `f` or an `Err` untouched
   */
  map<A>(f: (t: T) => A): Result<A, E>

  /**
   * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a
   * contained `Err` value, leaving an `Ok` value untouched.
   *
   * @param f a function to apply to the error `Err` value
   */
  mapErr<U>(f: (e: E) => U): Result<T, U>

  /**
   * Similar to `map` except you must return a new `Result`.
   *
   * Useful to flatten nested Results.
   */
  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>

  /**
   * Like `andThen`, but pushes the new `Ok` value onto the end of the
   * current value (array or scalar)
   */
  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E>

  /**
   * Like `andThen`, but invoked on the *last* element of an array.
   *
   * If `T` is `readonly [...infer Rest, infer Last]`, `Last` is passed
   * to `f`, and the returned `R` is spliced back in at the end of `Rest`.
   * Otherwise it's a compile-time error.
   */
  andPop<R extends Result<unknown, unknown>, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => R,
  ): Result<OkOf<R>, ErrOf<R> | E>
  andPop<U, F, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => Result<U, F>,
  ): Result<U, E | F>

  /**
   * This "tee"s the current value to a side-effect and returns the same value.
   */
  andTee(f: (t: T) => unknown): Result<T, E>

  /**
   * This "tee"s the current `Err` to a side-effect and returns the same `Err`.
   */
  orTee(f: (e: E) => unknown): Result<T, E>

  /**
   * Like `andTee`, but if `f` fails it returns the new error downstream.
   */
  andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, ErrOf<R> | E>
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, E | F>

  /**
   * Takes an `Err` and maps it to a `Result<T, NewErr>`, useful for recovery.
   */
  orElse<R extends Result<unknown, unknown>>(f: (e: E) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(f: (e: E) => Result<U, A>): Result<U | T, A>

  /**
   * Like `andThen` but for async functions returning `ResultAsync`.
   */
  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F>

  /**
   * Maps an async function over `Ok`, leaving `Err` untouched.
   */
  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E>

  /**
   * Unwrap the `Ok` or return the default if `Err`.
   */
  unwrapOr<A>(v: A): T | A

  /**
   * Pattern-match on both `Ok` and `Err`, returning the result of the chosen callback.
   */
  match<A, B = A>(ok: (t: T) => A, err: (e: E) => B): A | B

  /**
   * @deprecated Emulates Rust’s `?` in `safeTry`; will be removed in 9.0.0.
   */
  safeUnwrap(): Generator<Err<never, E>, T>

  /**
   * Unsafe: unwrap `Ok`, throw on `Err`.
   */
  _unsafeUnwrap(config?: ErrorConfig): T

  /**
   * Unsafe: unwrap `Err`, throw on `Ok`.
   */
  _unsafeUnwrapErr(config?: ErrorConfig): E
}

export class Ok<T, E> implements IResult<T, E> {
  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true
  }

  isErr(): this is Err<T, E> {
    return !this.isOk()
  }

  map<A>(f: (t: T) => A): Result<A, E> {
    return ok(f(this.value))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mapErr(_f: (e: E) => unknown): Result<T, never> {
    return ok(this.value)
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(f: any): any {
    return f(this.value)
  }

  /**
   * Like `andThen`, but splices the new `Ok` value onto the end of the current
   * value (either pushing onto an array or wrapping a scalar).
   */
  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    const result = f(this.value) as Result<OkOf<R>, ErrOf<R>>
    return result.map((v) =>
      // at runtime, build the same shape:
      [...(Array.isArray(this.value) ? (this.value as U) : ([this.value] as U)), v],
    )
  }

  /**
   * Run `f` on the last element of the array.
   * – If `f` returns `R extends Result<…>` → we return `Result<OkOf<R>, ErrOf<R>>`
   * – If `f` returns `Result<U, F>`        → we return `Result<U, F>`
   *
   * Compile-time: only callable when `T` is an array type.
   */
  andPop<R extends Result<unknown, unknown>, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => R,
  ): Result<OkOf<R>, ErrOf<R> | E>
  andPop<U, F, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => Result<U, F>,
  ): Result<U, E | F>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andPop(f: any): any {
    const arr = this.value as readonly unknown[]
    const last = arr[arr.length - 1]
    return f(last)
  }

  // public overloads:
  andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, ErrOf<R>>
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, F>
  andThrough(f: (t: T) => Result<unknown, unknown>): Result<T, unknown> {
    return f(this.value).map(() => this.value)
  }

  andTee(f: (t: T) => unknown): Result<T, E> {
    try {
      f(this.value)
    } catch (e) {
      // Tee doesn't care about the error
    }
    return ok<T, E>(this.value)
  }

  orTee(_f: (t: E) => unknown): Result<T, E> {
    return this
  }

  orElse<R extends Result<unknown, unknown>>(_f: (e: E) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(_f: (e: E) => Result<U, A>): Result<U | T, A>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(_f: any): any {
    return this
  }

  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    return f(this.value)
  }

  asyncAndThrough<E, R extends ResultAsync<unknown, E>>(f: (t: T) => R): ResultAsync<T, E> {
    return f(this.value).map(() => this.value)
  }

  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
    return ResultAsync.fromSafePromise(f(this.value))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unwrapOr<A>(_v: A): T | A {
    return this.value
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  match<A, B = A>(f: (t: T) => A, _err: (e: E) => B): A | B {
    return f(this.value)
  }

  safeUnwrap(): Generator<Err<never, E>, T> {
    const value = this.value
    /* eslint-disable-next-line require-yield */
    return (function* () {
      return value
    })()
  }

  _unsafeUnwrap(_?: ErrorConfig): T {
    return this.value
  }

  _unsafeUnwrapErr(config?: ErrorConfig): E {
    throw createNeverThrowError('Called `_unsafeUnwrapErr` on an Ok', this, config)
  }

  // eslint-disable-next-line @typescript-eslint/no-this-alias, require-yield
  *[Symbol.iterator](): Generator<Err<never, E>, T> {
    return this.value
  }
}

export class Err<T, E> implements IResult<T, E> {
  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false
  }

  isErr(): this is Err<T, E> {
    return !this.isOk()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  map<A>(_f: (t: T) => A): Result<A, E> {
    return err(this.error)
  }

  mapErr<U>(f: (e: E) => U): Result<T, U> {
    return err(f(this.error))
  }

  andThrough<F>(_f: (t: T) => Result<unknown, F>): Result<T, E | F> {
    return this
  }

  andTee(_f: (t: T) => unknown): Result<T, E> {
    return this
  }

  orTee(f: (t: E) => unknown): Result<T, E> {
    try {
      f(this.error)
    } catch (e) {
      // Tee doesn't care about the error
    }
    return err<T, E>(this.error)
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(_f: any): any {
    return this
  }

  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    _f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    return err(this.error)
  }

  andPop<R extends Result<unknown, unknown>, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => R,
  ): Result<OkOf<R>, ErrOf<R> | E>
  andPop<U, F, Arr extends unknown[]>(
    this: Result<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => Result<U, F>,
  ): Result<U, E | F>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andPop(_f: any): any {
    return err(this.error)
  }

  orElse<R extends Result<unknown, unknown>>(f: (e: E) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(f: (e: E) => Result<U, A>): Result<U | T, A>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f: any): any {
    return f(this.error)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncAndThen<U, F>(_f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    return errAsync<U, E>(this.error)
  }

  asyncAndThrough<F>(_f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F> {
    return errAsync<T, E>(this.error)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncMap<U>(_f: (t: T) => Promise<U>): ResultAsync<U, E> {
    return errAsync<U, E>(this.error)
  }

  unwrapOr<A>(v: A): T | A {
    return v
  }

  match<A, B = A>(_ok: (t: T) => A, f: (e: E) => B): A | B {
    return f(this.error)
  }

  safeUnwrap(): Generator<Err<never, E>, T> {
    const error = this.error
    return (function* () {
      yield err(error)

      throw new Error('Do not use this generator out of `safeTry`')
    })()
  }

  _unsafeUnwrap(config?: ErrorConfig): T {
    throw createNeverThrowError('Called `_unsafeUnwrap` on an Err', this, config)
  }

  _unsafeUnwrapErr(_?: ErrorConfig): E {
    return this.error
  }

  *[Symbol.iterator](): Generator<Err<never, E>, T> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    // @ts-expect-error -- This is structurally equivalent and safe
    yield self
    // @ts-expect-error -- This is structurally equivalent and safe
    return self
  }
}

export const fromThrowable = Result.fromThrowable
/** First-error-wins combine (handles the empty list case) */
export type CombineResults<T extends readonly Result<unknown, unknown>[]> = T extends []
  ? Result<never, never> //     ⟶ Ok<never, never>
  : Result<OkTuple<T>, ErrTuple<T>[number]>

/** Collect-all-errors combine (handles the empty list case) */
export type CombineResultsWithAllErrorsArray<
  T extends readonly Result<unknown, unknown>[]
> = T extends [] ? Result<never, never> : Result<OkTuple<T>, ErrTuple<T>[number][]>
//#endregion

const double: (number: number) => Result<number, Error> = Result.fromThrowable(
  (number: number) => {
    return 2 * number
  },
  (error) => (error instanceof Error ? error : new Error(String(error))),
)

const square: (number: number) => Result<number, Error> = Result.fromThrowable(
  (number: number) => {
    return number * number
  },
  (error) => (error instanceof Error ? error : new Error(String(error))),
)

const some = ok(2)
  .andPush(square)
  .andPush(([, v]) => double(v))
const someOther = ok(2).andPop(square).andThen(double)
