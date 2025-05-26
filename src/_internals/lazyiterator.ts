/*  LazyIterator –  a minimal poly-fill / shim for the TC-39 iterator-helpers
 *  proposal.  All adapters are LAZY; all consumers are eager.
 *  Returned iterators keep the SAME runtime class, so subclass helpers survive
 *  every hop.
 */
export class LazyIterator<T> implements IterableIterator<T> {
  /* [[Generator]] – internal slot that drives iteration */
  private _generator: Generator<T>

  /* ------------------------------------------------------------------ *
   *  Construction helpers                                               *
   * ------------------------------------------------------------------ */

  /**
   * Primary constructor – accepts a generator factory.
   */
  constructor(generatorFunction: () => Generator<T>) {
    this._generator = generatorFunction()
  }

  /**
   * § 7.4.2 *CreateIteratorFromClosure* – wrapped as a helper so that we can
   * return a new iterator **with the same prototype** as `this`.
   */
  protected _create<U>(gen: () => Generator<U>): LazyIterator<U> & this {
    const Ctor = this.constructor as new (g: () => Generator<U>) => LazyIterator<U>
    return new Ctor(gen) as LazyIterator<U> & this
  }

  /* ------------------------------------------------------------------ *
   *  Basic iterator protocol                                            *
   * ------------------------------------------------------------------ */

  /** § 7.4.1 *IteratorNext* */
  next(): IteratorResult<T> {
    return this._generator.next()
  }

  /** § 7.4.1 (Iterator objects are iterable) */
  [Symbol.iterator](): IterableIterator<T> {
    return this
  }

  /* ================================================================== *
   *  ADAPTER HELPERS  (return a new iterator = lazy)                    *
   * ================================================================== */

  /* -------------------------------------------------------------- *
   *  map  (§ 7.4.8.3)                                              *
   * -------------------------------------------------------------- */
  map<U>(
    mapperFunction: (value: T, index: number) => U,
    thisArg?: unknown,
  ): LazyIterator<U> & this {
    /* 1-4. Argument / this-binding validation                        */
    if (this === null || (typeof this !== 'object' && typeof this !== 'function'))
      throw new TypeError('Iterator.prototype.map called on non-object')
    if (typeof mapperFunction !== 'function') throw new TypeError('mapperFunction must be callable')

    /* 5-9. CreateIteratorFromClosure – performed by _create()         */
    return this._create(
      function* () {
        let k = 0
        for (const v of this as LazyIterator<T>) {
          /* 8.a Call mapperFunction with thisArg and value            */
          const mapped = mapperFunction.call(thisArg, v, k++)
          /* 8.b Yield mapped                                          */
          yield mapped
        }
        /* 9. IteratorClose happens automatically when generator ends  */
      }.bind(this),
    )
  }

  /* -------------------------------------------------------------- *
   *  filter  (§ 7.4.8.2)                                            *
   * -------------------------------------------------------------- */
  filter(predicate: (value: T, index: number) => boolean, thisArg?: unknown): this {
    if (typeof predicate !== 'function') throw new TypeError('predicate must be callable')

    return this._create(
      function* () {
        let k = 0
        for (const v of this as LazyIterator<T>) {
          if (predicate.call(thisArg, v, k++)) yield v // § 8.b
        }
      }.bind(this),
    ) as this
  }

  /* -------------------------------------------------------------- *
   *  flatMap  (§ 7.4.8.4)                                           *
   * -------------------------------------------------------------- */
  flatMap<U>(
    mapperFunction: (value: T, index: number) => Iterable<U> | Iterator<U>,
    thisArg?: unknown,
  ): LazyIterator<U> & this {
    if (typeof mapperFunction !== 'function') throw new TypeError('mapperFunction must be callable')

    return this._create(
      function* () {
        let k = 0
        for (const v of this as LazyIterator<T>) {
          const inner = mapperFunction.call(thisArg, v, k++)
          /* § 8.c Let iteratorRecord be GetIterator(inner)           */
          yield* inner
        }
      }.bind(this),
    )
  }

