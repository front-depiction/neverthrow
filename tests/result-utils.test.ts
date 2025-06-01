import { describe, it, expect, vi } from 'vitest'
import { lift, LiftedFunction } from '../src/result-utils'
import { err, ok } from '../src/result-utils'
import { Result } from '../src'

// Type assertions for compile-time type checking
type ExpectedResult<T, E = unknown> = Result<T, E>
type ExpectedLiftedUnary<A, R> = LiftedFunction<(a: A) => R>
type ExpectedLiftedBinary<A, B, R> = LiftedFunction<(a: A, b: B) => R>
type ExpectedLiftedTernary<A, B, C, R> = LiftedFunction<(a: A, b: B, c: C) => R>
type ExpectedLiftedVariadic<R> = LiftedFunction<(...args: string[]) => R>

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
