// Export the core types and classes
import { Result as ResultType } from './result'
export { Ok, Err } from './result'
import * as ResultUtils from './result-utils'

export { safeTry } from './safe-try'
export {
  ResultAsync,
  okAsync,
  errAsync,
  fromThrowable as fromAsyncThrowable,
  fromSafePromise,
  fromPromise,
} from './result-async'

export { resultFnAsync, fromAsync } from './result-async-function'

export type { ResultAsyncCallable, AsyncArgumentInput } from './result-async-function'

export type Result<T, E> = ResultType<T, E>
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Result {
  export const ok = ResultUtils.ok
  export const err = ResultUtils.err
  export const fromThrowable = ResultUtils.fromThrowable
  export const combine = ResultUtils.combine
  export const combineWithAllErrors = ResultUtils.combineWithAllErrors
  export const fromJSON = ResultUtils.fromJSON
  export const deserialize = ResultUtils.deserialize
  export const lift = ResultUtils.lift
}

export const fromThrowable = ResultUtils.fromThrowable
export const ok = ResultUtils.ok
export const err = ResultUtils.err
export const combine = ResultUtils.combine
export const combineWithAllErrors = ResultUtils.combineWithAllErrors
export const fromJSON = ResultUtils.fromJSON
export const deserialize = ResultUtils.deserialize
export const lift = ResultUtils.lift
