import type { ErrOf, OkOf } from '_internals/types'
import { ok, err } from 'constructors/creators'
import type { Result } from 'core/result'
import { ResultAsync } from 'core/result-async'
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
  const result = n.value
  return result.isOk() ? ok(result.data.value!) : err(result.data.error!)
}
