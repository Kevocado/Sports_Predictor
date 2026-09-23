import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StandingsPage } from "./StandingsPage";
import type { SportApi } from "../types";

const standings = vi.fn(async () => ([
  {
    team: "KC", conference: "AFC", division: "AFC West", played: 9,
    wins: 8, losses: 1, ties: 0, point_diff: 87,
    projected_wins: 12.4, projected_losses: 4.6, projected_point_diff: 120,
    current_division_rank: 1, projected_division_rank: 1, division_rank_delta: 0,
  },
]));
const api = {
  currentWeek: vi.fn(async () => ({ season: 2026, week: 7 })),
  standings,
  games: vi.fn(), gamePrediction: vi.fn(), playerProps: vi.fn(), trackRecord: vi.fn(),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  powerRankings: vi.fn(), predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("StandingsPage", () => {
  it("renders the team logo next to each team name", async () => {
    render(<StandingsPage />);
    expect(await screen.findByAltText("KC logo")).toBeInTheDocument();
    expect(await screen.findByText("AFC West")).toBeInTheDocument();
  });
});
