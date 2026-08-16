import type { Session } from "neo4j-driver";
import { describe, expect, it, vi } from "vitest";
import { boltRun } from "../src/hydra/bolt.js";

describe("Bolt execution limits", () => {
  it("sends the configured transaction timeout with every query", async () => {
    const run = vi.fn().mockResolvedValue({
      records: [],
    });
    const session = {
      run,
      lastBookmarks: () => [],
    } as unknown as Session;

    await boltRun(session, "RETURN 1", {}, 1_234);

    expect(run).toHaveBeenCalledWith(
      "RETURN 1",
      {},
      expect.objectContaining({ timeout: 1_234 }),
    );
  });

  it("rejects a missing or non-positive execution timeout", async () => {
    const session = {
      run: vi.fn(),
      lastBookmarks: () => [],
    } as unknown as Session;

    await expect(boltRun(session, "RETURN 1", {}, 0)).rejects.toThrow(
      /timeout/i,
    );
  });
});
