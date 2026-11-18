import { afterEach, expect, it } from "vitest";
import { now, setNow } from "./clock";

afterEach(() => setNow(null));

it("now uses the injected clock and falls back to Date.now", () => {
  setNow(() => 42);
  expect(now()).toBe(42);
  setNow(null);
  expect(Math.abs(now() - Date.now())).toBeLessThan(1000);
});
