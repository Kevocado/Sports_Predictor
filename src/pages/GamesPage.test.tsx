import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  beforeEach(() => { vi.clearAllMocks(); });
  // Restore default behaviour even when a test fails midway, so one failure
  // can't cascade into the next test's mocks.
  afterEach(() => {
    games.mockImplementation(async (_s: number, w: number) => (w === 7 ? [g1, g2] : []));
    predictionsBatch.mockImplementation(async (_s: number, w: number) => (w === 7 ? { g1: pred1 } : {}));
    gamePrediction.mockImplementation(async () => pred2);
    currentWeek.mockImplementation(async () => ({ season: 2026, week: 7 }));
  });

  it("loads predictions via the batch endpoint, with per-game fallback for missing ids", async () => {
    render(<GamesPage />);
    await waitFor(() => expect(predictionsBatch).toHaveBeenCalledWith(2026, 7));
    await waitFor(() => expect(gamePrediction).toHaveBeenCalledWith(2026, 7, "g2"));
    expect(gamePrediction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByText(/% confident/)).toHaveLength(2));
  });

  it("shows a readable error with Try again when games fail, and retries on click", async () => {
    // Persistent until the retry: the page loads week 1 and then jumps to the
    // current week, so a one-shot rejection could land on either load.
    games.mockRejectedValue(new Error("502 Bad Gateway"));
    render(<GamesPage />);
    await waitFor(() => expect(games).toHaveBeenCalledWith(2026, 7));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load this week's games.");
    expect(alert).not.toHaveTextContent("502");
    games.mockImplementation(async (_s: number, w: number) => (w === 7 ? [g1, g2] : []));
    const callsBefore = games.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(games.mock.calls.length).toBe(callsBefore + 1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("keeps the schedule and says picks are unavailable when every prediction call fails", async () => {
    // Persistent (not Once): the page first loads week 1, then jumps to the
    // current week, and both loads call the batch endpoint.
    predictionsBatch.mockRejectedValue(new Error("down"));
    gamePrediction.mockRejectedValue(new Error("down"));
    render(<GamesPage />);
    expect(await screen.findByText("Picks for this week couldn't load. The schedule is below.")).toBeInTheDocument();
    expect(screen.getAllByText("No pick yet")).toHaveLength(2);
    expect(screen.getAllByText("Chiefs").length).toBeGreaterThan(0);
  });

  it("says when it could not find the current week, and finds it on Try again", async () => {
    currentWeek.mockRejectedValueOnce(new Error("down"));
    render(<GamesPage />);
    const notice = await screen.findByText("Couldn't find the current week, so this shows week 1.");
    fireEvent.click(within(notice.parentElement as HTMLElement).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(currentWeek).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Couldn't find the current week/)).not.toBeInTheDocument());
    expect(await screen.findByText(/Week 7/i)).toBeInTheDocument();
  });

  it("drops the week-1 notice once the visitor moves to another week", async () => {
    currentWeek.mockRejectedValueOnce(new Error("down"));
    render(<GamesPage />);
    await screen.findByText(/Couldn't find the current week/);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(screen.queryByText(/Couldn't find the current week/)).not.toBeInTheDocument());
  });
});
