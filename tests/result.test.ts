import * as td from 'testdouble'

import { err, Err, errAsync, fromThrowable, ok, Ok, okAsync, Result, ResultAsync } from '../src'

import { vi, describe, expect, it, beforeEach } from 'vitest'
import { ResultIter } from '../src/result'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Result.Ok', () => {
  it('Creates an Ok value', () => {
    const okVal = ok(12)

    expect(okVal.isOk()).toBe(true)
    expect(okVal.isErr()).toBe(false)
    expect(okVal.isOk()).toBe(true)
  })

  it('Creates an Ok value with null', () => {
    const okVal = ok(null)

    expect(okVal.isOk()).toBe(true)
    expect(okVal.isErr()).toBe(false)
    expect(okVal._unsafeUnwrap()).toBe(null)
  })

  it('Creates an Ok value with undefined', () => {
    const okVal = ok(undefined)

    expect(okVal.isOk()).toBe(true)
    expect(okVal.isErr()).toBe(false)
    expect(okVal._unsafeUnwrap()).toBeUndefined()
  })

  it('Is comparable', () => {
    expect(ok(42)).toEqual(ok(42))
    expect(ok(42)).not.toEqual(ok(43))
  })

  it('Maps over an Ok value', () => {
    const okVal = ok(12)
    const mapFn = vi.fn((number) => number.toString())

    const mapped = okVal.map(mapFn)

    expect(mapped.isOk()).toBe(true)
    expect(mapped._unsafeUnwrap()).toBe('12')
    expect(mapFn).toHaveBeenCalledTimes(1)
  })

  it('Skips `mapErr`', () => {
    const mapErrorFunc = vi.fn((_error) => 'mapped error value')

    const notMapped = ok(12).mapErr(mapErrorFunc)

    expect(notMapped.isOk()).toBe(true)
    expect(mapErrorFunc).not.toHaveBeenCalledTimes(1)
  })

  describe('andThen', () => {
    it('Maps to an Ok', () => {
      const okVal = ok(12)

      const flattened = okVal.andThen((_number) => {
        // ...
        // complex logic
        // ...
        return ok({ data: 'why not' })
      })

      expect(flattened.isOk()).toBe(true)
      expect(flattened._unsafeUnwrap()).toStrictEqual({ data: 'why not' })
    })

    it('Maps to an Err', () => {
      const okval = ok(12)

      const flattened = okval.andThen((_number) => {
        // ...
        // complex logic
        // ...
        return err('Whoopsies!')
      })

      expect(flattened.isOk()).toBe(false)

      const nextFn = vi.fn((_val) => ok('noop'))

      flattened.andThen(nextFn)

      expect(nextFn).not.toHaveBeenCalled()
    })
  })

  describe('andPush', () => {
    const square = vi.fn((n: number) => ok(n * n))
    const double = vi.fn((n: number) => ok(n * 2))
    it('accumulates Ok values into a growing tuple', () => {
      const result = ok(2)
        .andPush(square)
        .andPush(([, v]) => double(v))

      // square should have been called once with 2
      expect(square).toHaveBeenCalledTimes(1)
      expect(square).toHaveBeenCalledWith(2)

      // double should have been called once with 4
      expect(double).toHaveBeenCalledTimes(1)
      expect(double).toHaveBeenCalledWith(4)

      // final shape is [2, 4, 8]
      expect(result.value).toEqual([2, 4, 8])
    })

    it('short-circuits on the first Err and skips subsequent pushes', () => {
      const fail = vi.fn((n: number) => err<never, string>('boom'))

      const result = ok(2)
        .andPush(fail)
        .andPush(([, v]) => square(v)) // should never be called
        .andPush(([, v]) => double(v)) // neither should this

      expect(fail).toHaveBeenCalledTimes(1)
      expect(square).not.toHaveBeenCalled()
      expect(double).not.toHaveBeenCalled()
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBe('boom')
    })
    describe('andThen vs andPush equivalence', () => {
      it('andThen chain computes the same final result as extracting the last element of andPush', () => {
        const viaPush = ok(2)
          .andPush(square) // Ok<[2,4], E>
          .andPush(([, v]) => double(v)) // Ok<[2,4,8], E>

        const viaThen = ok(2)
          .andThen(square) // Ok<4, E>
          .andThen(double) // Ok<8, E>

        expect(viaThen).toEqual(ok(8))
        // _unsafeUnwrap() to pull out the last element of the tuple
        expect(viaPush._unsafeUnwrap().slice(-1)[0]).toBe(8)
      })
    })
  })

  describe('andPop', () => {
    const multiplyLast = vi.fn((n: number) => ok(n * 10))
    const failLast = vi.fn((n: number) => err<string, string>('pop error'))

    it('applies the function to the last element and returns its Ok', () => {
      const result = ok([1, 2, 3]).andPop(multiplyLast)

      expect(multiplyLast).toHaveBeenCalledTimes(1)
      expect(multiplyLast).toHaveBeenCalledWith(3)
      expect(result).toEqual(ok(30))
    })

    it('works correctly on single-element arrays', () => {
      const result = ok([5]).andPop(multiplyLast)

      expect(multiplyLast).toHaveBeenCalledTimes(1)
      expect(multiplyLast).toHaveBeenCalledWith(5)
      expect(result).toEqual(ok(50))
    })

    it('does not call the function when the original is Err', () => {
      const original = err<number[], string>('orig error')
      const result = original.andPop(multiplyLast)

      expect(multiplyLast).not.toHaveBeenCalled()
      expect(result.error).toEqual('orig error')
    })

    it('short-circuits and returns the Err from the callback', () => {
      const result = ok([1, 2, 3]).andPop(failLast)

      expect(failLast).toHaveBeenCalledTimes(1)
      expect(failLast).toHaveBeenCalledWith(3)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr()).toBe('pop error')
    })
  })

  describe('andThrough', () => {
    it('Calls the passed function but returns an original ok', () => {
      const okVal = ok(12)
      const passedFn = vi.fn((_number) => ok(undefined))

      const thrued = okVal.andThrough(passedFn)
      expect(thrued.isOk()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(thrued._unsafeUnwrap()).toStrictEqual(12)
    })

    it('Maps to an Err', () => {
      const okval = ok(12)

      const thrued = okval.andThen((_number) => {
        // ...
        // complex logic
        // ...
        return err('Whoopsies!')
      })

      expect(thrued.isOk()).toBe(false)
      expect(thrued._unsafeUnwrapErr()).toStrictEqual('Whoopsies!')

      const nextFn = vi.fn((_val) => ok('noop'))

      thrued.andThen(nextFn)

      expect(nextFn).not.toHaveBeenCalled()
    })
  })

  describe('andTee', () => {
    it('Calls the passed function but returns an original ok', () => {
      const okVal = ok(12)
      const passedFn = vi.fn((_number) => {})

      const teed = okVal.andTee(passedFn)

      expect(teed.isOk()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(teed._unsafeUnwrap()).toStrictEqual(12)
    })
    it('returns an original ok even when the passed function fails', () => {
      const okVal = ok(12)
      const passedFn = vi.fn((_number) => {
        throw new Error('OMG!')
      })

      const teed = okVal.andTee(passedFn)

      expect(teed.isOk()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(teed._unsafeUnwrap()).toStrictEqual(12)
    })
  })

  describe('orTee', () => {
    it('Calls the passed function but returns an original err', () => {
      const errVal = err(12)
      const passedFn = vi.fn((_number) => {})

      const teed = errVal.orTee(passedFn)

      expect(teed.isErr()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(teed._unsafeUnwrapErr()).toStrictEqual(12)
    })
    it('returns an original err even when the passed function fails', () => {
      const errVal = err(12)
      const passedFn = vi.fn((_number) => {
        throw new Error('OMG!')
      })

      const teed = errVal.orTee(passedFn)

      expect(teed.isErr()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(teed._unsafeUnwrapErr()).toStrictEqual(12)
    })
  })

  describe('asyncAndThrough', () => {
    it('Calls the passed function but returns an original ok as Async', async () => {
      const okVal = ok(12)
      const passedFn = vi.fn((_number) => okAsync(undefined))

      const teedAsync = okVal.asyncAndThrough(passedFn)
      expect(teedAsync).toBeInstanceOf(ResultAsync)
      const teed = await teedAsync
      expect(teed.isOk()).toBe(true)
      expect(passedFn).toHaveBeenCalledTimes(1)
      expect(teed._unsafeUnwrap()).toStrictEqual(12)
    })

    it('Maps to an Err', async () => {
      const okval = ok(12)

      const teedAsync = okval.asyncAndThen((_number) => {
        // ...
        // complex logic
        // ...
        return errAsync('Whoopsies!')
      })
      expect(teedAsync).toBeInstanceOf(ResultAsync)
      const teed = await teedAsync
      expect(teed.isOk()).toBe(false)
      expect(teed._unsafeUnwrapErr()).toStrictEqual('Whoopsies!')

      const nextFn = vi.fn((_val) => ok('noop'))

      teed.andThen(nextFn)

      expect(nextFn).not.toHaveBeenCalled()
    })
  })
  describe('orElse', () => {
    it('Skips orElse on an Ok value', () => {
      const okVal = ok(12)
      const errorCallback = vi.fn((_errVal) => err<number, string>('It is now a string'))

      const result = okVal.orElse(errorCallback)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(12)
      expect(errorCallback).not.toHaveBeenCalled()
    })
  })

  it('unwrapOr and return the Ok value', () => {
    const okVal = ok(12)
    expect(okVal.unwrapOr(1)).toEqual(12)
  })

  it('Maps to a ResultAsync', async () => {
    const okVal = ok(12)

    const flattened = okVal.asyncAndThen((_number) => {
      // ...
      // complex async logic
      // ...
      return okAsync({ data: 'why not' })
    })

    expect(flattened).toBeInstanceOf(ResultAsync)

    const newResult = await flattened

    expect(newResult.isOk()).toBe(true)
    expect(newResult._unsafeUnwrap()).toStrictEqual({ data: 'why not' })
  })

  it('Maps to a promise', async () => {
    const asyncMapper = vi.fn((_val) => {
      // ...
      // complex logic
      // ..

      // db queries
      // network calls
      // disk io
      // etc ...
      return Promise.resolve('Very Nice!')
    })

    const okVal = ok(12)

    const promise = okVal.asyncMap(asyncMapper)

    expect(promise).toBeInstanceOf(ResultAsync)

    const newResult = await promise

    expect(newResult.isOk()).toBe(true)
    expect(asyncMapper).toHaveBeenCalledTimes(1)
    expect(newResult._unsafeUnwrap()).toStrictEqual('Very Nice!')
  })

  it('Matches on an Ok', () => {
    const okMapper = vi.fn((_val) => 'weeeeee')
    const errMapper = vi.fn((_val) => 'wooooo')

    const matched = ok(12).match(okMapper, errMapper)

    expect(matched).toBe('weeeeee')
    expect(okMapper).toHaveBeenCalledTimes(1)
    expect(errMapper).not.toHaveBeenCalled()
  })

  it('Unwraps without issue', () => {
    const okVal = ok(12)

    expect(okVal._unsafeUnwrap()).toBe(12)
  })

  it('Can read the value after narrowing', () => {
    const fallible: () => Result<string, number> = () => ok('safe to read')
    const val = fallible()

    // After this check we val is narrowed to Ok<string, number>. Without this
    // line TypeScript will not allow accessing val.value.
    if (val.isErr()) return

    expect(val.value).toBe('safe to read')
  })
})

describe('Result.Err', () => {
  it('Creates an Err value', () => {
    const errVal = err('I have you now.')

    expect(errVal.isOk()).toBe(false)
    expect(errVal.isErr()).toBe(true)
    expect(errVal.isErr()).toBe(true)
  })

  it('Is comparable', () => {
    expect(err(42)).toEqual(err(42))
    expect(err(42)).not.toEqual(err(43))
  })

  it('Skips `map`', () => {
    const errVal = err('I am your father')

    const mapper = vi.fn((_value) => 'noooo')

    const hopefullyNotMapped = errVal.map(mapper)

    expect(hopefullyNotMapped.isErr()).toBe(true)
    expect(mapper).not.toHaveBeenCalled()
    expect(hopefullyNotMapped._unsafeUnwrapErr()).toEqual(errVal._unsafeUnwrapErr())
  })

  it('Maps over an Err', () => {
    const errVal = err('Round 1, Fight!')

    const mapper = vi.fn((error: string) => error.replace('1', '2'))

    const mapped = errVal.mapErr(mapper)

    expect(mapped.isErr()).toBe(true)
    expect(mapper).toHaveBeenCalledTimes(1)
    expect(mapped._unsafeUnwrapErr()).not.toEqual(errVal._unsafeUnwrapErr())
  })

  it('unwrapOr and return the default value', () => {
    const okVal = err<number, string>('Oh nooo')
    expect(okVal.unwrapOr(1)).toEqual(1)
  })

  it('Skips over andThen', () => {
    const errVal = err('Yolo')

    const mapper = vi.fn((_val) => ok<string, string>('yooyo'))

    const hopefullyNotFlattened = errVal.andThen(mapper)

    expect(hopefullyNotFlattened.isErr()).toBe(true)
    expect(mapper).not.toHaveBeenCalled()
    expect(errVal._unsafeUnwrapErr()).toEqual('Yolo')
  })

  it('Skips over andThrough', () => {
    const errVal = err('Yolo')

    const mapper = vi.fn((_val) => ok<void, string>(undefined))

    const hopefullyNotFlattened = errVal.andThrough(mapper)

    expect(hopefullyNotFlattened.isErr()).toBe(true)
    expect(mapper).not.toHaveBeenCalled()
    expect(errVal._unsafeUnwrapErr()).toEqual('Yolo')
  })

  it('Skips over andTee', () => {
    const errVal = err('Yolo')

    const mapper = vi.fn((_val) => {})

    const hopefullyNotFlattened = errVal.andTee(mapper)

    expect(hopefullyNotFlattened.isErr()).toBe(true)
    expect(mapper).not.toHaveBeenCalled()
    expect(errVal._unsafeUnwrapErr()).toEqual('Yolo')
  })

  it('Skips over asyncAndThrough but returns ResultAsync instead', async () => {
    const errVal = err('Yolo')

    const mapper = vi.fn((_val) => okAsync<string, unknown>('Async'))

    const hopefullyNotFlattened = errVal.asyncAndThrough(mapper)
    expect(hopefullyNotFlattened).toBeInstanceOf(ResultAsync)

    const result = await hopefullyNotFlattened
    expect(result.isErr()).toBe(true)
    expect(mapper).not.toHaveBeenCalled()
    expect(result._unsafeUnwrapErr()).toEqual('Yolo')
  })

  it('Transforms error into ResultAsync within `asyncAndThen`', async () => {
    const errVal = err('Yolo')

    const asyncMapper = vi.fn((_val) => okAsync<string, string>('yooyo'))

    const hopefullyNotFlattened = errVal.asyncAndThen(asyncMapper)

    expect(hopefullyNotFlattened).toBeInstanceOf(ResultAsync)
    expect(asyncMapper).not.toHaveBeenCalled()

    const syncResult = await hopefullyNotFlattened
    expect(syncResult._unsafeUnwrapErr()).toEqual('Yolo')
  })

  it('Does not invoke callback within `asyncMap`', async () => {
    const asyncMapper = vi.fn((_val) => {
      // ...
      // complex logic
      // ..

      // db queries
      // network calls
      // disk io
      // etc ...
      return Promise.resolve('Very Nice!')
    })

    const errVal = err('nooooooo')

    const promise = errVal.asyncMap(asyncMapper)

    expect(promise).toBeInstanceOf(ResultAsync)

    const sameResult = await promise

    expect(sameResult.isErr()).toBe(true)
    expect(asyncMapper).not.toHaveBeenCalled()
    expect(sameResult._unsafeUnwrapErr()).toEqual(errVal._unsafeUnwrapErr())
  })

  it('Matches on an Err', () => {
    const okMapper = vi.fn((_val) => 'weeeeee')
    const errMapper = vi.fn((_val) => 'wooooo')

    const matched = err(12).match(okMapper, errMapper)

    expect(matched).toBe('wooooo')
    expect(okMapper).not.toHaveBeenCalled()
    expect(errMapper).toHaveBeenCalledTimes(1)
  })

  it('Throws when you unwrap an Err', () => {
    const errVal = err('woopsies')

    expect(() => {
      errVal._unsafeUnwrap()
    }).toThrowError()
  })

  it('Unwraps without issue', () => {
    const okVal = err(12)

    expect(okVal._unsafeUnwrapErr()).toBe(12)
  })

  describe('orElse', () => {
    it('invokes the orElse callback on an Err value', () => {
      const okVal = err('BOOOM!')
      const errorCallback = vi.fn((_errVal) => err(true))

      expect(okVal.orElse(errorCallback)).toEqual(err(true))
      expect(errorCallback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('Result.fromThrowable', () => {
  it('Creates a function that returns an OK result when the inner function does not throw', () => {
    const hello = (): string => 'hello'
    const safeHello = Result.fromThrowable(hello)

    const result = hello()
    const safeResult = safeHello()

    expect(safeResult.isOk()).toBe(true)
    expect(result).toEqual(safeResult._unsafeUnwrap())
  })

  // Added for issue #300 -- the test here is not so much that expectations are met as that the test compiles.
  it('Accepts an inner function which takes arguments', () => {
    const hello = (fname: string): string => `hello, ${fname}`
    const safeHello = Result.fromThrowable(hello)

    const result = hello('Dikembe')
    const safeResult = safeHello('Dikembe')

    expect(safeResult.isOk()).toBe(true)
    expect(result).toEqual(safeResult._unsafeUnwrap())
  })

  it('Creates a function that returns an err when the inner function throws', () => {
    const thrower = (): string => {
      throw new Error()
    }

    // type: () => Result<string, unknown>
    // received types from thrower fn, no errorFn is provides therefore Err type is unknown
    const safeThrower = Result.fromThrowable(thrower)
    const result = safeThrower()

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(Error)
  })

  it('Accepts an error handler as a second argument', () => {
    const thrower = (): string => {
      throw new Error()
    }
    type MessageObject = { message: string }
    const toMessageObject = (): MessageObject => ({ message: 'error' })

    // type: () => Result<string, MessageObject>
    // received types from thrower fn and errorFn return type
    const safeThrower = Result.fromThrowable(thrower, toMessageObject)
    const result = safeThrower()

    expect(result.isOk()).toBe(false)
    expect(result.isErr()).toBe(true)
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toEqual({ message: 'error' })
  })

  it('has a top level export', () => {
    expect(fromThrowable).toBe(Result.fromThrowable)
  })
})

describe('ResultIter helper methods', () => {
  it('map → toArray', () => {
    const arr = ok(5)
      .iter()

      .map((v: number) => v * 2)
      .toArray()
    expect(arr).toEqual([10])
  })

  it('filter keeps / removes', () => {
    const kept = ok(3)
      .iter()
      .filter((v) => v > 0)
      .toArray()
    const pruned = ok(3)
      .iter()
      .filter((v) => v < 0)
      .toArray()
    expect(kept).toEqual([3])
    expect(pruned).toEqual([])
  })

  /*   it('flatMap flattens first yielded iterable', () => {
    const iter = ok(2)
      .iter()
      .flatMap((v: number) => [v, v * 2]) // [2,4]
      .toArray()
    expect(iter).toEqual([2, 4])
  }) */

  it('drop(n) empties when n ≥ 1', () => {
    const empty = ok('x').iter().drop(1).toArray()
    expect(empty).toEqual([])
  })

  it('take(n) controls cardinality', () => {
    const full = ok('x').iter().take(1).toArray()
    const empty = ok('x').iter().take(0).toArray()
    expect(full).toEqual(['x'])
    expect(empty).toEqual([])
  })

  it('every / some / find behave correctly', () => {
    const it = ok(7).iter()
    expect(it.every((v) => v > 0)).toBe(true)
    expect(it.some((v) => v === 7)).toBe(true)
    expect(it.find((v) => v === 7)).toBe(7)

    const errIter = err<number, string>('boom').iter()
    expect(errIter.every(() => false)).toBe(true) // vacuously true
    expect(errIter.some(() => true)).toBe(false)
    expect(errIter.find(() => true)).toBe(undefined)
  })

  it('reduce accumulates or returns seed', () => {
    const sum = ok(4)
      .iter()
      .reduce((acc, v) => acc + v, 1)
    const seed = err<number, string>('x')
      .iter()
      .reduce((acc, v) => acc + v, 1)
    expect(sum).toBe(5)
    expect(seed).toBe(1)
  })

  it('forEach runs side-effect exactly once on Ok', () => {
    const spy = vi.fn()
    ok('hi').iter().forEach(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    err<string, string>('nope').iter().forEach(spy)
    expect(spy).toHaveBeenCalledTimes(1) // unchanged
  })

  it('collect() returns Result<Array>', () => {
    const okArr = ok(9).iter().collect()
    const errArr = err<number, string>('err').iter().collect()
    expect(okArr.isOk()).toBe(true)
    expect(okArr.value).toEqual([9])
    expect(errArr.isErr()).toBe(true)
    expect(errArr.error).toBe('err')
  })

  describe('Complex chaining scenarios', () => {
    it('handles complex map/filter/reduce chains', () => {
      const result = ok([1, 2, 3, 4, 5])
        .iter()
        .map((nums) => nums)
        .filter((n) => n % 2 === 0)
        .map((n) => n * 2)
        .reduce((sum, n) => sum + n, 0)

      expect(result).toBe(12) // (2*2 + 4*2)
    })

    it('collects complex transformations back to Result', () => {
      const result = ok([1, 2, 3, 4, 5])
        .iter()
        .map((nums) => nums)
        .filter((n) => n > 2)
        .map((n) => n.toString())
        .collect()

      expect(result.isOk()).toBe(true)
      expect(result.value).toEqual(['3', '4', '5'])
    })

    it('preserves error state through complex chains', () => {
      const result = err<number[], string>('error')
        .iter()
        .map((nums) => nums)
        .filter((n) => n > 0)
        .map((n) => n * 2)
        .collect()

      expect(result.isErr()).toBe(true)
      expect(result.error).toBe('error')
    })

    it('handles nested Result types in collect', () => {
      const result = ok([ok(1), ok(2), err<number, string>('nested error')])
        .iter()
        .map((results) => results)
        .collect()

      expect(result.isErr()).toBe(true)
      expect(result.error).toBe('nested error')
    })
  })
})

describe('Iterator static helpers', () => {
  it('Iterator.from creates an iterator from iterable', () => {
    const base = [1, 2, 3]
    const iter = ResultIter.from(base)
    expect(Array.from(iter)).toEqual([1, 2, 3])
  })

  it('Iterator.concat concatenates multiple iterables', () => {
    const out = Array.from(ResultIter.concat([1], new Set([2]), '3'))
    expect(out).toEqual([1, 2, '3'])
  })

  it('Iterator.zip zips two iterables', () => {
    const zipped = Array.from(ResultIter.zip(['a', 'b'], [1, 2]))
    expect(zipped).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('Iterator.zipKeyed behaves same as zip (for our impl)', () => {
    const zipped = Array.from(ResultIter.zipKeyed(['x'], [42]))
    expect(zipped).toEqual([['x', 42]])
  })
})

/* ------------------------------------------------------------------ */
/*  library utility: collectResults                                   */
/* ------------------------------------------------------------------ */
describe('collectResults(iterator)', () => {
  it('aggregates Ok values until first Err', () => {
    const seq = [ok(1), ok(2), err<number, string>('fail'), ok(99)]
    const res = ResultIter.collectResults(seq)
    expect(res.isErr()).toBe(true)
    expect(res.error).toBe('fail')
  })

  it('returns Ok with all payloads when no error occurs', () => {
    const seq = [ok('a'), ok('b')]
    const res = ResultIter.collectResults(seq)
    expect(res.isOk()).toBe(true)
    expect(res.value).toEqual(['a', 'b'])
  })

  it('short-circuits an infinite iterator that errors later', () => {
    function* gen() {
      yield ok(1)
      yield ok(2)
      yield err<number, string>('stop')
      yield ok(3) // never reached
    }
    const res = ResultIter.collectResults(gen())
    expect(res.isErr()).toBe(true)
    expect(res.error).toBe('stop')
  })

  it('handles complex nested Result collections', () => {
    const seq = [
      ok([ok(1), ok(2)]),
      ok([ok(3), err<number, string>('nested error')]),
      ok([ok(4), ok(5)]),
    ]
    const res = ResultIter.collectResults(seq)
    expect(res.isErr()).toBe(true)
    expect(res.error).toBe('nested error')
  })
})

describe('Utils', () => {
  describe('`Result.combine`', () => {
    describe('Synchronous `combine`', () => {
      it('Combines a list of results into an Ok value', () => {
        const resultList = [ok(123), ok(456), ok(789)]

        const result = Result.combine(resultList)

        expect(result.isOk()).toBe(true)
        expect(result._unsafeUnwrap()).toEqual([123, 456, 789])
      })

      it('Combines a list of results into an Err value', () => {
        const resultList: Result<number, string>[] = [
          ok(123),
          err('boooom!'),
          ok(456),
          err('ahhhhh!'),
        ]

        const result = Result.combine(resultList)

        expect(result.isErr()).toBe(true)
        expect(result._unsafeUnwrapErr()).toBe('boooom!')
      })

      it('Combines heterogeneous lists', () => {
        type HeterogenousList = [
          Result<string, string>,
          Result<number, number>,
          Result<boolean, boolean>,
        ]

        const heterogenousList: HeterogenousList = [ok('Yooooo'), ok(123), ok(true)]

        type ExpecteResult = Result<[string, number, boolean], string | number | boolean>

        const result: ExpecteResult = Result.combine(heterogenousList)

        expect(result._unsafeUnwrap()).toEqual(['Yooooo', 123, true])
      })

      it('Does not destructure / concatenate arrays', () => {
        type HomogenousList = [Result<string[], boolean>, Result<number[], string>]

        const homogenousList: HomogenousList = [ok(['hello', 'world']), ok([1, 2, 3])]

        type ExpectedResult = Result<[string[], number[]], boolean | string>

        const result: ExpectedResult = Result.combine(homogenousList)

        expect(result._unsafeUnwrap()).toEqual([
          ['hello', 'world'],
          [1, 2, 3],
        ])
      })
    })

    describe('`ResultAsync.combine`', () => {
      it('Combines a list of async results into an Ok value', async () => {
        const asyncResultList = [okAsync(123), okAsync(456), okAsync(789)]

        const resultAsync: ResultAsync<number[], never[]> = ResultAsync.combine(asyncResultList)

        expect(resultAsync).toBeInstanceOf(ResultAsync)

        const result = await ResultAsync.combine(asyncResultList)

        expect(result.isOk()).toBe(true)
        expect(result._unsafeUnwrap()).toEqual([123, 456, 789])
      })

      it('Combines a list of results into an Err value', async () => {
        const resultList: ResultAsync<number, string>[] = [
          okAsync(123),
          errAsync('boooom!'),
          okAsync(456),
          errAsync('ahhhhh!'),
        ]

        const result = await ResultAsync.combine(resultList)

        expect(result.isErr()).toBe(true)
        expect(result._unsafeUnwrapErr()).toBe('boooom!')
      })

      it('Combines heterogeneous lists', async () => {
        type HeterogenousList = [
          ResultAsync<string, string>,
          ResultAsync<number, number>,
          ResultAsync<boolean, boolean>,
          ResultAsync<number[], string>,
        ]

        const heterogenousList: HeterogenousList = [
          okAsync('Yooooo'),
          okAsync(123),
          okAsync(true),
          okAsync([1, 2, 3]),
        ]

        type ExpecteResult = Result<[string, number, boolean, number[]], string | number | boolean>

        const result: ExpecteResult = await ResultAsync.combine(heterogenousList)

        expect(result._unsafeUnwrap()).toEqual(['Yooooo', 123, true, [1, 2, 3]])
      })
    })
  })
  describe('`Result.combineWithAllErrors`', () => {
    describe('Synchronous `combineWithAllErrors`', () => {
      it('Combines a list of results into an Ok value', () => {
        const resultList = [ok(123), ok(456), ok(789)]

        const result = Result.combineWithAllErrors(resultList)

        expect(result.isOk()).toBe(true)
        expect(result._unsafeUnwrap()).toEqual([123, 456, 789])
      })

      it('Combines a list of results into an Err value', () => {
        const resultList: Result<number, string>[] = [
          ok(123),
          err('boooom!'),
          ok(456),
          err('ahhhhh!'),
        ]

        const result = Result.combineWithAllErrors(resultList)

        expect(result.isErr()).toBe(true)
        expect(result._unsafeUnwrapErr()).toEqual(['boooom!', 'ahhhhh!'])
      })

      it('Combines heterogeneous lists', () => {
        type HeterogenousList = [
          Result<string, string>,
          Result<number, number>,
          Result<boolean, boolean>,
        ]

        const heterogenousList: HeterogenousList = [ok('Yooooo'), ok(123), ok(true)]

        type ExpecteResult = Result<[string, number, boolean], (string | number | boolean)[]>

        const result: ExpecteResult = Result.combineWithAllErrors(heterogenousList)

        expect(result._unsafeUnwrap()).toEqual(['Yooooo', 123, true])
      })

      it('Does not destructure / concatenate arrays', () => {
        type HomogenousList = [Result<string[], boolean>, Result<number[], string>]

        const homogenousList: HomogenousList = [ok(['hello', 'world']), ok([1, 2, 3])]

        type ExpectedResult = Result<[string[], number[]], (boolean | string)[]>

        const result: ExpectedResult = Result.combineWithAllErrors(homogenousList)

        expect(result._unsafeUnwrap()).toEqual([
          ['hello', 'world'],
          [1, 2, 3],
        ])
      })
    })
    describe('`ResultAsync.combineWithAllErrors`', () => {
      it('Combines a list of async results into an Ok value', async () => {
        const asyncResultList = [okAsync(123), okAsync(456), okAsync(789)]

        const result = await ResultAsync.combineWithAllErrors(asyncResultList)

        expect(result.isOk()).toBe(true)
        expect(result._unsafeUnwrap()).toEqual([123, 456, 789])
      })

      it('Combines a list of results into an Err value', async () => {
        const asyncResultList: ResultAsync<number, string>[] = [
          okAsync(123),
          errAsync('boooom!'),
          okAsync(456),
          errAsync('ahhhhh!'),
        ]

        const result = await ResultAsync.combineWithAllErrors(asyncResultList)

        expect(result.isErr()).toBe(true)
        expect(result._unsafeUnwrapErr()).toEqual(['boooom!', 'ahhhhh!'])
      })

      it('Combines heterogeneous lists', async () => {
        type HeterogenousList = [
          ResultAsync<string, string>,
          ResultAsync<number, number>,
          ResultAsync<boolean, boolean>,
        ]

        const heterogenousList: HeterogenousList = [okAsync('Yooooo'), okAsync(123), okAsync(true)]

        type ExpecteResult = Result<[string, number, boolean], (string | number | boolean)[]>

        const result: ExpecteResult = await ResultAsync.combineWithAllErrors(heterogenousList)

        expect(result._unsafeUnwrap()).toEqual(['Yooooo', 123, true])
      })
    })

    describe('testdouble `ResultAsync.combine`', () => {
      interface ITestInterface {
        getName(): string
        setName(name: string): void
        getAsyncResult(): ResultAsync<ITestInterface, Error>
      }

      it('Combines `testdouble` proxies from mocks generated via interfaces', async () => {
        const mock = td.object<ITestInterface>()

        const result = await ResultAsync.combine([okAsync(mock)] as const)

        expect(result).toBeDefined()
        expect(result.isErr()).toBeFalsy()
        const unwrappedResult = result._unsafeUnwrap()

        expect(unwrappedResult.length).toBe(1)
        expect(unwrappedResult[0]).toBe(mock)
      })
    })
  })
})
