import { errAsync, ResultAsync } from './result-async'
import { createNeverThrowError, ErrorConfig } from './_internals/error'
import { combineResultList, combineResultListWithAllErrors } from './_internals/utils'
import { ErrOf, ErrTuple, OkOf, OkTuple } from './_internals/types'

// Discriminated union for Result data
export type ResultData<T, E> = {
  value?: T;
  error?: E;
};

export class Result<T, E> {
  readonly data: ResultData<T, E>

  constructor(data: ResultData<T, E>) {
    this.data = data;
  }

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>({ value })
  }

  static err<T = never, E = unknown>(error: E): Result<T, E> {
    return new Result<T, E>({ error })
  }

  /**
   * Wraps a function with a try catch, creating a new function with the same
   * arguments but returning `Ok` if successful, `Err` if the function throws
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromThrowable<Fn extends (...args: readonly any[]) => any, E>(
    fn: Fn,
    errorFn?: (e: unknown) => E,
  ): (...args: Parameters<Fn>) => Result<ReturnType<Fn>, E> {
    return (...args) => {
      try {
        return ok(fn(...args))
      } catch (e) {
        return err(errorFn ? errorFn(e) : e)
      }
    }
  }

  static combine<const A extends readonly Result<unknown, unknown>[]>(
    resultList: A,
  ): CombineResults<A>
  static combine(
    resultList: readonly Result<unknown, unknown>[],
  ): Result<unknown, unknown> {
    return combineResultList(resultList)
  }

  static combineWithAllErrors<
    T extends readonly [Result<unknown, unknown>, ...Result<unknown, unknown>[]]
  >(resultList: [...T]): CombineResultsWithAllErrorsArray<T>
  static combineWithAllErrors<A extends readonly Result<unknown, unknown>[]>(
    resultList: A,
  ): CombineResultsWithAllErrorsArray<A>
  static combineWithAllErrors(
    resultList: readonly Result<unknown, unknown>[],
  ): Result<unknown, unknown> {
    return combineResultListWithAllErrors(resultList)
  }

  isOk(): this is Result<T, E> & { data: { value: T; error?: undefined } } {
    return 'value' in this.data
  }

  isErr(): this is Result<T, E> & { data: { error: E; value?: undefined } } {
    return 'error' in this.data
  }

  // Getters for backward compatibility (with proper type safety)
  get value(): T {
    if (this.isOk()) {
      return this.data.value!;
    }
    throw new Error('Cannot access value on Err result');
  }

  get error(): E {
    if (this.isErr()) {
      return this.data.error!;
    }
    throw new Error('Cannot access error on Ok result');
  }

  // Legacy _tag getter for backward compatibility
  get _tag(): 'ok' | 'err' {
    return this.isOk() ? 'ok' : 'err';
  }


  map<A>(f: (t: T) => A): Result<A, E> {
    return this.isOk()
      ? Result.ok(f(this.data.value!))
      : Result.err(this.data.error!);
  }

  mapErr<U>(f: (e: E) => U): Result<T, U> {
    return this.isErr()
      ? Result.err(f(this.data.error!))
      : Result.ok(this.data.value!);
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  andThen(f: (t: T) => Result<unknown, unknown>): Result<unknown, unknown> {
    return this.isOk() ? f(this.data.value!) : Result.err(this.data.error!);
  }

  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    if (this.isErr()) return Result.err(this.data.error!);
    const value = this.data.value!;
    const result = f(value) as Result<OkOf<R>, ErrOf<R>>;
    return result.map((v) =>
      [...(Array.isArray(value) ? (value as U) : ([value] as U)), v]
    );
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
    if (this.isErr()) return Result.err(this.data.error!);
    const arr = this.data.value! as readonly unknown[];
    return f(arr[arr.length - 1]);
  }

  andTee(f: (t: T) => unknown): Result<T, E> {
    if (this.isOk()) {
      try { 
        f(this.data.value!);
      } catch {
        // Ignore errors in tee operations
      }
    }
    return this
  }

  orTee(f: (e: E) => unknown): Result<T, E> {
    if (this.isErr()) {
      try { 
        f(this.data.error!);
      } catch {
        // Ignore errors in tee operations
      }
    }
    return this
  }

  andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, ErrOf<R> | E>
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, E | F>
  andThrough(f: (t: T) => Result<unknown, unknown>): Result<T, unknown> {
    return this.isOk()
      ? f(this.data.value!).map(() => this.data.value!)
      : Result.err(this.data.error!);
  }

  orElse<R extends Result<unknown, unknown>>(f: (e: E) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(f: (e: E) => Result<U, A>): Result<U | T, A>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f: (e: E) => any): any {
    return this.isErr() ? f(this.data.error!) : this;
  }

  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    return this.isOk()
      ? f(this.data.value!)
      : errAsync<U, E>(this.data.error!);
  }

  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
    return this.isOk()
      ? ResultAsync.fromSafePromise(f(this.data.value!))
      : errAsync<U, E>(this.data.error!);
  }

  unwrapOr<A>(v: A): T | A {
    return this.isOk() ? this.data.value! : v;
  }

  match<A, B = A>(okFn: (t: T) => A, errFn: (e: E) => B): A | B {
    return this.isOk()
      ? okFn(this.data.value!)
      : errFn(this.data.error!);
  }

  /**
   * @deprecated Emulates Rust's `?` in `safeTry`; will be removed in 9.0.0.
   */
  safeUnwrap(): Generator<Result<never, E>, T> {
    if (this.isOk()) {
      const value = this.data.value!;
      /* eslint-disable-next-line require-yield */
      return (function* () { return value })();
    } else {
      const error = this.data.error!;
      return (function* () {
        yield Result.err(error);
        throw new Error('Do not use this generator out of `safeTry`');
      })();
    }
  }

  _unsafeUnwrap(config?: ErrorConfig): T {
    if (this.isOk()) return this.data.value!;
    throw createNeverThrowError('Called `_unsafeUnwrap` on an Err', this, config);
  }

  _unsafeUnwrapErr(config?: ErrorConfig): E {
    if (this.isErr()) return this.data.error!;
    throw createNeverThrowError('Called `_unsafeUnwrapErr` on an Ok', this, config);
  }

  *[Symbol.iterator](): Generator<Result<never, E>, T> {
    if (this.isOk()) {
      return this.data.value!;
    } else {
      // @ts-expect-error -- This is structurally equivalent and safe
      yield this;
      // @ts-expect-error -- This is structurally equivalent and safe
      return this;
    }
  }

  /**
   * Like andThrough, but for async functions returning ResultAsync. If Ok, calls f, and if f resolves Ok, returns the original value as Ok, else propagates the error.
   */
  asyncAndThrough<R extends ResultAsync<unknown, unknown>>(f: (t: T) => R): ResultAsync<T, E | ErrOf<R>>
  asyncAndThrough<F>(f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F>
  asyncAndThrough(f: (t: T) => ResultAsync<unknown, unknown>): ResultAsync<T, unknown> {
    if (this.isOk()) {
      const value = this.data.value!;
      return f(value).map(() => value);
    } else {
      return errAsync<T, E>(this.data.error!);
    }
  }
}

