import { describe, it, expect } from 'vitest'
import { futureResult } from '../src/future-result'
import { err, ok } from '../src'

describe('Future Result – basics', () => {
  it('should correctly compute the sum of numbers and a string', () => {
    const add3 = futureResult((a: number, b: number, c: string) => a + b + parseInt(c))
      .pushArgs(2)
      .pushArgs(() => ok(3))
      .pushArgs('5')

    expect(add3()).toEqual(ok(10))
  })

  it('should short circuit to earliest error', () => {
    const failing = futureResult((a: number, b: number, c: number) => a + b)
      .pushArgs(() => err('Something went wrong'))
      .pushArgs(() => err('Womp Womp'))
      .pushArgs(() => err(2))

    expect(failing()).toEqual(err('Something went wrong'))
  })

  it('should be callable with arguments', () => {
    const add = futureResult((a: number, b: number, c: number) => a + b + c)
      .pushArgs(1)
      .pushArgs(ok(2))

    expect(add(3)).toEqual(ok(6))
  })
  it('push and argument equality', () => {
    const add = futureResult((a: number, b: number, c: number) => a + b + c)
    const result = add
      .pushArgs(1)
      .pushArgs(ok(2))
      .pushArgs(() => ok(3))()
    const result2 = add(2, 2, 3)

    expect(result).toEqual(result2)
  })
  it('should allow for normal result operations after calling', () => {
    const result = futureResult((a: number, b: number, c: number) => a + b + c)
      .pushArgs(1)
      .pushArgs(ok(2))
      .pushArgs(() => ok(3))()
    const double = result.map((v) => 2 * v)
    expect(double.value).toBe(2 * result.value)
  })

  it('should safely divide numbers', () => {
    const divide = futureResult((a: number, b: number) => {
      if (b === 0) throw new Error('Division by zero')
      return a / b
    })

    const safeDivide = divide.pushArgs(10).pushArgs(ok(2))

    expect(safeDivide()).toEqual(ok(5))
  })
})
