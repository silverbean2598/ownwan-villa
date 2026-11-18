import { expect, it } from "vitest";
import { safeNext } from "./next";

it("accepts only same-site paths", () => {
  expect(safeNext("/join/abc")).toBe("/join/abc");
  for (const v of [null, undefined, "", "//evil.com", "https://evil.com", "villa"]) expect(safeNext(v)).toBe("/");
});
