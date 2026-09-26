import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { filterPlayerPropsForGame, GameDetailModal } from "./GameDetailModal";
import type { GamePrediction, GameSummary, GameVerdict, PlayerPropPrediction, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const game: GameSummary = { game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z", home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null };
function prop(id: string, team: string): PlayerPropPrediction { return { player_id: id, player_name: id, recent_team: team, position: "WR", anytime_td_prob: 0.3 }; }

function mockApi(overrides: Partial<SportApi> = {}): SportApi {
  return {
    games: vi.fn(),
    gamePrediction: vi.fn().mockResolvedValue({ home_win_prob: 0.6, away_win_prob: 0.4, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null } satisfies GamePrediction),
    playerProps: vi.fn().mockResolvedValue([]),
    trackRecord: vi.fn(),
    retrain: vi.fn(),
    gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn(),
    currentWeek: vi.fn(),
    hubTeams: vi.fn(),
    hubPlayers: vi.fn(),
    standings: vi.fn(),
    powerRankings: vi.fn(),
    predictionsBatch: vi.fn(),
    teamForm: vi.fn().mockResolvedValue({ team: "", recent_form: [] }),
    headToHead: vi.fn().mockResolvedValue({ game_id: "", meetings: [] }),
    ...overrides,
  };
}

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
    const api = mockApi({ playerProps: vi.fn().mockResolvedValue([prop("home-player","Ravens"), prop("other","Bengals")]) });
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("home-player")).toBeInTheDocument());
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });

  it("restates the spread/total line near the match markets", async () => {
    const api = mockApi();
    render(<GameDetailModal game={{ ...game, spread_line: -2.5, total_line: 46.5 }} api={api} onClose={() => {}} />);
    // nflverse spread_line −2.5 means the away side is favoured, so the home team is +2.5.
    await waitFor(() => expect(screen.getByText("Ravens +2.5 · Total 46.5")).toBeInTheDocument());
  });

  it("shows a confidence band from predicted_margin and sigma", async () => {
    const api = mockApi({
      gamePrediction: vi.fn().mockResolvedValue({
        home_win_prob: 0.6, away_win_prob: 0.4, home_cover_prob: null, away_cover_prob: null,
        over_prob: null, under_prob: null, predicted_margin: 3.5, sigma: 9.4,
      } satisfies GamePrediction),
    });
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Projected margin: Ravens by 3.5 ± 9.4 pts")).toBeInTheDocument());
  });

  it("names the away team when the predicted margin favors them", async () => {
    const api = mockApi({
      gamePrediction: vi.fn().mockResolvedValue({
        home_win_prob: 0.4, away_win_prob: 0.6, home_cover_prob: null, away_cover_prob: null,
        over_prob: null, under_prob: null, predicted_margin: -2.25, sigma: 10,
      } satisfies GamePrediction),
    });
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Projected margin: Chiefs by 2.3 ± 10.0 pts")).toBeInTheDocument());
  });

  it("shows the final score and graded lines in the verdict section", async () => {
    const finalGame: GameSummary = { ...game, home_score: 24, away_score: 17 };
    const verdict: GameVerdict = {
      game_id: game.game_id, resolved: true,
      moneyline: { hit: true, predicted: "Ravens" }, ats: null, totals: null,
      actual_home_score: 24, actual_away_score: 17, home_spread_line: -2.5, total_line: 46.5,
    };
    const api = mockApi({ gameVerdict: vi.fn().mockResolvedValue(verdict) });
    render(<GameDetailModal game={finalGame} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Final: 24–17")).toBeInTheDocument());
    expect(screen.getByText("Line -2.5")).toBeInTheDocument();
    expect(screen.getByText("Total 46.5")).toBeInTheDocument();
  });

  it("shows recent form strips and head-to-head meetings", async () => {
    const api = mockApi({
      teamForm: vi.fn().mockImplementation((team: string) => Promise.resolve({
        team,
        recent_form: [{ game_id: "f1", opponent: "Bills", is_home: true, result: "W", team_score: 24, opponent_score: 17, gameday: "2026-09-01" }],
      })),
      headToHead: vi.fn().mockResolvedValue({
        game_id: game.game_id,
        meetings: [{ game_id: "m1", season: 2025, gameday: "2025-11-02", home_team: "Ravens", away_team: "Chiefs", home_score: 27, away_score: 24 }],
      }),
    });
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Recent form & head-to-head")).toBeInTheDocument());
    expect(api.teamForm).toHaveBeenCalledWith("Ravens", 2026);
    expect(api.teamForm).toHaveBeenCalledWith("Chiefs", 2026);
    expect(api.headToHead).toHaveBeenCalledWith("2026_01_KC_BAL", 2026, 1);
    expect(screen.getByText("Ravens won")).toBeInTheDocument();
  });
});

