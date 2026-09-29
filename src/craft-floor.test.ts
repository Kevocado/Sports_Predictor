/**
 * The craft floor, enforced in this site rather than assumed in it.
 *
 * Two rules, both of which have been broken here at least once, and both of
 * which broke *quietly* — nothing failed, the pages just looked slightly off:
 *
 * 1. **No text under 12px.** The hub asserts this for itself in
 *    `hub.test.mjs` (`font-size >= 0.75rem`), and PL, F1 and NBA carry the
 *    same standard. This site did not, and had six occurrences across two
 *    files. A floor that exists as a test in one repo and a habit in another
 *    is not a floor.
 *
 * 2. **The family faces come from `predictor-ui`, not from a local
 *    `@import`.** Every sibling site does exactly:
 *
 *        @import "./predictor-ui/fonts.css";
 *        --font-sans: var(--font-pr-body);
 *
 *    A local commit replaced that with a hand-written Google Fonts import
 *    naming Inter, which is how NFL and CFB ended up rendering in a different
 *    body face from the other three sports. `predictor-ui/fonts.css` is
 *    already vendored here and the sync test already passes, so nothing was
 *    missing — the site simply stopped using what it had. This is the check
 *    that would have caught it.
 *
 * Both skip `*.test.*` and the vendored `predictor-ui/` directory: the tests
 * are allowed to mention the forbidden strings, and the vendored copy is owned
 * by predictor-hub and arrives by `scripts/sync-ui.mjs`, so a local edit there
 * would be reverted by the next sync rather than fixed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This file lives IN src/, so src/ is HERE. The first version resolved `..` and
// swept the repo root, which read a non-existent ./index.css and collected the
// whole frontend/ tree — so it failed on ENOENT rather than on anything real.
const SRC = HERE;
const VENDORED = join(SRC, "predictor-ui");
const MIN_PX = 12;

/** Every .tsx under src/ that this repo actually owns and renders. */
function siteFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return full === VENDORED ? [] : siteFiles(full);
    if (!name.endsWith(".tsx") || name.includes(".test.")) return [];
    return [full];
  });
}

const files = siteFiles();

describe("the craft floor", () => {
  it("finds the files it is guarding", () => {
    // Without this, an empty sweep would pass every assertion below vacuously,
    // and a renamed or relocated component would silently stop being checked.
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files)("%s renders no text under 12px", (file) => {
    const rel = relative(SRC, file);
    const small = [...readFileSync(file, "utf8").matchAll(/text-\[(\d+)px\]/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < MIN_PX);
    expect(
      [...new Set(small)],
      `${rel} sets ${[...new Set(small)].join("px, ")}px text. The floor is ${MIN_PX}px, ` +
        `asserted for the hub in hub.test.mjs and for PL, F1 and NBA. Small caps at 10-11px ` +
        `is where the label stops being readable on a phone in daylight, which is the ` +
        `case this whole product is for.`,
    ).toEqual([]);
  });
});

describe("the family faces", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");

  it("takes its body face from predictor-ui, not a hand-written import", () => {
    expect(css).toMatch(/@import\s+["']\.\/predictor-ui\/fonts\.css["']/);
    expect(css).toMatch(/--font-sans:\s*var\(--font-pr-body\)/);
  });

  it("names no font of its own", () => {
    // A local @import of Google Fonts is how this site came to render in a
    // different body face from the other three, so the ban is on the import
    // rather than on any particular family name: the family could change
    // tomorrow and this test should not have to be edited to allow it.
    const localFontImports = [...css.matchAll(/@import\s+url\(([^)]*fonts[^)]*)\)/g)].map((m) => m[1]);
    expect(
      localFontImports,
      `index.css loads its own webfonts (${localFontImports.join(", ")}). Fonts belong to ` +
        `predictor-ui/fonts.css so all five sports render in the same faces; a site that ` +
        `picks its own drifts from the family silently and nothing catches it.`,
    ).toEqual([]);
  });

  it("has the vendored fonts it claims to use", () => {
    // The sync test proves the vendored copy matches the hub. This proves the
    // file the @import above names is actually there — an import of a file
    // that is not vendored fails silently to the fallback stack, and the site
    // looks fine while rendering in Arial.
    expect(statSync(join(VENDORED, "fonts.css")).isFile()).toBe(true);
  });
});
