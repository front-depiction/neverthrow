# Neverthrow++ — Consolidated Extension Proposal

## 0 · Purpose

Provide a **minimal‑overhead, maximally familiar** set of helpers that extend `neverthrow` while mirroring the shape, names, and semantics of proven APIs in Rust, Haskell, F#, and Scala. The goal is _ergonomic convergence_ – users should feel at home coming from any of those ecosystems.

_All additions are completely additive and backwards‑compatible._

---

## 1 · Guiding Principles

1. **Canonical naming first, alias second**  – pick the name most commonly found in the wild; add an alias only if it unlocks discoverability.
2. **Symmetry** – every sync helper (`Result`) has an async twin (`ResultAsync`) with identical semantics.
3. **Zero foot‑guns** – no helper should silently swallow errors or break type inference.
4. **Interoperability layer** – nullable ↔︎ `Result` conversion must be one‑liners.

---

## 2 · Applicative / Composition Helpers

| Helper (🎯 preferred)      | Alias (legacy) | Signature (sync)                                                                     | Inspiration        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------ | ------------------ |
| `ap`                       | `apply`        | `Result<(…args)=>R,E>.ap(r1,…rn): Result<R,E>`                                       | Haskell `<*>`      |
| `liftA2`,`liftA3`,`liftA4` | `lift2/3/4`    | `Result.liftA2(fn,r1,r2)`                                                            | Haskell `liftA₂`   |
| `sequence`                 | —              | `Result.sequence(Result<T,E>[]): Result<T[],E>`                                      | Haskell `sequence` |
| `traverse`                 | —              | `Result.traverse<T,U,E>(arr,f): Result<U[],E>`                                       | Haskell `traverse` |
| `zipWith`                  | —              | `Result.zipWith(fn,r1,r2): Result<R,E>`                                              | Haskell / Rust     |
| `parallel`                 | `all`          | `Result.parallel(r1,…rn): Result<tuple,R>`<br>`ResultAsync.parallel(…): ResultAsync` | `Promise.all`      |

### 2.1 · Race helpers

- `race` – first **Ok** wins; if all fail the _last_ `Err` is returned.

---

## 3 · Nullable ⇄ Result Bridge

| Helper 🎯                      | Alias                 | From                     | To               | Notes                                       |
| ------------------------------ | --------------------- | ------------------------ | ---------------- | ------------------------------------------- |
| `Result.fromNullable(v, err?)` | `fromOption`, `maybe` | `T \| null \| undefined` | `Result<T,E>`    | Primary gateway.                            |
| `Result.option(v)`             | —                     | `T \| null \| undefined` | `Result<T,void>` | Lightweight when no error payload required. |
| `.toNullable()`                | `unwrapOrNull`        | `Result<T,E>`            | `T \| null`      |                                             |
| `.toUndefined()`               | `unwrapOrUndefined`   | `Result<T,E>`            | `T \| undefined` |                                             |

> **Deprecates** `some`, `notNull` – superseded by `fromNullable` + explicit error.

---

## 4 · Validation & Filtering

| Helper 🎯              | Was     | Behaviour                                                             |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| `.filter(pred, err?)`  | (kept)  | Returns `Err` when predicate is false. Mirrors Rust `Option::filter`. |
| `.ensure(pred, errFn)` | `guard` | Enforces invariant; name echoes Rust macro `ensure!`.                 |

---

## 5 · Exception Boundaries

| Helper 🎯                            | Alias     | Purpose                                            |
| ------------------------------------ | --------- | -------------------------------------------------- |
| `Result.try(fn)`                     | `attempt` | Wraps throwing fn, auto‑stringifies error context. |
| `Result.fromThrowable(fn, handler?)` | —         | Existing – unchanged.                              |

Same surface for `ResultAsync.try`.

---

## 6 · Resilience Primitives

- `.retry(times, delayFn?)` – linear/exponential back‑off helper.
- `.timeout(ms)` – converts slow Ok into `Err('Timeout')`.

(These augment existing composition story; syntax identical for async.)

---

