# Keto known-answer fixture

Repository identity: `keto-fixture`.

| Change | Expected selected tests | Notes |
|---|---|---|
| `src/util.ts` | `src/util.test.ts` | Direct `tests` edge |
| `src/auth.ts` | `src/user.test.ts` | Two hops: test → user → auth |
| `src/leaf.ts` | `src/mid1.test.ts` | Four hops: test → mid1 → mid2 → mid3 → leaf |
| `src/util.ts` | must not select `src/isolated.test.ts` | Unaffected test |
| `src/cycle-b.ts` | `src/cycle.test.ts` | Cycle A ⇄ B |
| `src/dynamic.ts` | full suite | Dynamic `import()` coverage warning |
| `src/opaque.ts` | full suite | Non-literal `require` — missed dependency |
| `package.json` | full suite | Root configuration change |

`src/aliased.ts` imports `@lib/helper` through `tsconfig.json` paths.
