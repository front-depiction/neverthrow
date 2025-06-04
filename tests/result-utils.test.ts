import { describe, it, expect, vi } from 'vitest'
import {
  lift,
  LiftedFunction,
  combine,
  combineAsync,
  combineWithAllErrors,
  combineAsyncWithAllErrors,
} from '../src/result-utils'
import { err, ok } from '../src/result-utils'
import { Result, ResultAsync, okAsync, errAsync } from '../src'

// Type assertions for compile-time type checking
type ExpectedResult<T, E = unknown> = Result<T, E>
type ExpectedLiftedUnary<A, R> = LiftedFunction<(a: A) => R>
type ExpectedLiftedBinary<A, B, R> = LiftedFunction<(a: A, b: B) => R>
type ExpectedLiftedTernary<A, B, C, R> = LiftedFunction<(a: A, b: B, c: C) => R>
type ExpectedLiftedVariadic<R> = LiftedFunction<(...args: string[]) => R>

describe('combine functions', () => {
  describe('combine (sync, single error)', () => {
    it('should combine multiple Ok results into Ok array', () => {
      const result = combine([ok(1), ok(2), ok(3)])
      expect(result).toEqual(ok([1, 2, 3]))
    })

    it('should short-circuit on first error', () => {
      const result = combine([ok(1), err('error1'), err('error2')])
      expect(result).toEqual(err('error1'))
    })

    it('should handle empty array', () => {
      const result = combine([])
      expect(result).toEqual(ok([]))
    })

    it('should handle mixed types in values', () => {
      const result = combine([ok(1), ok('hello'), ok(true)])
      expect(result).toEqual(ok([1, 'hello', true]))
    })

    it('should preserve error types', () => {
      const result = combine([ok(1), err(404), ok(3)])
      expect(result).toEqual(err(404))
    })

    it('should handle Results with different error types', () => {
      const stringError: Result<number, string> = err('string error')
      const numberError: Result<number, number> = err(500)

      const result1 = combine([ok(1), stringError])
      expect(result1).toEqual(err('string error'))

      const result2 = combine([ok(1), numberError])
      expect(result2).toEqual(err(500))
    })
  })

  describe('combineWithAllErrors (sync, multiple errors)', () => {
    it('should combine multiple Ok results into Ok array', () => {
      const result = combineWithAllErrors([ok(1), ok(2), ok(3)])
      expect(result).toEqual(ok([1, 2, 3]))
    })

    it('should collect all errors into array', () => {
      const result = combineWithAllErrors([ok(1), err('error1'), err('error2'), ok(4)])
      expect(result).toEqual(err(['error1', 'error2']))
    })

    it('should handle all errors case', () => {
      const result = combineWithAllErrors([err('error1'), err('error2'), err('error3')])
      expect(result).toEqual(err(['error1', 'error2', 'error3']))
    })

    it('should handle empty array', () => {
      const result = combineWithAllErrors([])
      expect(result).toEqual(ok([]))
    })

    it('should handle single error', () => {
      const result = combineWithAllErrors([ok(1), err('single error'), ok(3)])
      expect(result).toEqual(err(['single error']))
    })

    it('should preserve order of errors', () => {
      const result = combineWithAllErrors([err('first'), ok(1), err('second'), ok(2), err('third')])
      expect(result).toEqual(err(['first', 'second', 'third']))
    })

    it('should handle mixed error types', () => {
      const result = combineWithAllErrors([
        ok(1),
        err('string error'),
        err(404),
        err({ code: 500, message: 'server error' }),
      ])
      expect(result).toEqual(err(['string error', 404, { code: 500, message: 'server error' }]))
    })
  })

  describe('combineAsync (async, single error)', () => {
    it('should combine multiple Ok ResultAsync into Ok array', async () => {
      const result = combineAsync([okAsync(1), okAsync(2), okAsync(3)])
      const value = await result
      expect(value).toEqual(ok([1, 2, 3]))
    })

    it('should short-circuit on first error', async () => {
      const result = combineAsync([okAsync(1), errAsync('error1'), errAsync('error2')])
      const value = await result
      expect(value).toEqual(err('error1'))
    })

    it('should handle empty array', async () => {
      const result = combineAsync([])
      const value = await result
      expect(value).toEqual(ok([]))
    })

    it('should handle mixed types in values', async () => {
      const result = combineAsync([okAsync(1), okAsync('hello'), okAsync(true)])
      const value = await result
      expect(value).toEqual(ok([1, 'hello', true]))
    })

    it('should process async operations in parallel', async () => {
      const start = Date.now()
      const delay = (ms: number, value: number) =>
        new Promise((resolve) => setTimeout(() => resolve(value), ms))

      const result = combineAsync([
        ResultAsync.fromSafePromise(delay(50, 1)),
        ResultAsync.fromSafePromise(delay(50, 2)),
        ResultAsync.fromSafePromise(delay(50, 3)),
      ])

      const value = await result
      const elapsed = Date.now() - start

      expect(value).toEqual(ok([1, 2, 3]))
      // Should take ~50ms (parallel) not ~150ms (sequential)
      expect(elapsed).toBeLessThan(100)
    })

    it('should handle async errors correctly', async () => {
      const asyncError = ResultAsync.fromSafePromise(Promise.reject(new Error('async error')))

      const result = combineAsync([okAsync(1), asyncError, okAsync(3)])
      const value = await result

      expect(value.isErr()).toBe(true)
    })
  })

  describe('combineAsyncWithAllErrors (async, multiple errors)', () => {
    it('should combine multiple Ok ResultAsync into Ok array', async () => {
      const result = combineAsyncWithAllErrors([okAsync(1), okAsync(2), okAsync(3)])
      const value = await result
      expect(value).toEqual(ok([1, 2, 3]))
    })

    it('should collect all errors into array', async () => {
      const result = combineAsyncWithAllErrors([
        okAsync(1),
        errAsync('error1'),
        errAsync('error2'),
        okAsync(4),
      ])
      const value = await result
      expect(value).toEqual(err(['error1', 'error2']))
    })

    it('should handle all errors case', async () => {
      const result = combineAsyncWithAllErrors([
        errAsync('error1'),
        errAsync('error2'),
        errAsync('error3'),
      ])
      const value = await result
      expect(value).toEqual(err(['error1', 'error2', 'error3']))
    })

    it('should handle empty array', async () => {
      const result = combineAsyncWithAllErrors([])
      const value = await result
      expect(value).toEqual(ok([]))
    })

    it('should preserve order of errors from async operations', async () => {
      const result = combineAsyncWithAllErrors([
        errAsync('first'),
        okAsync(1),
        errAsync('second'),
        okAsync(2),
        errAsync('third'),
      ])
      const value = await result
      expect(value).toEqual(err(['first', 'second', 'third']))
    })

    it('should handle mixed async error types', async () => {
      const result = combineAsyncWithAllErrors([
        okAsync(1),
        errAsync('string error'),
        errAsync(404),
        errAsync({ code: 500, message: 'server error' }),
      ])
      const value = await result
      expect(value).toEqual(err(['string error', 404, { code: 500, message: 'server error' }]))
    })

    it('should process errors in parallel', async () => {
      const start = Date.now()
      const delay = (ms: number, value: string) =>
        new Promise((_, reject) => setTimeout(() => reject(value), ms))

      const result = combineAsyncWithAllErrors([
        okAsync(1),
        ResultAsync.fromSafePromise(delay(50, 'error1')),
        ResultAsync.fromSafePromise(delay(50, 'error2')),
        okAsync(2),
      ])

      const value = await result
      const elapsed = Date.now() - start

      expect(value).toEqual(err(['error1', 'error2']))
      // Should take ~50ms (parallel) not ~100ms (sequential)
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('combine function type inference', () => {
    it('should infer correct return types for sync operations', () => {
      // These should compile without type errors
      const syncSingle: Result<readonly number[], string> = combine([ok(1), ok(2)])
      const syncMultiple: Result<readonly number[], string[]> = combineWithAllErrors([ok(1), ok(2)])

      expect(syncSingle.isOk()).toBe(true)
      expect(syncMultiple.isOk()).toBe(true)
    })

    it('should infer correct return types for async operations', () => {
      // These should compile without type errors
      const asyncSingle: ResultAsync<readonly number[], string> = combineAsync([
        okAsync(1),
        okAsync(2),
      ])
      const asyncMultiple: ResultAsync<readonly number[], string[]> = combineAsyncWithAllErrors([
        okAsync(1),
        okAsync(2),
      ])

      expect(asyncSingle).toBeInstanceOf(ResultAsync)
      expect(asyncMultiple).toBeInstanceOf(ResultAsync)
    })
  })

  describe('Edge cases and performance', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ok(i))
      const result = combine(largeArray)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1000)
        expect(result.value[0]).toBe(0)
        expect(result.value[999]).toBe(999)
      }
    })

    it('should handle large arrays with errors efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) =>
        i % 100 === 0 ? err(`error-${i}`) : ok(i),
      )
      const result = combineWithAllErrors(largeArray)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toHaveLength(10) // errors at 0, 100, 200, ..., 900
        expect(result.error[0]).toBe('error-0')
        expect(result.error[9]).toBe('error-900')
      }
    })

    it('should handle async operations with different completion times', async () => {
      const results = [
        ResultAsync.fromSafePromise(new Promise((resolve) => setTimeout(() => resolve(1), 100))),
        ResultAsync.fromSafePromise(new Promise((resolve) => setTimeout(() => resolve(2), 50))),
        ResultAsync.fromSafePromise(new Promise((resolve) => setTimeout(() => resolve(3), 75))),
      ]

      const combined = combineAsync(results)
      const value = await combined

      expect(value).toEqual(ok([1, 2, 3]))
    })
  })
})

