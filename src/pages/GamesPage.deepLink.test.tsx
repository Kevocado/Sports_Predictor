import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GamesPage } from "./GamesPage";
import type { GamePrediction, GameSummary, SportApi, WeekPrediction } from "../types";

// The deep link arrives on the URL (?game=<id> alongside the ?sport= the site
// already reads), so what is under test is the page's behaviour on load — not
// a click. Every API call the page and the detail modal make is stubbed; the
// explainer is mocked to reject, which is the documented degradation (the
// modal opens and shows everything else).
vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));
vi.mock("../api/client", () => ({
  cfbExplain: vi.fn(async () => { throw new Error("no explainer"); }),
  nflExplain: vi.fn(async () => { throw new Error("no explainer"); }),
}));

// Kickoffs are computed, not written down. These fixtures used a hardcoded
// `2026-10-04T17:00:00Z`, which made every case below a time bomb: once that
// instant passed, both games counted as STARTED, and a started game takes its pick
// from the stored snapshot rather than the live one — which these fixtures do not
// have. So the "Pick: " rows went from 2 to 0 and the count assertions failed on
// an UNMODIFIED commit: green on 2026-10-03, red on 2026-10-04.
//
// An hour and three hours out, so "upcoming" stays true whenever this runs. None
// of the assertions below read the displayed date, so nothing else moves.
const hoursOut = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const g1: GameSummary = { game_id: "g1", season: 2026, week: 7, gameday: hoursOut(1), home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null };
const g2: GameSummary = { game_id: "g2", season: 2026, week: 7, gameday: hoursOut(3), home_team: "Bills", away_team: "Jets", home_score: null, away_score: null };
const pred1: GamePrediction = { home_win_prob: 0.62, away_win_prob: 0.38, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };
const pred2: GamePrediction = { home_win_prob: 0.55, away_win_prob: 0.45, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null };

// The batch covers both games, so the list never falls back to the per-game
// prediction call — every `gamePrediction` call below can only have come from
// the detail modal, which is what tells us WHICH game opened.
const games = vi.fn(async (_s: number, w: number) => (w === 7 ? [g1, g2] : []));
const predictionsBatch = vi.fn(async () => ({ g1: pred1, g2: pred2 }));
const gamePrediction = vi.fn(async () => pred1);
const currentWeek = vi.fn(async () => ({ season: 2026, week: 7 }));
const predictionsForWeek = vi.fn(async () => [] as WeekPrediction[]);

const api = {
  games, gamePrediction, predictionsBatch, currentWeek, predictionsForWeek,
  playerProps: vi.fn(async () => []), trackRecord: vi.fn(async () => null), retrain: vi.fn(async () => null),
  gameVerdict: vi.fn(async () => null),
  standings: vi.fn(async () => []), powerRankings: vi.fn(async () => []),
  teamForm: vi.fn(async () => null), headToHead: vi.fn(async () => null),
} as unknown as SportApi;

const setUrl = (path: string) => window.history.replaceState({}, "", path);

describe("a game identifier on the URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUrl("/");
  });
  afterEach(() => setUrl("/"));

  it("opens that game's detail", async () => {
    setUrl("/?sport=nfl&game=g2");
    render(<GamesPage />);

    await screen.findByText("Game Detail & Model Projections");
    // The detail is the one the identifier names: g2's modal asks for g2's
    // prediction, and g1's — the other game in the same week — is never asked
    // for, because the list itself uses only the batch above.
    await waitFor(() => expect(gamePrediction).toHaveBeenCalledWith(2026, 7, "g2"));
    expect(gamePrediction).not.toHaveBeenCalledWith(2026, 7, "g1");
    // The normal list is still the page underneath the modal.
    expect(screen.getAllByText(/^Pick: /)).toHaveLength(2);
  });

  it("falls back to the normal list for an unknown identifier, with no error state", async () => {
    setUrl("/?sport=nfl&game=not-a-game");
    render(<GamesPage />);

    await waitFor(() => expect(screen.getAllByText(/^Pick: /)).toHaveLength(2));
    expect(screen.queryByText("Game Detail & Model Projections")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(gamePrediction).not.toHaveBeenCalled();
  });

  it("shows the normal list when there is no identifier at all", async () => {
    setUrl("/?sport=nfl");
    render(<GamesPage />);

    await waitFor(() => expect(screen.getAllByText(/^Pick: /)).toHaveLength(2));
    expect(screen.queryByText("Game Detail & Model Projections")).not.toBeInTheDocument();
  });
});