## 7 · Deprecated / Alias Strategy

- **Hard deprecate** duplicate names (`some`, `notNull`).
- **Soft deprecate** legacy names for one major release:<br>`apply` → `ap`, `lift2/3/4` → `liftA*`. JSDoc `@deprecated` with redirect.

---

## 8 · Illustrative Snippets

```ts
// ✅  Multiple inputs with Applicative style
const makeFullName = (first: string) => (last: string) => `${first} ${last}`
Result.ok(makeFullName)
  .ap(Result.fromNullable(user.first, 'missing first'))
  .ap(Result.fromNullable(user.last, 'missing last'))
  .match(console.log, console.error)
```

```ts
// ✅  Bridging nullable ↔︎ Result
const email: string | null = getEmailFromLegacyApi()
const lower = Result.fromNullable(email, 'no email')
  .map((e) => e.toLowerCase())
  .toNullable() // back in null‑land
```

```ts
// ✅  Retrying an async fetch
const data = await ResultAsync.try(() => fetch(url))
  .retry(3, (attempt) => attempt ** 2 * 100) // back‑off 100,400,900 ms
  .asyncAndThen((res) => ResultAsync.try(() => res.json()))
```

---

## 9 · Open Questions

1. Should `.timeout` live under `ResultAsync` only? (sync variant of timeout is questionable.)
2. Do we expose `liftAn` up to `n=4` only, or generate variadic tuple overloads?
3. Do we keep `parallel` **and** `ap`? Both serve similar problem spaces – _composition_ vs _execution_.

Feedback welcome! Let’s iterate until this feels friction‑free.

---

## 🔍 Clarifications Raised in Review

### `filter` vs `ensure`

| Aspect         | `filter`                                                                                                   | `ensure`                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Purpose        | _Narrow_ a `Result` or `Maybe` to values that satisfy a predicate.                                         | _Validate_ a value inside `Result/Maybe` and convert validation failures into a **domain‑specific** error type. |
| Signature (TS) | `filter<ResultT, ErrT>(predicate: (val: ResultT) ⇒ boolean, errFactory: () ⇒ ErrT): Result<ResultT, ErrT>` | `ensure<ResultT, ErrT>(validator: (val: ResultT) ⇒ Result<ResultT, ErrT>): Result<ResultT, ErrT>`               |
| Error emission | _Single_ user‑supplied error produced only when predicate ⇢ `false`.                                       | Allows _rich_ validation logic that can short‑circuit with **different** errors depending on rule violated.     |
| Analogy        | Rust `Option::filter` / Scala `Option.filter`                                                              | Rust `Result::ensure` (crate: anyhow) / F# `Result.require`                                                     |
| Typical use    | Guarding simple predicates such as `x > 0` without branching.                                              | Multi‑step business rule validation where each rule may fail differently.                                       |

> **Intuition**: Use `filter` for _boolean guards_; use `ensure` when you need _contextual validation_ that may already return its own `Result`.

### `apply` vs `lift`

Both lift a N‑ary function into the "railway" world, but they target **different shapes of arguments**:

| Function | Purpose                                                                                                                    | Works With                                       | Example                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `apply`  | Sequentially _applies_ a `Result`‑wrapped function to one or more `Result` arguments. It is the classic Applicative `<*>`. | `Result<ResultFn, Err>` ⨯ `Result<A, Err>` ⨯ ... | `Result.of((a,b)=>a+b).apply(r1).apply(r2)` |
| `lift`   | _Lifts_ a **plain** N‑ary function directly so it can accept `Result`s. Saves the step of wrapping the function first.     | `(A,B)⇒C` plain → lifted so it takes Results     | `lift((a,b)=>a+b)(r1,r2)`                   |

> **Why keep both?** `lift` is syntactic sugar built on `apply`; it removes boilerplate for the common case of using an existing function. Retaining `apply` maintains parity with Rust/Haskell and preserves fine‑grained control (e.g. partial application of a validated function).

If consensus leans to _one_, vote for **`lift`** (highest ergonomics) and alias `apply` → `lift` for zero breakage.
