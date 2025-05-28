import { describe, it, expect, vi } from 'vitest'
import { ResultCallable, resultFn } from '../src/result-function'
import { err, ok } from '../src'

describe('Future Result – basics', () => {
  describe('Argument Pushing', () => {
    it('should correctly push arguments onto function', () => {
      const add3 = resultFn((a: number, b: number, c: string) => a + b + parseInt(c))
        .pushArgs(2)
        .pushArgs(() => ok(3))
        .pushArgs('5')

      console.log(add3)

      expect(add3().value).toEqual(10)
    })
    it('should correctly push arguments onto result returning function', () => {
      const add3 = resultFn((a: number, b: number, c: string) => ok(a + b + parseInt(c)))
        .pushArgs(2)
        .pushArgs(() => ok(3))
        .pushArgs('5')

      expect(add3()).toEqual(ok(10))
    })
    it('should correctly error when passed in function returns an error', () => {
      const add3 = resultFn((a: number, b: number, c: string) => err('Unexpected error'))
        .pushArgs(2)
        .pushArgs(() => ok(3))
        .pushArgs('5')

      expect(add3()).toEqual(err('Unexpected error'))
    })
  })

  describe('Function Callability', () => {
    it('should be callable with arguments', () => {
      const add = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(1)
        .pushArgs(ok(2))

      expect(add(3)).toEqual(ok(6))
    })
    it('push and argument equality', () => {
      const add = resultFn((a: number, b: number, c: number) => a + b + c)
      const result = add
        .pushArgs(1)
        .pushArgs(ok(2))
        .pushArgs(() => ok(3))()
      const result2 = add(1, 2, 3)

      expect(result).toEqual(result2)
    })
  })
  describe('Result Method Parity', () => {
    it('should allow for normal result operations after calling', () => {
      const result = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(1 as const)
        .pushArgs(ok(2 as const))
        .pushArgs(() => ok(3))

      expect(result().value).toEqual(6)
    })
  })

  describe('Result Operations', () => {
    it('should allow for normal result operations after calling', () => {
      const result = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(1)
        .pushArgs(ok(2))
        .pushArgs(() => ok(3))()
      const double = result.map((v) => 2 * v)
      expect(double.value).toEqual(2 * result.value)
    })
  })

  describe('Prefilled Results', () => {
    it('Should allow prefilled Future results as parameters to functions', () => {
      const prefilled = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(1)
        .pushArgs(ok(2))

      type Fn = ResultCallable<[number], number>

      const fillResult = (fn: Fn) => {
        return fn.pushArgs(3)
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

      const safeDivide = divide.pushArgs(10).pushArgs(ok(2))

      expect(safeDivide()).toEqual(ok(5))
    })
  })

  describe('Short Circuit Testing', () => {
    it('should short circuit to the first error in a chain', () => {
      const spy1 = vi.fn(() => err('First error'))
      const spy2 = vi.fn(() => ok(2))
      const spy3 = vi.fn(() => ok(3))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(spy1)
        .pushArgs(spy2)
        .pushArgs(spy3)

      expect(failing()).toEqual(err('First error'))
      expect(spy1).toHaveBeenCalledTimes(1)
      expect(spy2).not.toHaveBeenCalled()
      expect(spy3).not.toHaveBeenCalled()
    })

    it('should short circuit to the first error in a chain with multiple errors', () => {
      const spy1 = vi.fn(() => err('First error'))
      const spy2 = vi.fn(() => err('Second error'))
      const spy3 = vi.fn(() => ok(3))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(spy1)
        .pushArgs(spy2)
        .pushArgs(spy3)

      expect(failing()).toEqual(err('First error'))
      expect(spy1).toHaveBeenCalledTimes(1)
      expect(spy2).not.toHaveBeenCalled()
      expect(spy3).not.toHaveBeenCalled()
    })

    it('should short circuit to the first error in a chain with a mix of errors and values', () => {
      const spy1 = vi.fn(() => ok(1))
      const spy2 = vi.fn(() => err('Second error'))
      const spy3 = vi.fn(() => ok(3))

      const failing = resultFn((a: number, b: number, c: number) => a + b + c)
        .pushArgs(spy1)
        .pushArgs(spy2)
        .pushArgs(spy3)

      expect(failing()).toEqual(err('Second error'))
      expect(spy1).toHaveBeenCalledTimes(1)
      expect(spy2).toHaveBeenCalledTimes(1)
      expect(spy3).not.toHaveBeenCalled()
    })
  })
})
