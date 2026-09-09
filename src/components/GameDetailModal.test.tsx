import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { filterPlayerPropsForGame, GameDetailModal } from "./GameDetailModal";
import type { GamePrediction, GameSummary, PlayerPropPrediction, SportApi } from "../types";

const game: GameSummary = { game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z", home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null };
function prop(id: string, team: string): PlayerPropPrediction { return { player_id: id, player_name: id, recent_team: team, position: "WR", anytime_td_prob: 0.3 }; }

describe("filterPlayerPropsForGame", () => {
  it("keeps only props whose recent_team matches the game's teams", () => {
    expect(filterPlayerPropsForGame([prop("a","Ravens"), prop("b","Chiefs"), prop("c","Bengals")], game).map(p=>p.player_id)).toEqual(["a","b"]);
  });
  it("returns empty list when no prop matches", () => {
    expect(filterPlayerPropsForGame([prop("a","Bengals")], game)).toEqual([]);
  });
});
describe("GameDetailModal", () => {
  it("shows only this game's player props after fetch", async () => {
    const prediction: GamePrediction = { home_win_prob: 0.6, away_win_prob: 0.4, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };
    const api: SportApi = { games: vi.fn(), gamePrediction: vi.fn().mockResolvedValue(prediction), playerProps: vi.fn().mockResolvedValue([prop("home-player","Ravens"), prop("other","Bengals")]), trackRecord: vi.fn(), retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(), currentWeek: vi.fn() };
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("home-player")).toBeInTheDocument());
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });
});
