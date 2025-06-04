import { errAsync, okAsync, ResultAsync } from './result-async'
import { createNeverThrowError, ErrorConfig } from './_internals/error'
import { ErrOf, OkOf } from './_internals/types'

// Discriminated union for Result data (internal only)
export type ResultData<T, E> =
  | {
      value: T
      error?: undefined
    }
  | {
      value?: undefined
      error: E
    }

type OkData<T, E> = Extract<ResultData<T, E>, { value: T }>
type ErrData<T, E> = Extract<ResultData<T, E>, { error: E }>
function isResultLike<T, E>(value: T | Result<T, E>): value is Result<T, E> {
  return typeof value === 'object' && value !== null && 'isOk' in value && 'isErr' in value
}

// Enhanced serialization types
export interface SerializedOk<T> {
  type: 'Ok'
  value: T
}

export interface SerializedErr<E> {
  type: 'Err'
  error: E
}

export type SerializedResult<T, E> = SerializedOk<T> | SerializedErr<E>

class BaseResult<T, E> {
  readonly data: ResultData<T, E>

  constructor(data: ResultData<T, E>) {
    this.data = data
  }

  /**
   * Serializes the Result to a JSON-safe object
   */
  toJSON(): SerializedResult<T, E> {
    if (this.isOk()) {
      return {
        type: 'Ok',
        value: this.data.value!,
      }
    } else {
      return {
        type: 'Err',
        error: this.data.error!,
      }
    }
  }

  /**
   * Serializes to a JSON string
   */
  serialize(): string {
    return JSON.stringify(this.toJSON())
  }

  // Type guards
  isOk(): this is Ok<T, E> {
    return 'value' in this.data
  }

  isErr(): this is Err<T, E> {
    return 'error' in this.data
  }

  map<A>(f: (t: T) => A): Result<A, E> {
    return this.isOk() ? new Ok<A, E>(f(this.data.value!)) : new Err<A, E>(this.data.error!)
  }

  mapErr<U>(f: (e: E) => U): Result<T, U> {
    return this.isErr() ? new Err<T, U>(f(this.data.error!)) : new Ok<T, U>(this.data.value!)
  }

  andThen<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<OkOf<R>, ErrOf<R> | E>
  andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>
  andThen(f: (t: T) => Result<unknown, unknown>): Result<unknown, unknown> {
    if (this.isOk()) {
      const result = f(this.data.value!)
      return result.isOk() ? new Ok(result.data.value!) : new Err(result.data.error!)
    }
    return new Err(this.data.error!)
  }

  andPush<R extends Result<unknown, unknown>, U extends T extends readonly unknown[] ? T : [T]>(
    f: (t: T) => R,
  ): Result<[...U, OkOf<R>], ErrOf<R> | E> {
    if (this.isErr()) return new Err<[...U, OkOf<R>], ErrOf<R> | E>(this.data.error!)

    const value = this.data.value!
    const result = f(value) as Result<OkOf<R>, ErrOf<R>>

    if (result.isErr()) {
      return new Err<[...U, OkOf<R>], ErrOf<R> | E>(result.data.error!)
    }

    const newValue = [
      ...(Array.isArray(value) ? (value as U) : ([value] as U)),
      result.data.value!,
    ] as [...U, OkOf<R>]
    return new Ok<[...U, OkOf<R>], ErrOf<R> | E>(newValue)
  }

  andPop<R extends Result<unknown, unknown>, Arr extends unknown[]>(
    this: BaseResult<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => R,
  ): Result<OkOf<R>, ErrOf<R> | E>
  andPop<U, F, Arr extends unknown[]>(
    this: BaseResult<Arr, E>,
    f: (t: T extends readonly [...infer _Rest, infer Last] ? Last : never) => Result<U, F>,
  ): Result<U, E | F>
  andPop(
    f: (
      t: T extends readonly [...infer _Rest, infer Last] ? Last : never,
    ) => Result<unknown, unknown>,
  ): Result<unknown, unknown> {
    if (this.isErr()) return new Err(this.data.error!)

    const arr = this.data.value! as readonly unknown[]
    const result = f(
      arr[arr.length - 1] as T extends readonly [...infer _Rest, infer Last] ? Last : never,
    )

    return result.isOk() ? new Ok(result.data.value!) : new Err(result.data.error!)
  }

  andTee(f: (t: T) => unknown): Result<T, E> {
    if (this.isOk()) {
      try {
        f(this.data.value!)
      } catch {
        // Ignore errors in tee operations
      }
    }
    return this.isOk() ? new Ok<T, E>(this.data.value!) : new Err<T, E>(this.data.error!)
  }

  orTee(f: (e: E) => unknown): Result<T, E> {
    if (this.isErr()) {
      try {
        f(this.data.error!)
      } catch {
        // Ignore errors in tee operations
      }
    }
    return this.isOk() ? new Ok<T, E>(this.data.value!) : new Err<T, E>(this.data.error!)
  }

  andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, ErrOf<R> | E>
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, E | F>
  andThrough(f: (t: T) => Result<unknown, unknown>): Result<T, unknown> {
    if (this.isOk()) {
      const result = f(this.data.value!)
      return result.isOk() ? this : new Err<T, unknown>(result.data.error!)
    }
    return (this as unknown) as Result<T, unknown>
  }

  orElse<R extends Result<unknown, unknown>>(f: (e: E) => R): Result<OkOf<R> | T, ErrOf<R>>
  orElse<U, A>(f: (e: E) => Result<U, A>): Result<U | T, A>
  orElse(f: (e: E) => Result<unknown, unknown>): Result<unknown, unknown> {
    return this.isErr() ? f(this.data.error!) : new Ok(this.data.value!)
  }

  asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
    return this.isOk() ? f(this.data.value!) : errAsync<U, E>(this.data.error!)
  }

  asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
    return this.isOk()
      ? ResultAsync.fromSafePromise(f(this.value))
      : errAsync<U, E>(this.data.error!)
  }

  /**
   * Like andThrough, but for async functions returning ResultAsync. If Ok, calls f, and if f resolves Ok, returns the original value as Ok, else propagates the error.
   */
  asyncAndThrough<R extends ResultAsync<unknown, unknown>>(
    f: (t: T) => R,
  ): ResultAsync<T, E | ErrOf<R>>
  asyncAndThrough<F>(f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F>
  asyncAndThrough(f: (t: T) => ResultAsync<unknown, unknown>): ResultAsync<T, unknown> {
    if (this.isOk()) {
      return f(this.data.value!).map(() => this.data.value!)
    } else {
      return errAsync<T, E>(this.data.error!)
    }
  }

  unwrapOr<A>(v: A): T | A {
    return this.isOk() ? this.data.value! : v
  }

  match<A, B = A>(okFn: (t: T) => A, errFn: (e: E) => B): A | B {
    return this.isOk() ? okFn(this.data.value!) : errFn(this.data.error!)
  }

  _unsafeUnwrap(config?: ErrorConfig): T {
    if (this.isOk()) return this.data.value!
    throw createNeverThrowError(
      'Called `_unsafeUnwrap` on an Err',
      (this as unknown) as Ok<T, E>,
      config,
    )
  }

  _unsafeUnwrapErr(config?: ErrorConfig): E {
    if (this.isErr()) return this.error
    throw createNeverThrowError(
      'Called `_unsafeUnwrapErr` on an Ok',
      (this as unknown) as Ok<T, E>,
      config,
    )
  }

  /**
   * Applies a function contained in this Result to an argument.
   * This is the traditional applicative "apply" operation.
   *
   * @param arg - Either a Result<U, E> or a plain value U
   * @returns Result<V, E> where V is the return type of the function
   *
   * @example
   * // With Result argument
   * ok((x: number) => x * 2).apply(ok(5))        // Ok(10)
   * ok((x: number) => x * 2).apply(5)             // Ok(10)
   * ok((x: number) => x * 2).apply(err("bad"))   // Err("bad")
   * err("bad func").apply(ok(5))                 // Err("bad func")
   *
   * // With plain argument
   * ok((x: number) => x * 2).apply(5)            // Ok(10)
   * err("bad func").apply(5)                     // Err("bad func")
   */
  apply<U, V>(this: Result<(arg: U) => V, E>, arg: Result<U, E> | U): Result<V, E> {
    // If this Result contains an error, propagate it
    if (this.isErr()) {
      return new Err<V, E>(this.data.error!)
    }

    // Extract the function from this Result
    const fn = this.data.value!

    // Handle the argument
    let argValue: U
    if (isResultLike(arg)) {
      // arg is a Result

      if (arg.isErr()) {
        return new Err<V, E>(arg.data.error!)
      }
      argValue = arg.value
    } else {
      // arg is a plain value
      argValue = arg
    }

    // Apply the function to the argument
    try {
      const result = fn(argValue)
      return new Ok<V, E>(result)
    } catch (error) {
      return new Err<V, E>(error as E)
    }
  }
}

export class Ok<T, E> extends BaseResult<T, E> {
  declare data: OkData<T, E>

  constructor(value: T) {
    super({ value })
  }

  get value(): T {
    return this.data.value
  }

  get error(): undefined {
    return undefined
  }

  // eslint-disable-next-line require-yield
  *[Symbol.iterator](): Generator<Ok<never, E>, T> {
    return this.value
  }
}

export class Err<T, E> extends BaseResult<T, E> {
  declare data: ErrData<T, E>

  constructor(error: E) {
    super({ error })
  }

  get error(): E {
    return this.data.error
  }

  get value(): undefined {
    return undefined
  }

  // eslint-disable-next-line require-yield
  *[Symbol.iterator](): Generator<Err<never, E>, T> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    // @ts-expect-error -- This is structurally equivalent and safe
    yield self
    // @ts-expect-error -- This is structurally equivalent and safe
    return self
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>
