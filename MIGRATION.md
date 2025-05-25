# Migration Guide: vX.X.X

## Breaking Change: Ok/Err Classes and `instanceof` Checks

### What Changed?

- The `Ok` and `Err` classes are no longer part of the public API.
- The `ok()` and `err()` functions, as well as `Result.ok()` and `Result.err()`, now return instances of the base `Result` class, not `Ok` or `Err`.
- All `instanceof Ok` and `instanceof Err` checks will break.

### Why?

- This change simplifies the internal implementation and improves type inference and ergonomics.
- It also makes the codebase more robust to minification and bundling, and more interoperable across package boundaries.

### How to Migrate?

- **Replace all `instanceof Ok` and `instanceof Err` checks** with the recommended API:

  ```typescript
  // Old (will break)
  if (result instanceof Ok) { ... }
  if (result instanceof Err) { ... }

  // New (supported)
  if (result.isOk()) { ... }
  if (result.isErr()) { ... }
  ```

### Other Notes

- All type narrowing should be done via `.isOk()` and `.isErr()`.
- The `Ok` and `Err` classes are no longer exported.
- If you need to check for Ok/Err in tests, use `.isOk()`/`.isErr()` and `.map()`/`.mapErr()` for assertions.
