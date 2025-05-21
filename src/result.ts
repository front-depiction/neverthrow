import { errAsync, ResultAsync } from './result-async'
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

export function ok<T, E = never>(value: T, breadcrumbs?: string[]): Ok<T, E>
export function ok<T extends void = void, E = never>(value: void, breadcrumbs?: string[]): Ok<void, E>
export function ok<T, E = never>(value: T, breadcrumbs?: string[]): Ok<T, E> {
  return new Ok(value, breadcrumbs)
}

export function err<T = never, E extends string = string>(err: E, breadcrumbs?: string[]): Err<T, E>
export function err<T = never, E = unknown>(err: E, breadcrumbs?: string[]): Err<T, E>
export function err<T = never, E extends void = void>(err: void, breadcrumbs?: string[]): Err<T, void>
export function err<T = never, E = unknown>(err: E, breadcrumbs?: string[]): Err<T, E> {
  return new Err(err, breadcrumbs)
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

// either get the name, or a snippet of the source code if the function is anonymous
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateBreadcrumb(f: (...args: any[]) => any): string {
  return f.name.trim() || f.toString().slice(0, 15).trim() + '...'
}

export class Ok<T, E> implements IResult<T, E> {
  constructor(readonly value: T, readonly breadcrumbs: string[] = []) {}

  isOk(): this is Ok<T, E> {
    return true
  }

  isErr(): this is Err<T, E> {
    return !this.isOk()
  }

  map<A>(f: (t: T) => A): Result<A, E> {
    this.breadcrumbs.push('map: ' + generateBreadcrumb(f))
    return ok(f(this.value), this.breadcrumbs)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mapErr(_f: (e: E, breadcrumbs: string[]) => unknown): Result<T, never> {
    this.breadcrumbs.push('mapErr: ' + generateBreadcrumb(_f))
    return ok(this.value, this.breadcrumbs)
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(f: (t: T) => Result<unknown, unknown>): Result<unknown, unknown> {
    const result = f(this.value)
    result.breadcrumbs.push(...this.breadcrumbs, 'andThen: ' + generateBreadcrumb(f))
    return result
  }

  /**
   * Like `andThen`, but splices the new `Ok` value onto the end of the current
   * value (either pushing onto an array or wrapping a scalar).
   */
  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    const result = f(this.value) as Result<OkOf<R>, ErrOf<R>>
    result.breadcrumbs.push(...this.breadcrumbs, 'andPush: ' + generateBreadcrumb(f))
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
    this.breadcrumbs.push('andPop: ' + generateBreadcrumb(f))
    const arr = this.value as readonly unknown[]
    const last = arr[arr.length - 1]
    return f(last)
  }

  // public overloads:
  andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, ErrOf<R>>
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, F>
  andThrough(f: (t: T) => Result<unknown, unknown>): Result<T, unknown> {
    this.breadcrumbs.push('andThrough: ' + generateBreadcrumb(f))
    return f(this.value).map(() => this.value)
  }

  andTee(f: (t: T) => unknown): Result<T, E> {
    this.breadcrumbs.push('andTee: ' + generateBreadcrumb(f))
    try {
      f(this.value)
    } catch (e) {
      // Tee doesn't care about the error
    }
    return ok<T, E>(this.value, this.breadcrumbs)
  }

  orTee(_f: (t: E, breadcrumbs: string[]) => unknown): Result<T, E> {
    this.breadcrumbs.push('orTee: ' + generateBreadcrumb(_f))
    return this
  }

  orElse<R extends Result<unknown, unknown>>(_f: (e: E, breadcrumbs: string[]) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(_f: (e: E) => Result<U, A>): Result<U | T, A>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f: any): any {
    this.breadcrumbs.push('orElse: ' + generateBreadcrumb(f))
    return this
  }

  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    this.breadcrumbs.push('asyncAndThen: ' + generateBreadcrumb(f))
    return f(this.value)
  }

  asyncAndThrough<E, R extends ResultAsync<unknown, E>>(f: (t: T) => R): ResultAsync<T, E> {
    this.breadcrumbs.push('asyncAndThrough: ' + generateBreadcrumb(f))
    return f(this.value).map(() => this.value)
  }

  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
    this.breadcrumbs.push('asyncMap: ' + generateBreadcrumb(f))
    return ResultAsync.fromSafePromise(f(this.value))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unwrapOr<A>(_v: A): T | A {
    this.breadcrumbs.push('unwrapOr')
    return this.value
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  match<A, B = A>(f: (t: T) => A, _err: (e: E, breadcrumbs: string[]) => B): A | B {
    this.breadcrumbs.push('match: ' + generateBreadcrumb(f))
    return f(this.value)
  }

  safeUnwrap(): Generator<Err<never, E>, T> {
    this.breadcrumbs.push('safeUnwrap')
    const value = this.value
    /* eslint-disable-next-line require-yield */
    return (function* () {
      return value
    })()
  }

  _unsafeUnwrap(_?: ErrorConfig): T {
    this.breadcrumbs.push('_unsafeUnwrap')
    return this.value
  }

  _unsafeUnwrapErr(config?: ErrorConfig): E {
    this.breadcrumbs.push('_unsafeUnwrapErr')
    throw createNeverThrowError('Called `_unsafeUnwrapErr` on an Ok', this, config)
  }

  // eslint-disable-next-line @typescript-eslint/no-this-alias, require-yield
  *[Symbol.iterator](): Generator<Err<never, E>, T> {
    this.breadcrumbs.push('Symbol.iterator')
    return this.value
  }
}

export class Err<T, E> implements IResult<T, E> {
  constructor(readonly error: E, readonly breadcrumbs: string[] = []) {}

  isOk(): this is Ok<T, E> {
    return false
  }

  isErr(): this is Err<T, E> {
    return !this.isOk()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  map<A>(_f: (t: T) => A): Result<A, E> {
    this.breadcrumbs.push('map')
    return err(this.error, this.breadcrumbs)
  }

  mapErr<U>(f: (e: E, breadcrumbs: string[]) => U): Result<T, U> {
    this.breadcrumbs.push('mapErr: ' + generateBreadcrumb(f))
    return err(f(this.error, this.breadcrumbs), this.breadcrumbs)
  }

  andThrough<F>(_f: (t: T) => Result<unknown, F>): Result<T, E | F> {
    this.breadcrumbs.push('andThrough: ' + generateBreadcrumb(_f))
    return this
  }

  andTee(_f: (t: T) => unknown): Result<T, E> {
    this.breadcrumbs.push('andTee: ' + generateBreadcrumb(_f))
    return this
  }

  orTee(f: (t: E, breadcrumbs: string[]) => unknown): Result<T, E> {
    this.breadcrumbs.push('orTee: ' + generateBreadcrumb(f))
    try {
      f(this.error, this.breadcrumbs)
    } catch (e) {
      // Tee doesn't care about the error
    }
    return err<T, E>(this.error, this.breadcrumbs)
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(f: any): any {
    this.breadcrumbs.push('andThen: ' + generateBreadcrumb(f))
    return this
  }

  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    this.breadcrumbs.push('andPush: ' + generateBreadcrumb(f))
    return err(this.error, this.breadcrumbs)
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
  andPop(f: any): any {
    this.breadcrumbs.push('andPop: ' + generateBreadcrumb(f))
    return err(this.error, this.breadcrumbs)
  }

  orElse<R extends Result<unknown, unknown>>(f: (e: E, breadcrumbs: string[]) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(f: (e: E, breadcrumbs: string[]) => Result<U, A>): Result<U | T, A>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f: (e: E, breadcrumbs: string[]) => any): any {
    this.breadcrumbs.push('orElse: ' + generateBreadcrumb(f))
    return f(this.error, this.breadcrumbs)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    this.breadcrumbs.push('asyncAndThen: ' + generateBreadcrumb(f))
    return errAsync<U, E>(this.error)
  }

  asyncAndThrough<F>(f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F> {
    this.breadcrumbs.push('asyncAndThrough: ' + generateBreadcrumb(f))
    return errAsync<T, E>(this.error)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
    this.breadcrumbs.push('asyncMap: ' + generateBreadcrumb(f))
    return errAsync<U, E>(this.error)
  }

  unwrapOr<A>(v: A): T | A {
    this.breadcrumbs.push('unwrapOr')
    return v
  }

  match<A, B = A>(_ok: (t: T) => A, f: (e: E, breadcrumbs: string[]) => B): A | B {
    this.breadcrumbs.push('match: ' + generateBreadcrumb(f))
    return f(this.error, this.breadcrumbs)
  }

  safeUnwrap(): Generator<Err<never, E>, T> {
    const error = this.error
    return (function* () {
      yield err(error, this.breadcrumbs)

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
const someOther = ok([2]).andPop(square).andThen(double)
