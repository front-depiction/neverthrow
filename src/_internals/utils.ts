import { Result, ok, err } from '../result-utils'
import { ResultAsync } from '../result-async'

/**
 * Short circuits on the FIRST Err value that we find
 */
export function combineResultList<T, E>(list: readonly Result<T, E>[]): Result<readonly T[], E> {
  const out: T[] = []
  for (const r of list) {
    if (r.isErr()) return err(r.error)
    out.push(r.value)
  }
  return ok(out)
}

/* This is the typesafe version of Promise.all
 *
 * Takes a list of ResultAsync<T, E> and success if all inner results are Ok values
 * or fails if one (or more) of the inner results are Err values
 */
export const combineResultAsyncList = <T, E>(
  asyncResultList: readonly ResultAsync<T, E>[],
): ResultAsync<readonly T[], E> => {
  return ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList)
}

/**
 * Accumulate *all* Err<E> into an array. If unknown errors, Err<E[]>;
 * otherwise Ok<T[]> of all the values.
 */
export function combineResultListWithAllErrors<T, E>(
  list: readonly Result<T, E>[],
): Result<readonly T[], E[]> {
  const oks: T[] = []
  const errs: E[] = []

  for (const r of list) {
    r.match(
      (v) => oks.push(v),
      (e) => errs.push(e),
    )
  }

  return errs.length > 0 ? err(errs) : ok(oks)
}

export const combineResultAsyncListWithAllErrors = <T, E>(
  asyncResultList: readonly ResultAsync<T, E>[],
): ResultAsync<readonly T[], E[]> =>
  ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultListWithAllErrors)

export function isIterable(obj: unknown): obj is Iterable<unknown> {
  return obj !== null && typeof obj === 'object' && Symbol.iterator in obj
}
export function isIterator(obj: unknown): obj is Iterator<unknown> {
  return obj !== null && typeof obj === 'object' && 'next' in obj && typeof obj.next === 'function'
}
