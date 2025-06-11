import { err, ok } from "constructors/creators"
import type { Result } from "core/result"
import { ResultAsync } from "core/result-async"

type MaybeAsyncResult<T, E> = Result<T, E> | ResultAsync<T, E>
/**
 * Short circuits on the FIRST Err value that we find
 */
function combineResultList<T, E>(list: readonly Result<T, E>[]): Result<readonly T[], E> {
  const out: T[] = []
  for (const r of list) {
    if (r.isErr()) return err(r.error)
      
    out.push(r.value)
  }
  return ok(out)
}

export const combineResultAsyncList = <T, E>(
  asyncResultList: readonly ResultAsync<T, E>[],
): ResultAsync<readonly T[], E> => {
  return ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList)
}

/**
 * Accumulate *all* Err<E> into an array. If unknown errors, Err<E[]>;
 * otherwise Ok<T[]> of all the values.
 */
function combineResultListWithAllErrors<T, E>(
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





/** Recursive type to extract only value types, using Head/Tail pattern */
type CombineValues<T> = T extends []
  ? []
  : T extends readonly [infer H, ...infer Rest]
  ? H extends MaybeAsyncResult<infer V, infer _E>
    ? [V, ...CombineValues<Rest>]
    : H extends ResultAsync<infer V, infer _E>
    ? [V, ...CombineValues<Rest>]
    : never
  : never

/** Recursive type to extract only error types for sync Results */
type CombineErrors<T> = T extends []
  ? never
  : T extends readonly [infer H, ...infer Rest]
  ? H extends MaybeAsyncResult<infer _V, infer E>
    ? unknown extends E
      ? CombineErrors<Rest>
      : E | CombineErrors<Rest>
    : never
  : never

type CombineMultipleErrors<T> = T extends []
  ? []
  : T extends readonly [infer H, ...infer Rest]
  ? H extends MaybeAsyncResult<unknown, infer E>
    ? unknown extends E
      ? CombineMultipleErrors<Rest>
      : [E, ...CombineMultipleErrors<Rest>]
    : never
  : never


/** Type for sync combine results */
export type CombineSyncResults<T, CE = CombineErrors<T>> = T extends []
  ? Result<never, never>
  : Result<CombineValues<T>, CE>

/** Type for async combine results */
export type CombineAsyncResults<T, CE = CombineErrors<T>> = T extends []
  ? ResultAsync<never, never>
  : ResultAsync<CombineValues<T>, CE>



// =============================================================================
// PUBLIC SYNC COMBINE API
// =============================================================================

// eslint-disable-next-line prettier/prettier
export function combine<T, E, const L extends readonly [...Result<T, E>[]]>(
  resultList: L,
): CombineSyncResults<L> {
  return combineResultList(resultList) as CombineSyncResults<L>
}

/**
 * Combines multiple Results into a single Result, collecting all errors
 * If all Results are Ok, returns Ok with array of all values
 * If any Result is Err, returns Err with array of all errors
 */
export function combineWithAllErrors<T, const L extends readonly [...Result<T, unknown>[]]>(
  resultList: L,
): CombineSyncResults<L, CombineMultipleErrors<L>> {
  return combineResultListWithAllErrors(resultList) as CombineSyncResults<L, CombineMultipleErrors<L>>
}

// =============================================================================
// PUBLIC ASYNC COMBINE API
// =============================================================================

export function combineAsync<T, const L extends readonly [...ResultAsync<T, unknown>[]]>(
  asyncResultList: L,
): CombineAsyncResults<L> {
  return combineResultAsyncList(asyncResultList) as CombineAsyncResults<L>
}

export function combineAsyncWithAllErrors<T, const L extends readonly [...ResultAsync<T, unknown>[]]>(
  asyncResultList: L,
): CombineAsyncResults<L, CombineMultipleErrors<L>> {
  return combineResultAsyncListWithAllErrors(asyncResultList) as CombineAsyncResults<L, CombineMultipleErrors<L>>
}



