import { describe, expect, it } from "vitest";
import { add } from "./util";

describe("util", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
