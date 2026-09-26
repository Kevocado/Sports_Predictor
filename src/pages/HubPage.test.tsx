import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HubPage } from "./HubPage";
import type { SportApi } from "../types";

const currentWeek = vi.fn(async () => ({ season: 2026, week: 7 }));
const powerRankings = vi.fn(async (season: number) => ({
  season,
  rankings: [{ team: "Ravens", rating: 12.5, rank: 1, wins: 5, losses: 1, ties: 0, division: "AFC North" }],
}));
const playerProps = vi.fn(async () => []);
const hubTeams = vi.fn(async (season: number) => ({
  season,
  teams: [{
    team: "Ravens", games: 1, wins: 1, losses: 0, ties: 0, points_for_pg: 30, points_against_pg: 10,
    off_epa_play: 0.2, def_epa_play: -0.1, off_success_rate: 0.5, def_success_rate: 0.4,
    yards_per_play: 6, pass_rate: 0.5, turnover_margin: 1, streak: 1, form: ["W"], form_trend: "new",
    recent_games: [],
  }],
}));
const hubPlayers = vi.fn(async (season: number) => ({ season, players: [], leaderboards: {} }));
const standings = vi.fn(async () => []);
const trackRecord = vi.fn(async () => ({
  games: { n_resolved: 0, pct_moneyline_correct: null, pct_ats_correct: null, pct_totals_correct: null, weekly_trend: [] },
  player_props: {
    anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null },
    passing_yards: { n_resolved: 0, mean_absolute_error: null },
    rushing_yards: { n_resolved: 0, mean_absolute_error: null },
    receiving_yards: { n_resolved: 0, mean_absolute_error: null },
  },
}));

const api = {
  currentWeek, powerRankings, playerProps, standings, trackRecord, hubTeams, hubPlayers,
  games: vi.fn(async () => []), gamePrediction: vi.fn(), predictionsBatch: vi.fn(async () => ({})),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("HubPage", () => {
  it("opens on Teams, loaded for the current season", async () => {
    render(<HubPage />);
    expect(screen.getByRole("button", { name: "Teams" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Ravens")).toBeInTheDocument();
    expect(hubTeams).toHaveBeenCalledWith(2026);
  });

  it("switches to Players", async () => {
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    expect(await screen.findByText("No player stats for 2026 season yet.")).toBeInTheDocument();
    expect(hubPlayers).toHaveBeenCalledWith(2026);
  });

  it("switches to the Standings and Track record sub-tabs", async () => {
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));
    expect(await screen.findByText("No standings available yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Track record" }));
    expect(await screen.findByText("No resolved games yet — check back once this week's games are final.")).toBeInTheDocument();
  });
});
