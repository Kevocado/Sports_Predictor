/**
 * `*.tsbuildinfo` is incremental compiler state, and it was tracked.
 *
 * Two failures came of it. First, the committed copy goes stale and reads as
 * authoritative: `tsconfig.app.tsbuildinfo` listed 28 root files, 7 of which had
 * been deleted or renamed (components/gamecard.tsx, components/gamecard.test.tsx,
 * components/sporttoggle.tsx, components/sporttoggle.test.tsx,
 * components/probabilitybar.tsx, components/confidencebadge.tsx,
 * lib/groupgamesbydateandconference.ts). A file claiming to enumerate the
 * project, missing a quarter of it, is worse than no file. Second, it churns:
 * every commit touching a source file rewrites it, so the diff of a real change
 * carries a generated blob.
 *
 * `tsc -b` writes these next to the tsconfig that owns them, and `npm run build`
 * regenerates both, so nothing is lost by not committing them.
 *
 * Asserted against git rather than the filesystem on purpose: the defect was
 * that git tracked them, and a filesystem check would pass while they were still
 * committed -- the untracked files exist in every developer's tree.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

const gitignore = (): string => readFileSync(resolve(REPO, ".gitignore"), "utf8");

/** Tracked paths, so the check is about the index rather than the working tree. */
const tracked = (): string[] =>
  git("ls-files", "-z")
    .split("\0")
    .filter((p) => p !== "");

describe("tsc incremental build state", () => {
  it("is not tracked", () => {
    const committed = tracked().filter((p) => p.endsWith(".tsbuildinfo"));
    expect(
      committed,
      "tracked build state is committed again: it goes stale and reads as the current project " +
        "layout. `git rm --cached` the file and add `*.tsbuildinfo` to .gitignore in the same commit.",
    ).toEqual([]);
  });

  it("is gitignored, so it cannot be re-added by accident", () => {
    // Checked as a pattern rather than as "the file is ignored", because a path
    // that is already untracked is reported ignored whether or not any rule
    // covers it -- `git check-ignore` would answer from the index exclusion.
    const rules = gitignore()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    expect(rules, ".gitignore has no rule that would keep *.tsbuildinfo out").toContain("*.tsbuildinfo");
  });

  it("keeps the source tree the build actually reads tracked", () => {
    // The untracking must not take anything real with it. `tsc -b` needs these
    // inputs to exist; if a future cleanup removes one from the index the build
    // breaks in CI with an error that does not mention .gitignore.
    for (const required of ["tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts"]) {
      expect(tracked(), `${required} is no longer tracked`).toContain(required);
    }
    expect(tracked().filter((p) => p.startsWith("src/")).length).toBeGreaterThan(40);
  });
});
