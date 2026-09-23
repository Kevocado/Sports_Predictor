import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PlayersPage } from "./PlayersPage";
import type { PlayerPropPrediction, SportApi } from "../types";

function prop(id: string, position: string): PlayerPropPrediction {
  return { player_id: id, player_name: id, recent_team: "KC", position, anytime_td_prob: 0.3 };
}

const playerProps = vi.fn().mockResolvedValue([prop("a", "QB")]);
const currentWeek = vi.fn().mockResolvedValue({ season: 2026, week: 7 });
const api: SportApi = {
  games: vi.fn(), gamePrediction: vi.fn(), playerProps, trackRecord: vi.fn(),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  currentWeek, standings: vi.fn(), powerRankings: vi.fn(),
  predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
};

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("PlayersPage", () => {
  it("fetches props for the sport's actual current week, not a hardcoded season/week", async () => {
    render(<PlayersPage />);

    await waitFor(() => expect(playerProps).toHaveBeenCalledWith(2026, 7));
    expect(await screen.findByText("Week 7 Player Predictions")).toBeInTheDocument();
  });
});
