import { describe, it, expect } from 'vitest'
import { LazyIterator } from '../src/_internals/lazyiterator'

/* -------------------------------------------------------------------------- *
 *  HELPERS                                                                   *
 * -------------------------------------------------------------------------- */

function* gen(range: readonly number[]): Generator<number> {
  yield* range
}

/* -------------------------------------------------------------------------- *
 *  BASIC ITERATION + .toArray                                                *
 * -------------------------------------------------------------------------- */
describe('LazyIterator – basics', () => {
  it('range() yields the correct inclusive/exclusive sequence', () => {
    expect(LazyIterator.range(1, 6).toArray()).toEqual([1, 2, 3, 4, 5])
    expect(LazyIterator.range(5, 0, -2).toArray()).toEqual([5, 3, 1])
  })

  it('repeat() produces indefinite values and can be sliced with take()', () => {
    expect(LazyIterator.repeat('x').take(4).toArray()).toEqual(['x', 'x', 'x', 'x'])
    expect(LazyIterator.repeat(7, 3).toArray()).toEqual([7, 7, 7])
  })
})

/* -------------------------------------------------------------------------- *
 *  ADAPTER HELPERS (map, filter, flatMap, take, drop)                        *
 * -------------------------------------------------------------------------- */
describe('Adapter helpers', () => {
  it('chains filter → map → take (even squares, first 3)', () => {
    const result = LazyIterator.range(1, 11)
      .filter((x) => x % 2 === 0)
      .map((x) => x * x)
      .take(3)
      .toArray()
    expect(result).toEqual([4, 16, 36])
  })

  it('drop() then map() on an array-backed iterator', () => {
    const out = LazyIterator.from([1, 2, 3, 4, 5])
      .drop(2)
      .map((x) => x * 10)
      .toArray()
    expect(out).toEqual([30, 40, 50])
  })

  it('flatMap() flattens the inner iterables lazily', () => {
    const out = LazyIterator.from([1, 2, 3])
      .flatMap((x) => [x, x * 2])
      .toArray()
    expect(out).toEqual([1, 2, 2, 4, 3, 6])
  })

  it('take() / drop() with limits larger than length are safe', () => {
    expect(LazyIterator.from([1, 2]).take(10).toArray()).toEqual([1, 2])
    expect(LazyIterator.from([1, 2]).drop(10).toArray()).toEqual([])
  })
})

/* -------------------------------------------------------------------------- *
 *  CONSUMER HELPERS (reduce, some, every, find, forEach)                     *
 * -------------------------------------------------------------------------- */
describe('Consumer helpers', () => {
  it('reduce() computes a sum with an explicit seed', () => {
    const sum = LazyIterator.range(1, 6).reduce((acc, v) => acc + v, 0)
    expect(sum).toBe(15)
  })

  it('some() / every() obey short-circuit semantics', () => {
    const it1 = LazyIterator.range(1, 10)
    expect(it1.some((x) => x > 5)).toBe(true)

    const it2 = LazyIterator.range(1, 4)
    expect(it2.every((x) => x < 10)).toBe(true)
  })

  it('find() returns the first matching element or undefined', () => {
    const even = LazyIterator.range(1, 10).find((x) => x % 2 === 0)
    expect(even).toBe(2)

    const none = LazyIterator.range(1, 4).find((x) => x > 10)
    expect(none).toBeUndefined()
  })

  it('forEach() visits every element in order', () => {
    const visited: number[] = []
    LazyIterator.range(1, 5).forEach((v) => visited.push(v))
    expect(visited).toEqual([1, 2, 3, 4])
  })
})

/* -------------------------------------------------------------------------- *
 *  ERROR CONDITIONS (TypeError / RangeError per spec)                        *
 * -------------------------------------------------------------------------- */
describe('Error handling', () => {
  it('map() throws when callback is not callable', () => {
    expect(() => (LazyIterator.from([1]).map as any)(123)).toThrow(TypeError)
  })

  it('filter() throws when callback is not callable', () => {
    expect(() => (LazyIterator.from([1]).filter as any)(null)).toThrow(TypeError)
  })

  it('take() / drop() reject negative limits', () => {
    expect(() => LazyIterator.from([1]).take(-1)).toThrow(RangeError)
    expect(() => LazyIterator.from([1]).drop(-3)).toThrow(RangeError)
  })

  it('range() rejects step 0', () => {
    expect(() => LazyIterator.range(0, 10, 0)).toThrow(RangeError)
  })
})

/* -------------------------------------------------------------------------- *
 *  LAZINESS — side-effect must happen only on consumption                    *
 * -------------------------------------------------------------------------- */
describe('Laziness guarantees', () => {
  it('adapter chain is not executed until iterated', () => {
    let hits = 0
    const it = LazyIterator.range(1, 4).map((x) => {
      hits++
      return x
    })
    expect(hits).toBe(0) // nothing yet
    expect(it.take(2).toArray()).toEqual([1, 2])
    expect(hits).toBe(2) // only first two evaluated
  })
})

/* -------------------------------------------------------------------------- *
 *  PROTOTYPE RETENTION — adapters return same runtime class                  *
 * -------------------------------------------------------------------------- */
describe('Prototype retention', () => {
  class FancyIter<X> extends LazyIterator<X> {
    doubleFirst(): X | undefined {
      const first = this.take(1).toArray()[0]
      // @ts-ignore
      return typeof first === 'number' ? (first as any) * 2 : first
    }
  }

  it('adapter helpers return FancyIter, preserving subclass methods', () => {
    const iter = new FancyIter(() => gen([1, 2, 3]))
      .map((x) => x) // FancyIter after each hop
      .filter(() => true)

    expect(iter).toBeInstanceOf(FancyIter)
    expect(iter.doubleFirst()).toBe(2)
  })
})

/* -------------------------------------------------------------------------- *
 *  INFINITE SOURCE — works with take() to remain finite                      *
 * -------------------------------------------------------------------------- */
describe('Infinite generators with take()', () => {
  it('lazily generates Fibonacci numbers', () => {
    const fibonacci = new LazyIterator(function* () {
      let [a, b] = [0, 1]
      while (true) {
        yield a
        ;[a, b] = [b, a + b]
      }
    })
    expect(fibonacci.take(10).toArray()).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34])
  })
})
