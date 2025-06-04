import type { Result } from '../result'
import { ResultAsync } from '../result-async'

export type SomeResult<T, E> = Result<T, E> | ResultAsync<T, E>
/**
 * Generic extractor for the success (T) side
 * of either Result or ResultAsync.
 */
export type OkOf<R> = R extends Result<infer T, unknown>
  ? T
  : R extends ResultAsync<infer T, unknown>
  ? T
  : never

/**
 * Generic extractor for the error (E) side
 * of either Result or ResultAsync.
 */
export type ErrOf<R> = R extends Result<unknown, infer E>
  ? E
  : R extends ResultAsync<unknown, infer E>
  ? E
  : never

/** Map a tuple / readonly array of Results or ResultAsyncs to their Ok sides. */
export type OkTuple<T extends readonly SomeResult<unknown, unknown>[]> = {
  [K in keyof T]: OkOf<T[K]>
}

/** Map a tuple / readonly array of Results or ResultAsyncs to their Err sides. */
export type ErrTuple<T extends readonly SomeResult<unknown, unknown>[]> = {
  [K in keyof T]: ErrOf<T[K]>
}

//Unknown error class
export class UnknownError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args)
    this.name = 'UnknownError'
  }
}
