import { describe, it, expect, vi } from 'vitest'
import { ResultAsyncCallable, resultFnAsync } from '../src/result-async-function'
import { err, ok, Result, ResultAsync, okAsync, errAsync } from '../src'

// Type assertions for compile-time type checking
type ExpectedCallableNoArgs<T, E = never> = ResultAsyncCallable<[], T, E>
type ExpectedCallableOneArg<A, T, E = never> = ResultAsyncCallable<[A], T, E>
type ExpectedCallableTwoArgs<A, B, T, E = never> = ResultAsyncCallable<[A, B], T, E>
type ExpectedCallableThreeArgs<A, B, C, T, E = never> = ResultAsyncCallable<[A, B, C], T, E>
type ExpectedResult<T, E = never> = ResultAsync<T, E>

describe('ResultAsync Function – basics', () => {
  describe('Argument Pushing', () => {
    it('should correctly push arguments onto function', async () => {
      const add3: ExpectedCallableNoArgs<number> = resultFnAsync(
        (a: number, b: number, c: string) => a + b + parseInt(c),
      )
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      const result = await add3()
      expect(result.value).toEqual(10)
    })

    it('should correctly push arguments onto result returning function', async () => {
      const add3: ExpectedCallableNoArgs<number> = resultFnAsync(
        (a: number, b: number, c: string) => ok(a + b + parseInt(c)),
      )
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      const result = await add3()
      expect(result).toEqual(ok(10))
    })

    it('should correctly error when passed in function returns an error', async () => {
      const add3: ExpectedCallableNoArgs<
        never,
        string
      > = resultFnAsync((a: number, b: number, c: string) => err('Unexpected error'))
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      const result = await add3()
      expect(result).toEqual(err('Unexpected error'))
    })
  })

  describe('Function Callability', () => {
    it('should be callable with arguments', async () => {
      const add: ExpectedCallableOneArg<number, number> = resultFnAsync(
        (a: number, b: number, c: number) => a + b + c,
      )
        .applyArg(1)
        .applyArg(ok(2))

      const result = await add(3)
      expect(result).toEqual(ok(6))
    })

    it('push and argument equality', async () => {
      const add: ExpectedCallableThreeArgs<number, number, number, number> = resultFnAsync(
        (a: number, b: number, c: number) => a + b + c,
      )
      const result = await add
        .applyArg(1)
        .applyArg(ok(2))
        .applyArg(() => ok(3))()
      const result2 = await add(1, 2, 3)

      expect(result).toEqual(result2)
    })
  })

  describe('Result Method Parity', () => {
    it('should allow for normal result operations after calling', async () => {
      const result: ExpectedCallableNoArgs<number> = resultFnAsync(
        (a: number, b: number, c: number) => a + b + c,
      )
        .applyArg(1 as const)
        .applyArg(ok(2 as const))
        .applyArg(() => ok(3))

      const res = await result()
      expect(res.value).toEqual(6)
    })
  })

  describe('Result Operations', () => {
    it('should allow for normal result operations after calling', async () => {
      const result = await resultFnAsync((a: number, b: number, c: number) => a + b + c)
        .applyArg(1)
        .applyArg(ok(2))
        .applyArg(() => ok(3))()
      const double = result.map((v) => 2 * v)
      const doubleResult = await double
      expect(doubleResult.value).toEqual(2 * (result.value as number))
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn.applyArg(x)(); map', async () => {
      const spy = vi.fn((a: number, b: number) => a + b)
      const fn: ExpectedCallableTwoArgs<number, number, number> = resultFnAsync(spy)
      const arg1 = 2
      const arg2 = 3

      // Case 1: .applyArg then .map, then call
      const mapped1: ExpectedCallableNoArgs<number> = fn
        .applyArg(arg1)
        .applyArg(arg2)
        .map((v) => v * 10)
      const result1 = await mapped1()

      // Case 2: .applyArg then call, then .map
      const mapped2 = await fn.applyArg(arg1).applyArg(arg2)()
      const result2 = await mapped2.map((v) => v * 10)

      expect(result1).toEqual(result2)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('should evaluate all arguments before mapping: .applyArg(x).map(fn) triggers all arg evaluation before map', async () => {
      const argSpy1 = vi.fn(() => ok(5))
      const argSpy2 = vi.fn(() => ok(7))
      const fn: ExpectedCallableTwoArgs<number, number, number> = resultFnAsync(
        (a: number, b: number) => a + b,
      )
      const mapped: ExpectedCallableNoArgs<number> = fn
        .applyArg(argSpy1)
        .applyArg(argSpy2)
        .map((v) => v * 2)
      await mapped()
      expect(argSpy1).toHaveBeenCalledTimes(1)
      expect(argSpy2).toHaveBeenCalledTimes(1)
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn(x).map(fn)', async () => {
      const spy = vi.fn((a: number, b: number) => a * b)
      const fn: ExpectedCallableTwoArgs<number, number, number> = resultFnAsync(spy)
      const arg1 = 4
      const arg2 = 6

      // .applyArg then .map, then call
      const mapped1: ExpectedCallableNoArgs<number> = fn
        .applyArg(arg1)
        .applyArg(arg2)
        .map((v) => v + 1)

      const result1 = await mapped1()

      // .applyArg then call, then .map
      const mapped2 = await fn.applyArg(arg1).applyArg(arg2)()
      const result2 = await mapped2.map((v) => v + 1)

      expect(result1).toEqual(result2)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn(x).map(fn) with lazy arg', async () => {
      const argSpy = vi.fn(() => ok(10))
      const fn: ExpectedCallableOneArg<number, number> = resultFnAsync((a: number) => a * 2)

      // .applyArg with lazy, then .map, then call
      const mapped1: ExpectedCallableNoArgs<number> = fn.applyArg(argSpy).map((v) => v + 5)
      const result1 = await mapped1()

      // .applyArg with lazy, then call, then .map
      const mapped2 = await fn.applyArg(argSpy)()
      const result2 = await mapped2.map((v) => v + 5)

      expect(result1).toEqual(result2)
      expect(argSpy).toHaveBeenCalledTimes(2)
    })

    it('should be equivalent: all orderings of applyArg and map should produce same result', async () => {
      const spy = vi.fn((a: number, b: number) => a - b)
      const fn: ExpectedCallableTwoArgs<number, number, number> = resultFnAsync(spy)
      const arg1 = 10
      const arg2 = 3
      const mapFn = (v: number) => v * 100

      // Test all different orderings should produce same result:

      // 1. arg → map → arg
      const ordering1: ExpectedCallableNoArgs<number> = fn.applyArg(arg1).map(mapFn).applyArg(arg2)

      // 2. arg → arg → map
      const ordering2: ExpectedCallableNoArgs<number> = fn.applyArg(arg1).applyArg(arg2).map(mapFn)

      // 3. map → arg → arg
      const ordering3: ExpectedCallableNoArgs<number> = fn.map(mapFn).applyArg(arg1).applyArg(arg2)

      // 4. map → arg → (arg)
      const ordering4: ExpectedCallableOneArg<number, number> = fn.map(mapFn).applyArg(arg1)

      // Execute all orderings
      const result1 = await ordering1()
      const result2 = await ordering2()
      const result3 = await ordering3()
      const result4 = await ordering4(arg2)

      // All should produce the same result: (10 - 3) * 100 = 700
      const expectedValue = (10 - 3) * 100
      expect(result1.value).toEqual(expectedValue)
      expect(result2.value).toEqual(expectedValue)
      expect(result3.value).toEqual(expectedValue)
      expect(result4.value).toEqual(expectedValue)

      expect(spy).toHaveBeenCalledTimes(4)
    })

    it('should evaluate all arguments before mapping in sandwiched case', async () => {
      const argSpy1 = vi.fn(() => ok(8))
      const argSpy2 = vi.fn(() => ok(2))
      const fn: ExpectedCallableTwoArgs<number, number, number> = resultFnAsync(
        (a: number, b: number) => a / b,
      )
      // Sandwiched: applyArg, map, applyArg, then call
      const sandwiched: ExpectedCallableNoArgs<number> = fn
        .applyArg(argSpy1)
        .map((v) => v + 1)
        .applyArg(argSpy2)
      await sandwiched()
      expect(argSpy1).toHaveBeenCalledTimes(1)
      expect(argSpy2).toHaveBeenCalledTimes(1)
    })
  })

  describe('Prefilled Results', () => {
    it('Should allow prefilled Future results as parameters to functions', async () => {
      const prefilled: ExpectedCallableOneArg<number, number> = resultFnAsync(
        (a: number, b: number, c: number) => a + b + c,
      )
        .applyArg(1)
        .applyArg(ok(2))

      type Fn = ResultAsyncCallable<[number], number>

      const fillResult = (fn: Fn): ExpectedCallableNoArgs<number> => {
        return fn.applyArg(3)
      }
      const filledFunction: ExpectedCallableNoArgs<number> = fillResult(prefilled)

      const result = await filledFunction()
      expect(result).toEqual(ok(6))
    })
  })

  describe('Error Handling', () => {
    it('should safely divide numbers', async () => {
      const divide: ExpectedCallableTwoArgs<number, number, number, Error> = resultFnAsync(
        (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        },
      )

      const safeDivide: ExpectedCallableNoArgs<number, Error> = divide.applyArg(10).applyArg(ok(2))

      const result = await safeDivide()
      expect(result).toEqual(ok(5))
    })
  })

  describe('ResultAsync and ResultAsyncCallable Equivalence', () => {
    it('should be equivalent for andThen', async () => {
      const result: ExpectedCallableNoArgs<number> = resultFnAsync((a: number) => a * 2).applyArg(5)

      const normalResult = await result().andThen((v) => okAsync(v * 2))
      const callableResult = await result.andThen((v) => okAsync(v * 2))()

      expect(await normalResult).toEqual(callableResult)
    })

    it('should be equivalent for map', async () => {
      const result: ExpectedCallableNoArgs<number> = resultFnAsync((a: number) => a * 2).applyArg(5)

      const normalResult = (await result()).map((v) => v * 2)
      const callableResult = await result.map((v) => v * 2)()

      expect(await normalResult).toEqual(callableResult)
    })

    it('should be equivalent for mapErr', async () => {
      const result: ExpectedCallableNoArgs<number, number> = resultFnAsync((a: number) => a * 2)
        .andThen((v) => errAsync(v * 2))
        .applyArg(5)

      const normalResult = (await result()).mapErr((e) => e * 2)
      const callableResult = await result.mapErr((e) => e * 2)()

      expect(await normalResult).toEqual(callableResult)
    })
  })

  describe('Async-specific features', () => {
    it('should handle promise arguments', async () => {
      const asyncValue = Promise.resolve(42)
      const fn = resultFnAsync((a: number, b: number) => a + b)
        .applyArg(asyncValue)
        .applyArg(8)

      const result = await fn()
      expect(result.value).toEqual(50)
    })

    it('should handle ResultAsync arguments', async () => {
      const asyncResult = okAsync(15)
      const fn = resultFnAsync((a: number, b: number) => a * b)
        .applyArg(asyncResult)
        .applyArg(3)

      const result = await fn()
      expect(result.value).toEqual(45)
    })

    it('should handle async function arguments', async () => {
      const asyncFn = () => Promise.resolve(100)
      const fn = resultFnAsync((a: number, b: number) => a - b)
        .applyArg(asyncFn)
        .applyArg(25)

      const result = await fn()
      expect(result.value).toEqual(75)
    })

    it('should process arguments in parallel for performance', async () => {
      const startTime = Date.now()
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

      const slowArg1 = async () => {
        await delay(50)
        return 10
      }
      const slowArg2 = async () => {
        await delay(50)
        return 20
      }
      const slowArg3 = async () => {
        await delay(50)
        return 30
      }

      const fn = resultFnAsync((a: number, b: number, c: number) => a + b + c)
        .applyArg(slowArg1)
        .applyArg(slowArg2)
        .applyArg(slowArg3)

      const result = await fn()
      const elapsed = Date.now() - startTime

      expect(result.value).toEqual(60)
      // Should be closer to 50ms (parallel) than 150ms (sequential)
      expect(elapsed).toBeLessThan(100)
    })
  })
})
