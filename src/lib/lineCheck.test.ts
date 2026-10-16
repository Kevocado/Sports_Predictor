import { describe, expect, it } from "vitest";
import type { PlayerPropPrediction } from "../types";
import { checkLine, lineOptions, marketLadderFor, pOverFromQuantiles, QUANTILE_LEVELS, type MarketLine } from "./lineCheck";

// values 100..(100+300q): the quantile of level q is 100 + 300q, so P(over line) = 1 - (line-100)/300 inside the range
const lin = QUANTILE_LEVELS.map((q) => Math.round((100 + 300 * q) * 10) / 10);
const player = (extra: Partial<PlayerPropPrediction> = {}): PlayerPropPrediction => ({
  player_id: "p", player_name: "Sam Darnold", recent_team: "SEA", position: "QB", anytime_td_prob: 0.1,
  line_check: { yardage: { passing_yards: lin } }, ...extra,
});

describe("pOverFromQuantiles (same rule as the backend)", () => {
  it("interpolates linearly between fitted levels", () => {
    expect(pOverFromQuantiles(lin, 250)).toBeCloseTo(0.5, 2);          // median
    expect(pOverFromQuantiles(lin, 190)).toBeCloseTo(0.7, 2);          // q0.30
  });
  it("clamps like the backend: below the lowest level is 0.98, above the highest is 0.02", () => {
    expect(pOverFromQuantiles(lin, 10)).toBe(0.98);
    expect(pOverFromQuantiles(lin, 900)).toBe(0.02);
  });
  it("repairs crossing quantiles instead of inverting the answer", () => {
    const crossed = [...lin]; crossed[10] = 50;                          // q0.6 below q0.5
    const p = pOverFromQuantiles(crossed, 260);
    expect(p).toBeGreaterThan(0.02); expect(p).toBeLessThanOrEqual(0.98);
  });
});

describe("checkLine", () => {
  it("answers over and under for a yardage line, summing to 1", () => {
    const a = checkLine(player(), "passing_yards", 250);
    expect(a.status === "ok" && a.pOver + a.pUnder).toBeCloseTo(1, 10);
  });
  it("flags answers pinned at the clamp so the page can say 'at least'/'at most'", () => {
    expect(checkLine(player(), "passing_yards", 10)).toMatchObject({ status: "ok", edge: "high" });
  });
  it("receptions use the shipped table and need a half-point line", () => {
    const p = player({ position: "WR", line_check: { counts: { receptions: { "3.5": 0.62, "4.5": 0.41 } } } });
    expect(checkLine(p, "receptions", 3.5)).toMatchObject({ status: "ok", pOver: 0.62 });
    expect(checkLine(p, "receptions", 4)).toEqual({ status: "need-half-point" });
    expect(checkLine(p, "receptions", 9.5).status).toBe("not-priced");
  });
  it("rejects nonsense", () => {
    expect(checkLine(player(), "passing_yards", NaN)).toEqual({ status: "invalid" });
    expect(checkLine(player(), "receiving_yards", 40)).toEqual({ status: "invalid" });
  });
});

describe("lineOptions", () => {
  it("lists only the stats this player has a distribution for", () => {
    expect(lineOptions(player()).map((o) => o.market)).toEqual(["passing_yards"]);
    expect(lineOptions(player({ line_check: {} }))).toEqual([]);
    expect(lineOptions(player({ line_check: { yardage: { passing_yards: [1, 2] } } }))).toEqual([]);   // wrong length is ignored
  });
});


describe("sanity guard: a distribution that disagrees with the projection is not offered", () => {
  it("hides a stat whose projection falls outside the distribution's 10th-90th band", () => {
    const bad = player({ position: "WR", receiving_yards: 86.9, line_check: { yardage: { receiving_yards: lin.map((v) => v * 0.1) } } });   // q90 ~ 37 vs 86.9
    expect(lineOptions(bad)).toEqual([]);
    expect(checkLine(bad, "receiving_yards", 40).status).toBe("not-priced");
  });
  it("keeps a right-skewed stat whose MEAN projection is far above its median but inside the band", () => {
    const skew = [0, 0, 0, 0, 0.5, 1, 1.5, 2, 2, 2.1, 3, 5, 9, 30, 40, 44, 48, 55, 70];       // median 2.1, q90 30
    const rb = player({ position: "RB", rushing_yards: 14, line_check: { yardage: { rushing_yards: skew } } });
    expect(lineOptions(rb).map((o) => o.market)).toEqual(["rushing_yards"]);
  });
  it("keeps a stat whose projection is inside the band, and one with no projection to compare against", () => {
    expect(lineOptions(player({ passing_yards: 250 })).map((o) => o.market)).toEqual(["passing_yards"]);
    expect(lineOptions(player()).map((o) => o.market)).toEqual(["passing_yards"]);
  });
});
