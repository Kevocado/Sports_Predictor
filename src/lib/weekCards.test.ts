import { describe, expect, it } from "vitest";
import { toCardModel, weekTally } from "./weekCards";
import type { GamePrediction, GameSummary, WeekPrediction } from "../types";

const TZ = "America/Chicago";
const upcoming: GameSummary = {
  game_id: "2026_04_KC_BAL", season: 2026, week: 4, gameday: "2026-10-04T17:00:00Z",
  home_team: "BAL", away_team: "KC", home_score: null, away_score: null, spread_line: 2.5, total_line: 46.5,
  temp: 72, wind: 8, home_rest: 7, away_rest: 6, div_game: false, roof: "outdoors",
};
const final: GameSummary = { ...upcoming, game_id: "2026_04_PIT_CLE", home_team: "CLE", away_team: "PIT", home_score: 20, away_score: 17 };
const pred: GamePrediction = { home_win_prob: 0.62, away_win_prob: 0.38, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };
const resolved = (hit: boolean): WeekPrediction => ({
  game_id: final.game_id, status: "resolved", home_win_prob: 0.55, away_win_prob: 0.45,
  verdict: { game_id: final.game_id, resolved: true, moneyline: { hit, predicted: "CLE" }, ats: null, totals: null },
});

describe("toCardModel", () => {
  it("puts away on the left, names the favourite as the pick, and orders the bar away then home", () => {
    const m = toCardModel(upcoming, pred, undefined, false, TZ);
    expect([m.left.code, m.right.code]).toEqual(["KC", "BAL"]);
    expect(m.pick).toEqual({ label: "BAL", prob: 0.62 });
    expect(m.bar?.map((s) => s.label)).toEqual(["KC", "BAL"]);
    expect(m.status).toBeUndefined();
  });
  it("marks exactly the next game 'Next up' and shows its local kickoff", () => {
    const m = toCardModel(upcoming, pred, undefined, true, TZ);
    expect(m.status).toBe("next");
    expect(m.when).toBe("Sun 4 Oct · 12:00 PM CDT");
    expect(m.centre).toBe("12:00 PM");
  });
  it("writes the spread with the favoured home team, a positive nflverse line meaning home favoured", () => {
    expect(toCardModel(upcoming, pred, undefined, false, TZ).meta).toMatch(/^BAL −2\.5 · Total 46\.5/);
    expect(toCardModel({ ...upcoming, spread_line: -3 }, pred, undefined, false, TZ).meta).toMatch(/^BAL \+3 · /);
  });
  it("says rest and weather in words instead of (a/h)", () => {
    const meta = toCardModel({ ...upcoming, div_game: true }, pred, undefined, false, TZ).meta!;
    expect(meta).toContain("72°F · 8 mph wind");
    expect(meta).toContain("Rest 6 v 7 days");
    expect(meta).toContain("Divisional");
    expect(meta).not.toContain("(a/h)");
  });
  it("judges a final game on its pre-kickoff verdict", () => {
    expect(toCardModel(final, pred, resolved(true), false, TZ).status).toBe("called");
    expect(toCardModel(final, pred, resolved(false), false, TZ).status).toBe("missed");
    const m = toCardModel(final, pred, resolved(true), false, TZ);
    expect(m.centre).toBe("17–20");
    expect(m.when).toBe("Sun 4 Oct · Final");
  });
  it("never calls an untracked final a miss", () => {
    const untracked: WeekPrediction = { game_id: final.game_id, status: "untracked", verdict: null };
    const m = toCardModel(final, null, untracked, false, TZ);
    expect(m.status).toBe("nopick");
    expect(m.pick).toBeUndefined();
  });
  it("handles the CFB shape (no spread, no weather)", () => {
    const cfb: GameSummary = { game_id: "c1", season: 2026, week: 6, gameday: "2026-10-03T16:00:00Z", home_team: "Louisiana-Monroe", away_team: "Ohio State", home_score: null, away_score: null };
    const m = toCardModel(cfb, pred, undefined, false, TZ);
    expect(m.meta).toBeUndefined();
    expect(m.left.name).toBe("Ohio State");
  });
});

describe("weekTally", () => {
  it("counts only resolved pre-kickoff picks", () => {
    const pending: WeekPrediction = { game_id: "p", status: "pending", verdict: null };
    const untracked: WeekPrediction = { game_id: "u", status: "untracked", verdict: null };
    expect(weekTally([resolved(true), resolved(false), resolved(true), pending, untracked])).toEqual({ hits: 2, settled: 3, rebuilt: 0 });
    expect(weekTally([])).toEqual({ hits: 0, settled: 0, rebuilt: 0 });
  });
});
