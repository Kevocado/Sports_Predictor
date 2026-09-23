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
  currentWeek, powerRankings, playerProps, standings, trackRecord,
  games: vi.fn(async () => []), gamePrediction: vi.fn(), predictionsBatch: vi.fn(async () => ({})),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("HubPage", () => {
  it("shows the Player Hub sub-tab by default", async () => {
    render(<HubPage />);
    expect(screen.getByRole("button", { name: "Player Hub" })).toHaveClass("bg-sp-gold");
    expect(await screen.findByText("No player predictions available for this week yet.")).toBeInTheDocument();
  });

  it("loads power rankings when the Power Rankings sub-tab is selected", async () => {
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Power Rankings" }));
    expect(await screen.findByText("Ravens")).toBeInTheDocument();
    expect(powerRankings).toHaveBeenCalledWith(2026);
  });

  it("switches to the Standings and Track Record sub-tabs", async () => {
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));
    expect(await screen.findByText("No standings available yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Track Record" }));
    expect(await screen.findByText("No resolved games yet — check back once this week's games are final.")).toBeInTheDocument();
  });
});
