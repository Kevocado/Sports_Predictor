import { describe, expect, it } from "vitest";
import type { PlayerPropPrediction } from "../types";
import { calibrate, CALIBRATION_KNOTS, checkLine, lineOptions, pOverFromQuantiles, QUANTILE_LEVELS } from "./lineCheck";

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
  it("shows the back-test-corrected probability, not the raw one", () => {
    const a = checkLine(player(), "passing_yards", 170);
    const raw = pOverFromQuantiles(lin, 170);                      // ~0.77: a softer number is shown
    expect(a.status === "ok" && a.pOver).toBeLessThan(raw);
    expect(a.status === "ok" && a.pOver).toBeCloseTo(calibrate(raw), 10);
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


describe("calibrate", () => {
  it("is monotone, stays inside [0.02, 0.98] and only softens high claims", () => {
    let prev = -1;
    for (let p = 0.02; p <= 0.98; p += 0.01) { const c = calibrate(p); expect(c).toBeGreaterThanOrEqual(prev); prev = c; expect(c).toBeGreaterThan(0.02 - 1e-9); expect(c).toBeLessThan(0.98); }
    expect(calibrate(0.9)).toBeLessThan(0.9);
    expect(CALIBRATION_KNOTS.every(([x], i, a) => i === 0 || x > a[i - 1][0])).toBe(true);
  });
  it("interpolates between knots and is flat outside them", () => {
    expect(calibrate(0.5)).toBeCloseTo(0.49, 10);
    expect(calibrate(0.52)).toBeCloseTo((0.49 + 0.504) / 2, 6);
    expect(calibrate(0.99)).toBe(0.808);
    expect(calibrate(0.0)).toBe(0.025);
  });
});