export class Ok<T, E> extends Result<T, E> {
  constructor(value: T) {
    super({ value });
  }
}

export class Err<T, E> extends Result<T, E> {
  constructor(error: E) {
    super({ error });
  }
}

/**
 * Evaluates the given generator to a Result returned or an Err yielded from it,
 * whichever comes first.
 */
export function safeTry<T, E>(body: () => Generator<Result<never, E>, Result<T, E>>): Result<T, E>
export function safeTry<
  YieldErr extends Result<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>
>(
  body: () => Generator<YieldErr, GeneratorReturnResult>,
): Result<OkOf<GeneratorReturnResult>, ErrOf<YieldErr> | ErrOf<GeneratorReturnResult>>

export function safeTry<T, E>(
  body: () => AsyncGenerator<Result<never, E>, Result<T, E>>,
): ResultAsync<T, E>
export function safeTry<
  YieldErr extends Result<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>
>(
  body: () => AsyncGenerator<YieldErr, GeneratorReturnResult>,
): ResultAsync<OkOf<GeneratorReturnResult>, ErrOf<YieldErr> | ErrOf<GeneratorReturnResult>>
export function safeTry<T, E>(
  body:
    | (() => Generator<Result<never, E>, Result<T, E>>)
    | (() => AsyncGenerator<Result<never, E>, Result<T, E>>),
): Result<T, E> | ResultAsync<T, E> {
  const n = body().next()
  if (n instanceof Promise) {
    return new ResultAsync(n.then((r) => r.value))
  }
  return n.value
}

export const fromThrowable = Result.fromThrowable

/** First-error-wins combine (handles the empty list case) */
export type CombineResults<T extends readonly Result<unknown, unknown>[]> = T extends []
  ? Result<never, never>
  : Result<OkTuple<T>, ErrTuple<T>[number]>

/** Collect-all-errors combine (handles the empty list case) */
export type CombineResultsWithAllErrorsArray<
  T extends readonly Result<unknown, unknown>[]
> = T extends [] ? Result<never, never> : Result<OkTuple<T>, ErrTuple<T>[number][]>

// Factory functions for ergonomics
export function ok<T, E = never>(value: T): Result<T, E>
export function ok<T extends void = void, E = never>(value: void): Result<void, E>
export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value)
}

export function err<T = never, E extends string = string>(error: E): Result<T, E>
export function err<T = never, E = unknown>(error: E): Result<T, E>
export function err<T = never, E extends void = void>(error: void): Result<T, void>
export function err<T = never, E = unknown>(error: E): Result<T, E> {
  return new Err(error)
}