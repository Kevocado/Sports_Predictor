import { describe, expect, it } from "vitest";
import { sortByConfidence } from "./confidenceSort";
import type { GamePrediction, GameSummary } from "../types";

function game(id: string): GameSummary {
  return { game_id: id, season: 2026, week: 1, gameday: "2026-09-06", home_team: "AAA", away_team: "BBB", home_score: null, away_score: null };
}
function prediction(homeWin: number, awayWin: number): GamePrediction {
  return { home_win_prob: homeWin, away_win_prob: awayWin, home_cover_prob: 0.5, away_cover_prob: 0.5, over_prob: null, under_prob: null };
}

describe("sortByConfidence", () => {
  it("sorts games by max(home_win_prob, away_win_prob) descending", () => {
    const games = [game("low"), game("high"), game("mid")];
    const predictions = { low: prediction(0.55, 0.45), high: prediction(0.2, 0.9), mid: prediction(0.7, 0.3) };
    expect(sortByConfidence(games, predictions).map(g => g.game_id)).toEqual(["high", "mid", "low"]);
  });
  it("treats a game with no prediction yet as least confident", () => {
    const games = [game("no-pred"), game("has-pred")];
    const predictions = { "has-pred": prediction(0.6, 0.4) };
    expect(sortByConfidence(games, predictions).map(g => g.game_id)).toEqual(["has-pred", "no-pred"]);
  });
});
