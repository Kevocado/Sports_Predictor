import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "index.css"), "utf8");

describe("index.css", () => {
  it("loads the family fonts first and the tokens last", () => {
    const order = ["./predictor-ui/fonts.css", "tailwindcss", "./predictor-ui/tokens.css"].map((s) => css.indexOf(`@import "${s}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("drops Inter and the radial glow", () => {
    expect(css).not.toMatch(/Inter/);
    expect(css).not.toMatch(/radial-gradient/);
  });
  it("maps every legacy sp colour onto a family token", () => {
    const legacy = [...css.matchAll(/--color-sp-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(legacy.length).toBeGreaterThan(0);
    for (const value of legacy) expect(value).toMatch(/^var\(--color-pr-/);
  });
});
