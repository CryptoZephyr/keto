import { describe, expect, it } from "vitest";
import { encodeMSPathsQuery, escapeCypherString } from "../src/query-encode.js";
import { stableKey } from "../src/identity.js";

describe("query-encode", () => {
  it("emits a literal-list algo.MSpaths query for fixture stable keys", () => {
    const sourceValues = [
      stableKey("keto-fixture", "src/auth.ts", "file"),
      stableKey("keto-fixture", "src/user.ts", "file"),
    ];
    const encoded = encodeMSPathsQuery({ sourceValues });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.query).toContain("CALL algo.MSpaths({");
    expect(encoded.query).toContain("sourceValues: ['keto-fixture:src/auth.ts:file', 'keto-fixture:src/user.ts:file']");
    expect(encoded.query).toContain("relTypes: ['DEPENDS_ON']");
    expect(encoded.query).toContain("relDirection: 'incoming'");
    expect(encoded.query).not.toMatch(/IMPORTS\s*\|\s*CALLS/);
    expect(encoded.query).not.toContain("MATCH path =");
  });

  it("escapes quotes and backslashes and rejects control characters", () => {
    const escaped = escapeCypherString("repo:src/o'brien.ts:file");
    expect(escaped.ok).toBe(true);
    if (escaped.ok) expect(escaped.query).toBe("repo:src/o\\'brien.ts:file");
    const slash = escapeCypherString("a\\b");
    expect(slash.ok).toBe(true);
    if (slash.ok) expect(slash.query).toBe("a\\\\b");
    expect(escapeCypherString("bad\nkey").ok).toBe(false);
    expect(encodeMSPathsQuery({ sourceValues: ["ok\u0000"] }).ok).toBe(false);
  });

  it("rejects mixed relationship types and oversized source lists", () => {
    const mixed = encodeMSPathsQuery({
      sourceValues: ["keto-fixture:src/util.ts:file"],
      relTypes: ["IMPORTS|CALLS"],
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.error).toMatch(/mixed relationship type/);
    const tooMany = encodeMSPathsQuery({
      sourceValues: Array.from({ length: 65 }, (_, i) => `k:${i}:file`),
    });
    expect(tooMany.ok).toBe(false);
  });
});
