// Export the core types and classes
import { UnknownError as _UnknownError } from './_internals/error'

import type { Result as ResultType } from './core/result'
import { ResultAsync as ResultAsyncType } from './core/result-async'
import * as Creators from './constructors/creators'
import { fromThrowable as _fromAsyncThrowable } from './functions/result-async-function'
import { fromThrowable as _fromSyncThrowable } from './functions/result-function'
import {
  combine as _combineSync,
  combineWithAllErrors as _combineWithAllErrorsSync,
  combineAsync as _combineAsync,
  combineAsyncWithAllErrors as _combineAsyncWithAllErrors,
} from 'combinators/combine'
import { fromJSON as fromJSONSync, deserialize as deserializeSync } from './core/result'
export { Ok, Err } from './core/result'
import { lift as _liftSync } from 'functions/lift'
export type { LiftedFunction } from 'functions/lift'

import { resultFn as _resultFnSync } from './functions/result-function'
export type { ResultCallable } from './functions/result-function'

import { resultFnAsync as _resultFnAsync } from './functions/result-async-function'
export type { ResultAsyncCallable } from './functions/result-async-function'

export { safeTry } from './safe-try'

export type Result<T, E> = ResultType<T, E>
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Result {
  export const ok = Creators.ok
  export const err = Creators.err
  export const fromThrowable = _fromSyncThrowable
  export const combine = _combineSync
  export const combineWithAllErrors = _combineWithAllErrorsSync
  export const fromJSON = fromJSONSync
  export const deserialize = deserializeSync
  export const resultFn = _resultFnSync
  export const lift = _liftSync
}

export type ResultAsync<T, E> = ResultAsyncType<T, E>
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ResultAsync {
  export const fromThrowable = _fromAsyncThrowable
  export const fromSafePromise = ResultAsyncType.fromSafePromise
  export const fromPromise = ResultAsyncType.fromPromise
  export const combine = _combineAsync
  export const combineWithAllErrors = _combineAsyncWithAllErrors
  export const resultFn = _resultFnAsync
}

//standalone exports

export const ok = Creators.ok
export const okAsync = Creators.okAsync
export const err = Creators.err
export const errAsync = Creators.errAsync
export const fromThrowable = _fromSyncThrowable
export const fromAsyncThrowable = _fromAsyncThrowable
export const fromPromise = ResultAsync.fromPromise
export const fromSafePromise = ResultAsync.fromSafePromise
export const combine = _combineSync
export const combineAsync = _combineAsync
export const combineWithAllErrors = _combineWithAllErrorsSync
export const combineAsyncWithAllErrors = _combineAsyncWithAllErrors
export const fromJSON = fromJSONSync
export const deserialize = deserializeSync
export const lift = _liftSync
export const resultFn = _resultFnSync
export const resultFnAsync = _resultFnAsync

export const UnknownError = _UnknownError
