import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GamesPage } from "./GamesPage";
import type { GamePrediction, GameSummary, SportApi } from "../types";

const g1: GameSummary = { game_id: "g1", season: 2026, week: 7, gameday: "2026-10-04T17:00:00Z", home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null };
const g2: GameSummary = { game_id: "g2", season: 2026, week: 7, gameday: "2026-10-04T20:00:00Z", home_team: "Bills", away_team: "Jets", home_score: null, away_score: null };
const pred1: GamePrediction = { home_win_prob: 0.62, away_win_prob: 0.38, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };
const pred2: GamePrediction = { home_win_prob: 0.55, away_win_prob: 0.45, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };

const games = vi.fn(async (_s: number, w: number) => (w === 7 ? [g1, g2] : []));
const predictionsBatch = vi.fn(async (_s: number, w: number) => (w === 7 ? { g1: pred1 } : {}));
const gamePrediction = vi.fn(async () => pred2);
const currentWeek = vi.fn(async () => ({ season: 2026, week: 7 }));

const api = {
  games, gamePrediction, predictionsBatch, currentWeek,
  playerProps: vi.fn(async () => []), trackRecord: vi.fn(), retrain: vi.fn(), gameVerdict: vi.fn(),
  predictionsForWeek: vi.fn(), standings: vi.fn(), powerRankings: vi.fn(),
  teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("GamesPage", () => {
  it("loads predictions via the batch endpoint, with per-game fallback for missing ids", async () => {
    render(<GamesPage />);
    await waitFor(() => expect(predictionsBatch).toHaveBeenCalledWith(2026, 7));
    await waitFor(() => expect(gamePrediction).toHaveBeenCalledWith(2026, 7, "g2"));
    expect(gamePrediction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByText(/% confident/)).toHaveLength(2));
  });
});
