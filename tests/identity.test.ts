import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertNoCollisions,
  CollisionError,
  detectCollisions,
  entityId,
  hashToId,
  normalizePath,
  relationshipId,
  stableKey,
} from "../src/identity.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/monorepo/keto.fixture.json", import.meta.url), "utf8"),
) as { repository: string };

describe("identity", () => {
  it("normalizes Windows separators and dots", () => {
    expect(normalizePath("src\\\\util.ts")).toBe("src/util.ts");
    expect(normalizePath(".\\src\\user.ts")).toBe("src/user.ts");
    expect(normalizePath("src//mid1.ts")).toBe("src/mid1.ts");
  });

  it("assigns deterministic ids and versioned stable keys from fixture paths", () => {
    const repo = fixture.repository;
    const first = entityId(repo, "src/util.ts", "file");
    const second = entityId(repo, "src\\util.ts", "file");
    expect(first).toBe(second);
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(stableKey(repo, "src/util.ts", "file")).toBe("keto-fixture:src/util.ts:file");
    expect(entityId(repo, "src/util.ts", "test")).not.toBe(first);
    expect(hashToId("v1|entity|keto-fixture|src/util.ts|file")).toBe(first);
  });

  it("derives relationship ids from endpoints and kind", () => {
    const a = entityId(fixture.repository, "src/user.ts", "file");
    const b = entityId(fixture.repository, "src/auth.ts", "file");
    const id = relationshipId(a, b, "imports", "./auth");
    expect(id).toBe(relationshipId(a, b, "imports", "./auth"));
    expect(id).not.toBe(relationshipId(a, b, "imports", "./other"));
  });

  it("detects hash collisions and aborts indexing", () => {
    const collisions = detectCollisions([
      { id: 7, stable_key: "keto-fixture:src/a.ts:file" },
      { id: 7, stable_key: "keto-fixture:src/b.ts:file" },
    ]);
    expect(collisions).toEqual([
      {
        id: 7,
        stable_keys: ["keto-fixture:src/a.ts:file", "keto-fixture:src/b.ts:file"],
      },
    ]);
    expect(() =>
      assertNoCollisions([
        { id: 7, stable_key: "keto-fixture:src/a.ts:file" },
        { id: 7, stable_key: "keto-fixture:src/b.ts:file" },
      ]),
    ).toThrow(CollisionError);
  });
});
