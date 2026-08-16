import { describe, expect, it } from "vitest";
import { MID1 } from "./mid1";

describe("mid1", () => {
  it("reaches the leaf through four hops", () => {
    expect(MID1).toContain("leaf");
  });
});
