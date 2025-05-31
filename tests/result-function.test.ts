import { describe, it, expect, vi } from 'vitest'
import { ResultCallable, resultFn } from '../src/result-function'
import { err, ok } from '../src'

describe('Future Result – basics', () => {
  describe('Argument Pushing', () => {
    it('should correctly push arguments onto function', () => {
      const add3 = resultFn((a: number, b: number, c: string) => a + b + parseInt(c))
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      console.log(add3)

      expect(add3().value).toEqual(10)
    })
    it('should correctly push arguments onto result returning function', () => {
      const add3 = resultFn((a: number, b: number, c: string) => ok(a + b + parseInt(c)))
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      expect(add3()).toEqual(ok(10))
    })
    it('should correctly error when passed in function returns an error', () => {
      const add3 = resultFn((a: number, b: number, c: string) => err('Unexpected error'))
        .applyArg(2)
        .applyArg(() => ok(3))
        .applyArg('5')

      expect(add3()).toEqual(err('Unexpected error'))
    })
  })

  describe('Function Callability', () => {
    it('should be callable with arguments', () => {
      const add = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(1)
        .applyArg(ok(2))

      expect(add(3)).toEqual(ok(6))
    })
    it('push and argument equality', () => {
      const add = resultFn((a: number, b: number, c: number) => a + b + c)
      const result = add
        .applyArg(1)
        .applyArg(ok(2))
        .applyArg(() => ok(3))()
      const result2 = add(1, 2, 3)

      expect(result).toEqual(result2)
    })
  })
  describe('Result Method Parity', () => {
    it('should allow for normal result operations after calling', () => {
      const result = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(1 as const)
        .applyArg(ok(2 as const))
        .applyArg(() => ok(3))

      expect(result().value).toEqual(6)
    })
  })

  describe('Result Operations', () => {
    it('should allow for normal result operations after calling', () => {
      const result = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(1)
        .applyArg(ok(2))
        .applyArg(() => ok(3))()
      const double = result.map((v) => 2 * v)
      expect(double.value).toEqual(2 * (result.value as number))
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn.applyArg(x)(); map', () => {
      const spy = vi.fn((a: number, b: number) => a + b)
      const fn = resultFn(spy)
      const arg1 = 2
      const arg2 = 3

      // Case 1: .applyArg then .map, then call
      const mapped1 = fn
        .applyArg(arg1)
        .applyArg(arg2)
        .map((v) => v * 10)
      const result1 = mapped1()
      // Case 2: .applyArg then call, then .map
      const mapped2 = fn.applyArg(arg1).applyArg(arg2)()
      const result2 = mapped2.map((v) => v * 10)

      expect(result1).toEqual(result2)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('should evaluate all arguments before mapping: .applyArg(x).map(fn) triggers all arg evaluation before map', () => {
      const argSpy1 = vi.fn(() => ok(5))
      const argSpy2 = vi.fn(() => ok(7))
      const fn = resultFn((a: number, b: number) => a + b)
      const mapped = fn
        .applyArg(argSpy1)
        .applyArg(argSpy2)
        .map((v) => v * 2)
      mapped()
      expect(argSpy1).toHaveBeenCalledTimes(1)
      expect(argSpy2).toHaveBeenCalledTimes(1)
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn(x).map(fn)', () => {
      const spy = vi.fn((a: number, b: number) => a * b)
      const fn = resultFn(spy)
      const arg1 = 4
      const arg2 = 6

      // .applyArg then .map, then call
      const mapped1 = fn
        .applyArg(arg1)
        .applyArg(arg2)
        .map((v) => v + 1)

      const result1 = mapped1()
      // .applyArg then call, then .map
      const mapped2 = fn.applyArg(arg1).applyArg(arg2)()
      const result2 = mapped2.map((v) => v + 1)

      expect(result1).toEqual(result2)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('should be equivalent: fn.applyArg(x).map(fn) === fn(x).map(fn) with lazy arg', () => {
      const argSpy = vi.fn(() => ok(10))
      const fn = resultFn((a: number) => a * 2)
      // .applyArg with lazy, then .map, then call
      const mapped1 = fn.applyArg(argSpy).map((v) => v + 5)
      const result1 = mapped1()
      // .applyArg with lazy, then call, then .map
      const mapped2 = fn.applyArg(argSpy)()
      const result2 = mapped2.map((v) => v + 5)

      expect(result1).toEqual(result2)
      expect(argSpy).toHaveBeenCalledTimes(2)
    })

    it('should be equivalent: all orderings of applyArg and map should produce same result', () => {
      const spy = vi.fn((a: number, b: number) => a - b)
      const fn = resultFn(spy)
      const arg1 = 10
      const arg2 = 3
      const mapFn = (v: number) => v * 100

      // Test all different orderings should produce same result:

      // 1. arg → map → arg
      const ordering1 = fn.applyArg(arg1).map(mapFn).applyArg(arg2)

      // 2. arg → arg → map
      const ordering2 = fn.applyArg(arg1).applyArg(arg2).map(mapFn)

      // 3. map → arg → arg
      const ordering3 = fn.map(mapFn).applyArg(arg1).applyArg(arg2)

      // 4. map → arg → (arg)
      const ordering4 = fn.map(mapFn).applyArg(arg1)

      // Execute all orderings
      const result1 = ordering1()
      const result2 = ordering2()
      const result3 = ordering3()
      const result4 = ordering4(arg2)

      // All should produce the same result: (10 - 3) * 100 = 700
      const expectedValue = (10 - 3) * 100
      expect(result1.value).toEqual(expectedValue)
      expect(result2.value).toEqual(expectedValue)
      expect(result3.value).toEqual(expectedValue)
      expect(result4.value).toEqual(expectedValue)

      expect(spy).toHaveBeenCalledTimes(4)
    })

    it('should evaluate all arguments before mapping in sandwiched case', () => {
      const argSpy1 = vi.fn(() => ok(8))
      const argSpy2 = vi.fn(() => ok(2))
      const fn = resultFn((a: number, b: number) => a / b)
      // Sandwiched: applyArg, map, applyArg, then call
      const sandwiched = fn
        .applyArg(argSpy1)
        .map((v) => v + 1)
        .applyArg(argSpy2)
      sandwiched()
      expect(argSpy1).toHaveBeenCalledTimes(1)
      expect(argSpy2).toHaveBeenCalledTimes(1)
    })
  })

  describe('Prefilled Results', () => {
    it('Should allow prefilled Future results as parameters to functions', () => {
      const prefilled = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(1)
        .applyArg(ok(2))

      type Fn = ResultCallable<[number], number>

      const fillResult = (fn: Fn) => {
        return fn.applyArg(3)
      }
      const filledFunction = fillResult(prefilled)

      expect(filledFunction()).toEqual(ok(6))
    })
  })

  describe('Error Handling', () => {
    it('should safely divide numbers', () => {
      const divide = resultFn((a: number, b: number) => {
        if (b === 0) throw new Error('Division by zero')
        return a / b
      })

      const safeDivide = divide.applyArg(10).applyArg(ok(2))

      expect(safeDivide()).toEqual(ok(5))
    })
  })

  describe('Short Circuit Testing', () => {
    it('should short circuit to the first error in a chain', () => {
      const spy1 = vi.fn(() => ok(3))
      const spy2 = vi.fn(() => ok(2))
      const spy3 = vi.fn(() => err('First error'))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(spy1)
        .applyArg(spy2)
        .applyArg(spy3) //first to be called

      expect(failing()).toEqual(err('First error'))
      expect(spy1).not.toHaveBeenCalled()
      expect(spy2).not.toHaveBeenCalled()
      expect(spy3).toHaveBeenCalledTimes(1)
    })

    it('should short circuit to the first error in a chain with multiple errors', () => {
      const spy1 = vi.fn(() => err('First error'))
      const spy2 = vi.fn(() => err('Second error'))
      const spy3 = vi.fn(() => ok(3))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(spy1)
        .applyArg(spy2)
        .applyArg(spy3)

      expect(failing()).toEqual(err('Second error')) // Arguments are resolved in reverse order
      expect(spy1).not.toHaveBeenCalled()
      expect(spy2).toHaveBeenCalledTimes(1)
      expect(spy3).toHaveBeenCalledTimes(1)
    })

    it('should short circuit to the first error in a chain with a mix of errors and values', () => {
      const spy1 = vi.fn(() => ok(1))
      const spy2 = vi.fn(() => err('Second error'))
      const spy3 = vi.fn(() => ok(3))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .applyArg(spy1)
        .applyArg(spy2)
        .applyArg(spy3)

      expect(failing()).toEqual(err('Second error'))
      expect(spy1).not.toHaveBeenCalled()
      expect(spy2).toHaveBeenCalledTimes(1)
      expect(spy3).toHaveBeenCalledTimes(1)
    })
  })

  describe('Lazy chaining – ensure no execution until _execute', () => {
    it('map should not call underlying function when chaining', () => {
      const spyFn = vi.fn((x: number) => x + 1)
      const chain = resultFn(spyFn).applyArg(5)
      const mapped = chain.map((v) => v * 2)
      // No execution yet
      expect(spyFn).not.toHaveBeenCalled()

      // Executing now should call once
      expect(mapped().value).toEqual(12)
      expect(spyFn).toHaveBeenCalledTimes(1)
    })

    it('andThen should not call underlying function when chaining', () => {
      const spyFn = vi.fn((x: number) => x + 1)
      const chain = resultFn(spyFn).applyArg(3)
      const thened = chain.andThen((v) => ok(v * 3))
      expect(spyFn).not.toHaveBeenCalled()

      // Executing now should call once
      expect(thened()).toEqual(ok(12))
      expect(spyFn).toHaveBeenCalledTimes(1)
    })

    it('mapErr should not call underlying function when chaining', () => {
      // Use a function that throws to produce an Err
      const spyFn = vi.fn(() => {
        throw new Error('fail')
      })
      const chain = resultFn(spyFn)
      const handled = chain.mapErr((e) => ({ message: (e as Error).message }))
      expect(spyFn).not.toHaveBeenCalled()

      const result = handled()
      expect(spyFn).toHaveBeenCalledTimes(1)
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toEqual({ message: 'fail' })
      }
    })

    it('composed map → andThen → mapErr should not execute until _execute', () => {
      const spyFn = vi.fn((x: number) => x * 2)
      const chain = resultFn(spyFn)
        .applyArg(4)
        .map((v) => v + 1)
        .andThen((v) => ok(v - 2))
        .mapErr((e) => `Error: ${e}`)

      // None of the above should have called spyFn yet
      expect(spyFn).not.toHaveBeenCalled()
      // Now executing
      const final = chain()
      if (final.isErr()) {
        const fn = final.value
      }
      expect(spyFn).toHaveBeenCalledTimes(1)
      expect(final.value).toEqual(4 * 2 + 1 - 2)
    })
  })

  describe('Result and ResultCallable Equivalence', () => {
    it('should be equivalent for andThen', () => {
      const result = resultFn((a: number) => a * 2).applyArg(5)

      const normalResult = result().andThen((v) => ok(v * 2))
      const callableResult = result.andThen((v) => ok(v * 2))()

      expect(normalResult).toEqual(callableResult)
    })

    it('should be equivalent for map', () => {
      const result = resultFn((a: number) => a * 2).applyArg(5)

      const normalResult = result().map((v) => v * 2)
      const callableResult = result.map((v) => v * 2)()

      expect(normalResult).toEqual(callableResult)
    })

    it('should be equivalent for mapErr', () => {
      const result = resultFn((a: number) => a * 2)
        .andThen((v) => err(v * 2))
        .applyArg(5)

      const normalResult = result().mapErr((e) => e * 2)
      const callableResult = result.mapErr((e) => e * 2)()

      expect(normalResult).toEqual(callableResult)
    })
  })
})
