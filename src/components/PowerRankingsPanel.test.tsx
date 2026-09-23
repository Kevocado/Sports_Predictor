import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PowerRankingsPanel } from "./PowerRankingsPanel";
import type { SportApi, TeamRanking } from "../types";

function mockApi(rankings: TeamRanking[], powerRankingsImpl?: () => Promise<never>): SportApi {
  return {
    games: vi.fn(), gamePrediction: vi.fn(), playerProps: vi.fn(), trackRecord: vi.fn(),
    retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
    currentWeek: vi.fn(), standings: vi.fn(),
    powerRankings: powerRankingsImpl
      ? vi.fn().mockImplementation(powerRankingsImpl)
      : vi.fn().mockResolvedValue({ season: 2026, rankings }),
    predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
  };
}

const rows: TeamRanking[] = [
  { team: "KC", rating: 1612.4, rank: 1, wins: 8, losses: 1, ties: 0, conference: "AFC", division: "AFC West" },
  { team: "BUF", rating: 1590.1, rank: 2, wins: 7, losses: 2, ties: 0, conference: "AFC", division: "AFC East" },
];

describe("PowerRankingsPanel", () => {
  it("requests the season's rankings and renders rank, team, rating and record", async () => {
    const api = mockApi(rows);
    render(<PowerRankingsPanel api={api} season={2026} />);

    expect(api.powerRankings).toHaveBeenCalledWith(2026);
    await waitFor(() => expect(screen.getByText("KC")).toBeInTheDocument());
    expect(screen.getByText("BUF")).toBeInTheDocument();
    expect(screen.getByText("1612")).toBeInTheDocument();
    expect(screen.getByText("8-1")).toBeInTheDocument();
    expect(screen.getByText("AFC West")).toBeInTheDocument();
  });

  it("falls back to conference when division is absent (CFB shape)", async () => {
    const api = mockApi([
      { team: "Georgia", rating: 1700.2, rank: 1, wins: 9, losses: 0, ties: 0, conference: "SEC" },
    ]);
    render(<PowerRankingsPanel api={api} season={2026} />);

    await waitFor(() => expect(screen.getByText("Georgia")).toBeInTheDocument());
    expect(screen.getByText("SEC")).toBeInTheDocument();
  });

  it("renders ties in the record when present", async () => {
    const api = mockApi([
      { team: "TIE", rating: 1500, rank: 3, wins: 4, losses: 4, ties: 1, conference: "X" },
    ]);
    render(<PowerRankingsPanel api={api} season={2026} />);

    await waitFor(() => expect(screen.getByText("4-4-1")).toBeInTheDocument());
  });

  it("shows an error when the fetch fails", async () => {
    const api = mockApi([], () => Promise.reject(new Error("boom")));
    render(<PowerRankingsPanel api={api} season={2026} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
  });
});