describe("GameDetailModal on a final", () => {
  const finalGame = { ...game, home_score: 20, away_score: 17 };

  it("shows the pick made before kickoff, and labels today's model as reference only", async () => {
    const api = mockApi();
    const week = { game_id: finalGame.game_id, status: "resolved" as const, home_win_prob: 0.32, away_win_prob: 0.68, verdict: null };
    render(<GameDetailModal game={finalGame} api={api} weekPrediction={week} onClose={() => {}} />);
    expect(await screen.findByText("Pick before kickoff: Chiefs · 68%")).toBeInTheDocument();
    expect(screen.getByText(/Today's model, for reference/)).toBeInTheDocument();
  });

  it("labels a pick rebuilt after kickoff", async () => {
    const api = mockApi();
    const week = { game_id: finalGame.game_id, status: "resolved" as const, rebuilt: true, home_win_prob: 0.5, away_win_prob: 0.5, verdict: null };
    render(<GameDetailModal game={finalGame} api={api} weekPrediction={week} onClose={() => {}} />);
    expect(await screen.findByText(/Rebuilt after kickoff/)).toBeInTheDocument();
  });

  it("says when there was no pick before kickoff", async () => {
    const api = mockApi();
    render(<GameDetailModal game={finalGame} api={api} onClose={() => {}} />);
    expect(await screen.findByText("No pick was made before kickoff.")).toBeInTheDocument();
  });
});

describe("GameDetailModal and the plain-English panel", () => {
  const explanation = {
    headline: "Baltimore are the slight favourites, but this is close to a coin flip.",
    sections: [{ market: "result", title: "Why Baltimore", text: "The model has them at 62%." }],
    source: "llm" as const,
    model: "gpt-4o-mini",
    generated_at: new Date().toISOString(),
    sport: "nfl",
    pick_timing: "pre_kickoff" as const,
  };

  it("fetches the summary for this game and shows its headline", async () => {
    const explain = vi.fn().mockResolvedValue(explanation);
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    expect(await screen.findByText(explanation.headline)).toBeInTheDocument();
    expect(explain).toHaveBeenCalledWith("nfl", game.game_id);
  });

  it("shows the rest of the modal while the summary is still being written", async () => {
    // The summary is the first thing in the modal, so if it gated the rest the
    // whole detail view would sit empty behind a spinner.
    let release: (v: typeof explanation) => void = () => {};
    const explain = vi.fn().mockReturnValue(new Promise<typeof explanation>((r) => { release = r; }));
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    expect(screen.getByText("Writing the summary…")).toBeInTheDocument();
    expect(screen.getByText("Game Detail & Model Projections")).toBeInTheDocument();
    expect(await screen.findByText("Ravens")).toBeInTheDocument();
    release(explanation);
    expect(await screen.findByText(explanation.headline)).toBeInTheDocument();
  });

  it("says the summary failed and offers a retry that asks again", async () => {
    const explain = vi.fn().mockRejectedValue(new Error("explainer down"));
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    explain.mockResolvedValue(explanation);
    fireEvent.click(retry);
    expect(await screen.findByText(explanation.headline)).toBeInTheDocument();
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it("leaves the modal fully usable when there is no explainer at all", async () => {
    // No explain prop is the deployed state before the service exists, and the
    // 404 case behind it. The game detail must not depend on it.
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} />);
    expect(screen.queryByText("Writing the summary…")).not.toBeInTheDocument();
    expect(screen.getByText("Game Detail & Model Projections")).toBeInTheDocument();
    expect(await screen.findByText("Ravens")).toBeInTheDocument();
  });
});