  /* -------------------------------------------------------------- *
   *  take  (§ 7.4.8.7)                                              *
   * -------------------------------------------------------------- */
  take(limit: number): this {
    if (limit < 0) throw new RangeError('take limit must be non-negative')

    /* Spec § 7.4.8.7 – steps 4-6 implemented verbatim */
    return this._create(
      function* () {
        let remaining = limit
        const it = (this as LazyIterator<T>)[Symbol.iterator]() // GetIteratorDirect

        while (remaining > 0) {
          const step = it.next() // IteratorStep
          if (step.done) break // 5.b – end of source
          remaining-- // 5.c
          yield step.value // 5.d
        }
        /* 6 – implicit Return(undefined) when generator completes */
      }.bind(this),
    ) as this
  }

  /* -------------------------------------------------------------- *
   *  drop  (§ 7.4.8.6)                                              *
   * -------------------------------------------------------------- */
  drop(limit: number): this {
    if (limit < 0) throw new RangeError('drop limit must be non-negative')

    /* Follows § 7.4.8.6 Drop – consume exactly <limit> items, no more */
    return this._create(
      function* () {
        let remaining = limit
        const it = (this as LazyIterator<T>)[Symbol.iterator]()

        /* 5.a Discard first <limit> elements */
        while (remaining > 0) {
          const step = it.next()
          if (step.done) return // shorter source
          remaining--
        }

        /* 5.b Yield the rest untouched */
        for (let step = it.next(); !step.done; step = it.next()) {
          yield step.value
        }
      }.bind(this),
    ) as this
  }

  /* ================================================================== *
   *  CONSUMER HELPERS  (eager – return a final result)                 *
   * ================================================================== */

  /** some (§ 7.4.8.10) */
  some(predicate: (value: T, index: number) => boolean, thisArg?: unknown): boolean {
    if (typeof predicate !== 'function') throw new TypeError('predicate must be callable')

    let k = 0
    for (const v of this) {
      if (predicate.call(thisArg, v, k++)) return true // § 8.a
    }
    return false // § 9
  }

  /** every (§ 7.4.8.1) */
  every(predicate: (value: T, index: number) => boolean, thisArg?: unknown): boolean {
    if (typeof predicate !== 'function') throw new TypeError('predicate must be callable')

    let k = 0
    for (const v of this) {
      if (!predicate.call(thisArg, v, k++)) return false // § 8.a
    }
    return true // § 9
  }

  /** find (§ 7.4.8.5) */
  find(predicate: (value: T, index: number) => boolean, thisArg?: unknown): T | undefined {
    if (typeof predicate !== 'function') throw new TypeError('predicate must be callable')

    let k = 0
    for (const v of this) {
      if (predicate.call(thisArg, v, k++)) return v // § 8.a
    }
    return undefined // § 9
  }

  /** reduce (§ 7.4.8.8) – simplified: always requires an initial value */
  reduce<U>(reducer: (acc: U, value: T, index: number) => U, initialValue: U): U {
    if (typeof reducer !== 'function') throw new TypeError('reducer must be callable')

    let acc = initialValue
    let k = 0
    for (const v of this) {
      acc = reducer(acc, v, k++) // § 8.b
    }
    return acc
  }

  /** forEach (§ 7.4.8.9) */
  forEach(fn: (value: T, index: number) => void, thisArg?: unknown): void {
    if (typeof fn !== 'function') throw new TypeError('callback must be callable')

    let k = 0
    for (const v of this) {
      fn.call(thisArg, v, k++) // § 8.a
    }
  }

  /** toArray (§ 7.4.8.11) */
  toArray(): T[] {
    return [...this] // spec step 8
  }

  /* ------------------------------------------------------------------ *
   *  Convenience static constructors                                    *
   * ------------------------------------------------------------------ */

  static from<U>(iterable: Iterable<U>): LazyIterator<U> {
    return new LazyIterator<U>(function* () {
      yield* iterable
    })
  }

  static range(start: number, end: number, step = 1): LazyIterator<number> {
    if (step === 0) throw new RangeError('step cannot be zero')

    return new LazyIterator<number>(function* () {
      if (step > 0) {
        for (let i = start; i < end; i += step) yield i
      } else {
        for (let i = start; i > end; i += step) yield i
      }
    })
  }

  static repeat<U>(value: U, count?: number): LazyIterator<U> {
    return new LazyIterator<U>(function* () {
      if (count === undefined) while (true) yield value
      else for (let i = 0; i < count; i++) yield value
    })
  }
}
