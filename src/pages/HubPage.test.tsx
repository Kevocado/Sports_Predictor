import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HubPage } from "./HubPage";
import type { HubPlayer, HubPlayersResponse, SportApi } from "../types";

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
// A real player row, copied from the deployed feed
// (`nfl/api/hub/players?season=2024` -> Aaron Rodgers). Used where a test needs
// a row that survives `isRealPlayer`, so the fixture cannot drift from the
// shape the API actually returns.
const REAL_PLAYER: HubPlayer = {
  player_id: "00-0023459", name: "Aaron Rodgers", team: "NYJ", position: "QB", games: 17,
  completions: 368, attempts: 584, passing_yards: 3897, passing_tds: 28, interceptions: 12,
  rushing_yards: 54, rushing_tds: 3, receptions: 0, targets: 0, receiving_yards: 0, receiving_tds: 0,
  fantasy_points_ppr: 341.4, epa_total: null, target_share: null, air_yards_share: null,
} as unknown as HubPlayer;

// Typed as the response it stands in for. Untyped, the empty literal made
// `players` infer as `never[]`, so a later `mockResolvedValueOnce` with real
// rows failed `tsc -b` — which is the check that runs in CI and the one that
// catches a test drifting from the shape it is pretending to be.
const hubPlayers = vi.fn(async (season: number) => ({ season, players: [], leaderboards: {} }) as HubPlayersResponse);
const standings = vi.fn(async () => []);
const trackRecord = vi.fn(async () => ({
  games: { n_resolved: 0, pct_moneyline_correct: null, pct_ats_correct: null, pct_totals_correct: null, weekly: [] },
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
    // The empty state names WHY, because the old copy said only "yet" — which
    // reads as a page that has not loaded rather than a season the source has
    // not published. nflverse has per-season weekly stats through 2024 and
    // nothing for 2026.
    expect(await screen.findByText(/No weekly player stats published for 2026 season yet/)).toBeInTheDocument();
    expect(hubPlayers).toHaveBeenCalledWith(2026);
  });

  it("does not blame the source when rows arrived but the name filter dropped them", async () => {
    // The distinction the copy exists for. An empty table has two causes and
    // they need opposite responses: nothing published (wait) versus our own
    // filter eating a populated response (fix it). Reporting the second as the
    // first would hide a real defect behind an upstream excuse.
    // A real player (from the deployed 2024 feed) with its name replaced by the
    // literal `team`, which is exactly what `isRealPlayer` filters out. A
    // hand-rolled partial player would not type-check, and a cast would hide
    // the drift this test exists to catch.
    hubPlayers.mockResolvedValueOnce({
      season: 2026,
      players: [{
        ...REAL_PLAYER, name: "team",
      }],
      leaderboards: {},
    });
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    expect(await screen.findByText(/none passed the name filter/)).toBeInTheDocument();
    expect(screen.queryByText(/No weekly player stats published/)).toBeNull();
  });

  it("switches to the Standings and Track record sub-tabs", async () => {
    render(<HubPage />);
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));
    expect(await screen.findByText("No standings available yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Track record" }));
    expect(await screen.findByText("No resolved games yet — check back once this week's games are final.")).toBeInTheDocument();
  });
});
