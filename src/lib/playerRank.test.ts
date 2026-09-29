/**
 * `keyYardage`'s comment claimed the model projects "the yardage market that
 * matches the player's own position", citing `POSITION_MARKETS`. The symbol says
 * the opposite: NFL/CFB `models/player_props.py::POSITION_MARKETS` is a
 * `dict[str, list[str]]` whose own comment reads "Each position can now have
 * multiple markets (e.g. RB gets both rushing_yards and carries)", and
 * `predict_props` loops `for market in POSITION_MARKETS.get(position, [])`.
 * The cited name in the old comment was also wrong -- `POSITION_YARDAGE_MARKET`,
 * singular, does not exist in either repo.
 *
 * So the claim was false, but the *code* is not wrong. Among the three yardage
 * fields a position currently gets at most one, and `keyYardage`'s behaviour is
 * only correct because of that coincidence. A comment fix cannot be caught by a
 * behavioural test, and an unasserted comment is how this one came back in the
 * first place (#9 fixed the identical false claim in `GameDetailModal.tsx` and
 * noted this file was still wrong), so the claim itself is pinned here by
 * reading the comment, the way `deployWorkflow.test.ts` pins the deploy workflow.
 *
 * The behavioural half pins what the corrected comment asserts, so the text
 * cannot drift from the code it describes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keyYardage } from "./playerRank";
import type { PlayerPropPrediction } from "../types";

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "playerRank.ts");

/** The comment block immediately above `export function keyYardage`. */
function keyYardageComment(): string {
  const lines = readFileSync(SOURCE_PATH, "utf8").split("\n");
  const fn = lines.findIndex((l) => l.startsWith("export function keyYardage"));
  expect(fn, "keyYardage is not defined in playerRank.ts, so this file pins the wrong thing").toBeGreaterThan(0);
  const block: string[] = [];
  for (let i = fn - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === "") break;
    block.unshift(line);
    if (!line.trimStart().startsWith("//")) break;
  }
  expect(block.length, "keyYardage has no doc comment").toBeGreaterThan(1);
  return block.join("\n");
}

const prop = (fields: Partial<PlayerPropPrediction>): PlayerPropPrediction =>
  ({ player_id: "p", player_name: "p", recent_team: "BAL", position: "RB", anytime_td_prob: 0.1, ...fields }) as PlayerPropPrediction;

describe("keyYardage's comment does not contradict POSITION_MARKETS", () => {
  it("cites the symbol that exists, by its real name", () => {
    const comment = keyYardageComment();
    // The old comment cited `POSITION_YARDAGE_MARKET`. That identifier is in
    // neither NFL nor CFB -- `grep -rn POSITION_YARDAGE_MARKET` over both
    // `models/player_props.py` files returns nothing.
    expect(comment).not.toMatch(/POSITION_YARDAGE_MARKET/);
    expect(comment).toMatch(/POSITION_MARKETS/);
  });

  it("does not claim a position gets a single market", () => {
    const comment = keyYardageComment();
    // Any phrasing of "one market per position" is false, because RB is given
    // `[rushing_yards, carries]` and WR/TE `[receiving_yards, receptions]`.
    expect(comment).not.toMatch(/\bexactly one\b/i);
    expect(comment).not.toMatch(/\bonly (?:ever )?(?:has|have|gets|predicts|projects)\b/i);
    expect(comment).not.toMatch(/\bONE of these\b/i);
  });

  it("states the reason the code is safe, which is the yardage subset, not the market count", () => {
    const comment = keyYardageComment();
    expect(comment).toMatch(/multiple markets/i);
    // carries/receptions are the second market for most positions; a reader who
    // does not know that will re-derive the same false claim.
    expect(comment).toMatch(/carries/);
    expect(comment).toMatch(/receptions/);
    // The narrower invariant that is actually true today.
    expect(comment).toMatch(/at most one/i);
    expect(comment).toMatch(/not (?:a )?guarantee|nothing enforces/i);
  });
});

describe("keyYardage behaves the way the corrected comment describes", () => {
  it("reads the one yardage field a position currently gets", () => {
    expect(keyYardage(prop({ position: "QB", passing_yards: 280 }))).toBe(280);
    expect(keyYardage(prop({ position: "RB", rushing_yards: 90 }))).toBe(90);
    expect(keyYardage(prop({ position: "WR", receiving_yards: 110 }))).toBe(110);
    expect(keyYardage(prop({ position: "TE", receiving_yards: 60 }))).toBe(60);
  });

  it("ignores non-yardage markets, which is the whole point of the claim", () => {
    // RB's real market list is [rushing_yards, carries] and a WR/TE prop is
    // populated with receptions too. keyYardage must not treat those as yardage.
    expect(keyYardage(prop({ position: "RB", rushing_yards: 90, carries: 21 }))).toBe(90);
    expect(keyYardage(prop({ position: "WR", receiving_yards: 110, receptions: 7 }))).toBe(110);
    // A prop whose only markets are non-yardage -- an RB priced for carries but
    // not rushing -- has no yardage figure, and reports 0 rather than the carry
    // count or NaN.
    expect(keyYardage(prop({ position: "RB", carries: 21 }))).toBe(0);
    expect(keyYardage(prop({ position: "K" }))).toBe(0);
  });

  it("returns the first yardage field when a prop somehow has two, as the comment warns", () => {
    // The comment states this is a hazard rather than an invariant: nothing in
    // POSITION_MARKETS forbids a second yardage market, and if one appears this
    // silently drops it. Pinned so that changing it is a deliberate edit to this
    // comment too, not a silent behaviour change.
    const twoYardage = prop({ position: "QB", passing_yards: 280, rushing_yards: 40 });
    expect(keyYardage(twoYardage)).toBe(280);
    expect(keyYardage(twoYardage)).not.toBe(320);
  });

  it("treats a zero as a real projection, not as missing", () => {
    // `??` not `||`: a projected 0 must not fall through to a later field. The
    // chain is in MARKET order, so the fall-through case is a zero in an earlier
    // field with a real number in a later one.
    expect(keyYardage(prop({ position: "QB", passing_yards: 0, rushing_yards: 40 }))).toBe(0);
    expect(keyYardage(prop({ position: "WR", receiving_yards: 0 }))).toBe(0);
  });

  it("picks the field by declaration order, not by the position's market list", () => {
    // keyYardage never reads `prop.position`. It walks passing -> rushing ->
    // receiving and takes the first that is not null. Those two orderings agree
    // only because POSITION_MARKETS happens to line them up today (QB passing,
    // RB rushing, WR/TE receiving); nothing couples them. A WR projected for
    // rushing_yards would be labelled "Rec yds" by keyStatLabel and valued from
    // rushing_yards here. Reported, not fixed -- it is a behaviour question, not
    // a documentation one.
    expect(keyYardage(prop({ position: "WR", rushing_yards: 12, receiving_yards: 110 }))).toBe(12);
  });
});