describe('lift function', () => {
  describe('Basic Functionality', () => {
    it('should lift unary functions correctly', () => {
      const double = (x: number) => x * 2
      const liftedDouble: ExpectedLiftedUnary<number, number> = lift(double)

      const result: ExpectedResult<number> = liftedDouble(ok(5))
      expect(result).toEqual(ok(10))
    })

    it('should lift binary functions correctly', () => {
      const add = (a: number, b: number) => a + b
      const liftedAdd: ExpectedLiftedBinary<number, number, number> = lift(add)

      const result: ExpectedResult<number> = liftedAdd(ok(2), ok(3))
      expect(result).toEqual(ok(5))
    })

    it('should lift ternary functions correctly', () => {
      const add3 = (a: number, b: number, c: number) => a + b + c
      const liftedAdd3: ExpectedLiftedTernary<number, number, number, number> = lift(add3)

      const result: ExpectedResult<number> = liftedAdd3(ok(1), ok(2), ok(3))
      expect(result).toEqual(ok(6))
    })

    it('should lift variadic functions correctly', () => {
      const joinStrings = (...args: string[]) => args.join(' ')
      const liftedJoin: ExpectedLiftedVariadic<string> = lift(joinStrings)

      const result: ExpectedResult<string> = liftedJoin(ok('Hello'), ok('beautiful'), ok('world'))
      expect(result).toEqual(ok('Hello beautiful world'))
    })

    it('should work with functions returning different types', () => {
      const makeFullName = (first: string, middle: string, last: string) =>
        `${first} ${middle} ${last}`
      const liftedMakeFullName: ExpectedLiftedTernary<string, string, string, string> = lift(
        makeFullName,
      )

      const result: ExpectedResult<string> = liftedMakeFullName(ok('John'), ok('Q'), ok('Doe'))
      expect(result).toEqual(ok('John Q Doe'))
    })
  })

  describe('Error Handling and Short-Circuiting', () => {
    it('should short-circuit on first error in unary function', () => {
      const double = (x: number) => x * 2
      const liftedDouble: ExpectedLiftedUnary<number, number> = lift(double)

      const result: ExpectedResult<number> = liftedDouble(err('bad input'))
      expect(result).toEqual(err('bad input'))
    })

    it('should short-circuit on first error in binary function', () => {
      const spy = vi.fn((a: number, b: number) => a + b)
      const liftedAdd: ExpectedLiftedBinary<number, number, number> = lift(spy)

      const result: ExpectedResult<number> = liftedAdd(err('first error'), ok(3))
      expect(result).toEqual(err('first error'))
      expect(spy).not.toHaveBeenCalled()
    })

    it('should short-circuit on second error in binary function', () => {
      const spy = vi.fn((a: number, b: number) => a + b)
      const liftedAdd: ExpectedLiftedBinary<number, number, number> = lift(spy)

      const result: ExpectedResult<number> = liftedAdd(ok(2), err('second error'))
      expect(result).toEqual(err('second error'))
      expect(spy).not.toHaveBeenCalled()
    })

    it('should short-circuit to first error when multiple errors present', () => {
      const spy = vi.fn((a: number, b: number, c: number) => a + b + c)
      const liftedAdd3: ExpectedLiftedTernary<number, number, number, number> = lift(spy)

      const result: ExpectedResult<number> = liftedAdd3(
        err('first error'),
        err('second error'),
        ok(3),
      )
      expect(result).toEqual(err('first error'))
      expect(spy).not.toHaveBeenCalled()
    })

    it('should process arguments left-to-right and stop at first error', () => {
      const spy1 = vi.fn(() => ok(1))
      const spy2 = vi.fn(() => err('second error'))
      const spy3 = vi.fn(() => ok(3))
      const targetFn = vi.fn((a: number, b: number, c: number) => a + b + c)

      const liftedFn: ExpectedLiftedTernary<number, number, number, number> = lift(targetFn)

      const result: ExpectedResult<number> = liftedFn(spy1(), spy2(), spy3())

      expect(result).toEqual(err('second error'))
      expect(spy1).toHaveBeenCalledTimes(1)
      expect(spy2).toHaveBeenCalledTimes(1)
      expect(spy3).toHaveBeenCalledTimes(1) // All are called because they're evaluated before being passed
      expect(targetFn).not.toHaveBeenCalled()
    })

    it('should handle mixed Ok and Err results correctly', () => {
      const multiply = (a: number, b: number, c: number) => a * b * c
      const liftedMultiply: ExpectedLiftedTernary<number, number, number, number> = lift(multiply)

      // First two Ok, third Err
      const result1: ExpectedResult<number> = liftedMultiply(ok(2), ok(3), err('bad third'))
      expect(result1).toEqual(err('bad third'))

      // All Ok
      const result2: ExpectedResult<number> = liftedMultiply(ok(2), ok(3), ok(4))
      expect(result2).toEqual(ok(24))
    })
  })

  describe('Function Execution', () => {
    it('should call the underlying function with correct arguments when all are Ok', () => {
      const spy = vi.fn((a: number, b: string, c: boolean) => `${a}-${b}-${c}`)
      const liftedFn: ExpectedLiftedTernary<number, string, boolean, string> = lift(spy)

      const result: ExpectedResult<string> = liftedFn(ok(42), ok('test'), ok(true))

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(42, 'test', true)
      expect(result).toEqual(ok('42-test-true'))
    })

    it('should not call the underlying function when any argument is Err', () => {
      const spy = vi.fn((a: number, b: number) => a + b)
      const liftedAdd: ExpectedLiftedBinary<number, number, number> = lift(spy)

      liftedAdd(ok(1), err('error'))
      expect(spy).not.toHaveBeenCalled()
    })

    it('should handle functions that return complex types', () => {
      const createUser = (id: number, name: string, active: boolean) => ({
        id,
        name,
        active,
        createdAt: new Date('2023-01-01'),
      })

      type User = ReturnType<typeof createUser>
      const liftedCreateUser: ExpectedLiftedTernary<number, string, boolean, User> = lift(
        createUser,
      )

      const result: ExpectedResult<User> = liftedCreateUser(ok(1), ok('Alice'), ok(true))

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: 1,
          name: 'Alice',
          active: true,
          createdAt: new Date('2023-01-01'),
        })
      }
    })
  })

  describe('Integration with Different Result Types', () => {
    it('should work with Results containing different error types', () => {
      const divide = (a: number, b: number) => a / b
      const liftedDivide: ExpectedLiftedBinary<number, number, number> = lift(divide)

      // Number error
      const result1: ExpectedResult<number> = liftedDivide(ok(10), err(404))
      expect(result1).toEqual(err(404))

      // String error
      const result2: ExpectedResult<number> = liftedDivide(ok(10), err('division error'))
      expect(result2).toEqual(err('division error'))

      // Object error
      const errorObj = { code: 500, message: 'Server error' }
      const result3: ExpectedResult<number> = liftedDivide(ok(10), err(errorObj))
      expect(result3).toEqual(err(errorObj))
    })

    it('should preserve first error type when multiple errors of different types', () => {
      const fn = (a: number, b: string, c: boolean) => `${a}-${b}-${c}`
      const liftedFn: ExpectedLiftedTernary<number, string, boolean, string> = lift(fn)

      // First error is string, second is number - should preserve string error
      const result: ExpectedResult<string> = liftedFn(err('string error'), err(500), ok(true))

      expect(result).toEqual(err('string error'))
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero-argument functions', () => {
      const getConstant = () => 42
      const liftedGetConstant: LiftedFunction<() => number> = lift(getConstant)

      const result: ExpectedResult<number> = liftedGetConstant()
      expect(result).toEqual(ok(42))
    })

    it('should handle functions that throw errors', () => {
      const throwingFn = (x: number) => {
        if (x < 0) throw new Error('Negative input')
        return x * 2
      }
      const liftedThrowingFn: ExpectedLiftedUnary<number, number> = lift(throwingFn)

      // This should not throw, but rather return an Err
      const result: ExpectedResult<number> = liftedThrowingFn(ok(-5))

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(Error)
        expect((result.error as Error).message).toBe('Negative input')
      }
    })

    it('should handle functions returning undefined', () => {
      const voidFn = (x: number) => {
        console.log(x)
      } // Returns undefined
      const liftedVoidFn: ExpectedLiftedUnary<number, void> = lift(voidFn)

      const result: ExpectedResult<void> = liftedVoidFn(ok(5))
      expect(result).toEqual(ok(undefined))
    })

    it('should handle functions returning null', () => {
      const nullFn = (x: number) => (x > 10 ? null : x)
      const liftedNullFn: ExpectedLiftedUnary<number, number | null> = lift(nullFn)

      const result1: ExpectedResult<number | null> = liftedNullFn(ok(15))
      expect(result1).toEqual(ok(null))

      const result2: ExpectedResult<number | null> = liftedNullFn(ok(5))
      expect(result2).toEqual(ok(5))
    })
  })

  describe('Performance and Efficiency', () => {
    it('should not execute expensive computations when early error occurs', () => {
      const expensiveComputation = vi.fn((a: number, b: number, c: number) => {
        // Simulate expensive operation
        let sum = 0
        for (let i = 0; i < 1000000; i++) {
          sum += a + b + c
        }
        return sum
      })

      const liftedExpensive: ExpectedLiftedTernary<number, number, number, number> = lift(
        expensiveComputation,
      )

      // Early error should prevent expensive computation
      const result: ExpectedResult<number> = liftedExpensive(err('early error'), ok(2), ok(3))

      expect(result).toEqual(err('early error'))
      expect(expensiveComputation).not.toHaveBeenCalled()
    })
  })

  describe('Type Safety Examples', () => {
    it('should maintain type safety for complex function signatures', () => {
      // Complex function with mixed types
      const processData = (
        id: number,
        config: { enabled: boolean; retries: number },
        tags: string[],
      ) => ({
        processedId: id * 2,
        isEnabled: config.enabled,
        maxRetries: config.retries,
        tagCount: tags.length,
        summary: `Processed ${id} with ${tags.length} tags`,
      })

      type ProcessResult = ReturnType<typeof processData>
      const liftedProcess: LiftedFunction<typeof processData> = lift(processData)

      const result: ExpectedResult<ProcessResult> = liftedProcess(
        ok(123),
        ok({ enabled: true, retries: 3 }),
        ok(['tag1', 'tag2', 'tag3']),
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.processedId).toBe(246)
        expect(result.value.isEnabled).toBe(true)
        expect(result.value.maxRetries).toBe(3)
        expect(result.value.tagCount).toBe(3)
        expect(result.value.summary).toBe('Processed 123 with 3 tags')
      }
    })
  })
})
