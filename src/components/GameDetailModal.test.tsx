import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { filterPlayerPropsForGame, GameDetailModal } from "./GameDetailModal";
import type { GamePrediction, GameSummary, GameVerdict, PlayerPropPrediction, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const game: GameSummary = { game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z", home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null };
function prop(id: string, team: string, position = "WR", over: Partial<PlayerPropPrediction> = {}): PlayerPropPrediction { return { player_id: id, player_name: id, recent_team: team, position, anytime_td_prob: 0.3, ...over }; }

// The box score is a table per (team, position), so the column headers are
// read off the box-score tables rather than off the whole modal: the section
// now also carries the team-totals strip, which is a table of its own. The
// position label is a colgroup header in the body, not a column, so read the
// thead.
async function renderModal(props: PlayerPropPrediction[], api = mockApi({ playerProps: vi.fn().mockResolvedValue(props) })) {
  render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
  const sections = await screen.findAllByTestId("box-score");
  return sections.map((s) => within(s).getByRole("table"));
}
function headers(table: HTMLElement) {
  return [...table.querySelectorAll("thead th")].map((h) => h.textContent);
}
function rowNames(table: HTMLElement) {
  return within(table).getAllByTestId("box-score-row").map((r) => r.querySelector("th span")?.textContent);
}

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

describe("GameDetailModal's predicted box score", () => {
  const roster = [
    prop("qb", "Chiefs", "QB", { passing_yards: 254.2 }),
    prop("rb", "Ravens", "RB", { rushing_yards: 84.2, carries: 18 }),
    prop("wr", "Ravens", "WR", { receiving_yards: 61.4, receptions: 4.2 }),
    prop("te", "Chiefs", "TE", { receiving_yards: 33.1, receptions: 3 }),
  ];

  it("gives each position its own columns, the model's own markets and nothing more", async () => {
    const tables = await renderModal(roster);
    // One table per (team, position): the away section first (Chiefs: QB, TE),
    // then the home section (Ravens: RB, WR), each position in QB -> RB -> WR
    // -> TE order within its section.
    expect(tables.map(headers)).toEqual([
      ["Player", "Pass yds", "TD %"],
      ["Player", "Rec yds", "Rec", "TD %"],
      // RB has no receiving market, so no Rec yds / Rec columns: see
      // boxScoreRows.ts. A column that can only ever be a dash is not shipped.
      ["Player", "Rush yds", "Carries", "TD %"],
      ["Player", "Rec yds", "Rec", "TD %"],
    ]);
  });

  it("has no FanDuel column, not even an empty or dashed-out one", async () => {
    const tables = await renderModal(roster);
    expect(tables.flatMap(headers).join(" ")).not.toMatch(/fan\s*duel|\bFD\b/i);
    // Every row is exactly as wide as its header, so nothing is being rendered
    // as a permanently-empty column.
    for (const table of tables) {
      const width = headers(table).length - 1; // minus the Player column
      for (const row of within(table).getAllByTestId("box-score-row")) {
        expect(row.querySelectorAll("td")).toHaveLength(width);
      }
    }
  });

  it("drops the position filter buttons — the grouping replaces them", async () => {
    await renderModal([prop("a", "Ravens", "QB"), prop("b", "Chiefs", "WR")]);
    expect(screen.queryByRole("button", { name: "QB" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ALL" })).not.toBeInTheDocument();
    // Close plus the Away / Both / Home team filter: no position control.
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("lists starters before bench, in depth-chart order, when the feed has one", async () => {
    const [table] = await renderModal([
      prop("backup", "Ravens", "WR", { is_starter: false, depth_slot: 41, receiving_yards: 90 }),
      prop("first", "Ravens", "WR", { is_starter: true, depth_slot: 0, receiving_yards: 40 }),
      prop("second", "Ravens", "WR", { is_starter: true, depth_slot: 1, receiving_yards: 60 }),
    ]);
    const rows = within(table).getAllByTestId("box-score-row");
    expect(rows.map((r) => r.dataset.starter)).toEqual(["starter", "starter", "bench"]);
    expect(rowNames(table)).toEqual(["first", "second", "backup"]);
  });

  it("says the order is projected and invents no starter flag when there is no depth chart", async () => {
    // CFB: CFBD's athlete object has no starter field, so every prop is
    // is_starter: null. The table has to say so rather than guess from yardage.
    const tables = await renderModal([
      prop("low", "Ravens", "WR", { is_starter: null, depth_slot: null, receiving_yards: 12 }),
      prop("high", "Ravens", "WR", { is_starter: null, depth_slot: null, receiving_yards: 69.5 }),
      prop("qb", "Chiefs", "QB", { is_starter: null, depth_slot: null, passing_yards: 240 }),
    ]);
    // Once, on the section heading — not repeated on every position's table.
    const notes = screen.getAllByTestId("box-score-projected-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("Projected order");
    const rows = within(tables[0]).getAllByTestId("box-score-row");
    expect(rows.every((r) => r.dataset.starter === "projected")).toBe(true);
    expect(rowNames(tables[1])).toEqual(["high", "low"]);
  });

  it("renders a market the model did not produce as an em-dash, never a 0", async () => {
    const [table] = await renderModal([prop("rb", "Ravens", "RB", { rushing_yards: 84.2 })]);
    const cells = within(table).getAllByTestId("box-score-row")[0].querySelectorAll("td");
    // Carries and the TD chance are absent from this payload. 0 would claim the
    // model predicted no carries. RB is three columns wide -- it has no
    // receiving market, so no Rec yds / Rec cells to be blank here.
    expect([...cells].map((c) => c.textContent)).toEqual(["84.2", "—", "30"]);
  });

  it("removes the yardage cards and shows each team's total once, away then home", async () => {
    // A4's dedup rule, reaffirmed at Phase 0 review: the side-by-side
    // "Projected Yardage by Market" cards are gone, and each team's total is
    // rendered once — in the totals strip, not once per position group. The
    // strip carries the cards' numbers (per-market sums with the counts they
    // were summed from), so nothing is lost, and no per-position subtotal row
    // survives to encode either total a second time.
    await renderModal([
      prop("r1", "Ravens", "WR", { receiving_yards: 60 }),
      prop("r2", "Ravens", "WR", { receiving_yards: 40 }),
      prop("k1", "Chiefs", "WR", { receiving_yards: 30 }),
    ]);
    expect(screen.queryByTestId("yardage-by-market")).not.toBeInTheDocument();
    expect(screen.queryByText("Projected Yardage by Market")).not.toBeInTheDocument();
    expect(screen.queryByTestId("box-score-subtotal")).not.toBeInTheDocument();
    // WR is the only position on the roster here, so both totals below are the
    // teams' own — one row each, in the game's away-then-home order.
    const totals = within(screen.getByTestId("box-score-team-totals")).getAllByTestId("box-score-team-total");
    expect(totals).toHaveLength(2);
    expect(totals[0]).toHaveTextContent("Chiefs total");
    expect(within(totals[0]).getByText("30")).toBeInTheDocument();
    expect(totals[1]).toHaveTextContent("Ravens total");
    expect(within(totals[1]).getByText("100")).toBeInTheDocument();
  });

  it("renders no table at all when the game has no props, and says so", async () => {
    // NFL 2026 week 3 has no props in the snapshot. That is a data gap, not a
    // reason to invent a placeholder box score.
    render(<GameDetailModal game={game} api={mockApi({ playerProps: vi.fn().mockResolvedValue([]) })} onClose={() => {}} />);
    expect(await screen.findByText(/No player projection props available for this specific game yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("box-score")).not.toBeInTheDocument();
  });

  it("names the empty state after what is missing, not after a position filter", async () => {
    // The branch the other empty state does not cover: the game DID return
    // props, and every one of them plays a position the model does not project
    // (K / OL / DL / P), so there is no group to render. A4 retired the
    // position filter the sentence here used to name — it read "No players at
    // this position for this game", and no position control has existed since,
    // so it pointed at something the reader cannot see. It had no test, which is
    // how a stale sentence survives the change that removed its subject.
    render(<GameDetailModal game={game} api={mockApi({ playerProps: vi.fn().mockResolvedValue([
      prop("k", "Ravens", "K"), prop("ol", "Chiefs", "OL"),
    ]) })} onClose={() => {}} />);
    expect(await screen.findByText(/No modelled positions for this game/)).toBeInTheDocument();
    // The sentence has to survive a reword of the box score, but not one that
    // reaches for a control again.
    expect(screen.queryByText(/at this position/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
    // `spread_line` is the HOME team's line in nflverse's convention (NFL_Predictor's
    // `game_outcome.py`: "the home team's expected margin"), so −2.5 is the home
    // team RECEIVING 2.5 and the rendering is `spread(home, -spread_line)`. It is
    // not "the away side is favoured, therefore flip it" — the field is defined in
    // the home frame from the start, and the away side is favoured as a consequence.
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
  // Flow-first since the rollout: the summary sits behind the button and
  // nothing is fetched until a reader asks. The v1 `headline`/`sections`
  // shape these tests used to send is no longer rendered by any panel (the
  // union arm was removed), so the fixture below is a v2 answer.
  const answer = {
    verdict: "Baltimore are the pick.",
    band: "moderate",
    factors: [{ key: "moneyline", direction: "neutral", headline: "Why", text: "Numbers." }],
    source: "template" as const,
    model: "",
    generated_at: new Date().toISOString(),
    sport: "nfl",
    pick_timing: "pre_kickoff" as const,
  };

  it("fetches nothing until asked, then shows the summary for this game", async () => {
    const explain = vi.fn().mockResolvedValue(answer);
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    expect(explain).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
    expect(await screen.findByText("Baltimore are the pick.")).toBeInTheDocument();
    expect(explain).toHaveBeenCalledWith("nfl", game.game_id);
  });

  it("shows the flow and the rest of the modal while the summary is still being written", async () => {
    // No skeleton: the flow is the thing on screen while the request is in
    // flight, so there is no frame where the panel is empty.
    let release: (v: typeof answer) => void = () => {};
    const explain = vi.fn().mockReturnValue(new Promise<typeof answer>((r) => { release = r; }));
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
    expect(screen.getByTestId("fixture-flow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Writing…" })).toBeDisabled();
    expect(screen.getByText("Game Detail & Model Projections")).toBeInTheDocument();
    expect(await screen.findByText("Ravens")).toBeInTheDocument();
    release(answer);
    expect(await screen.findByText("Baltimore are the pick.")).toBeInTheDocument();
  });

  it("says the summary failed and offers a retry that asks again", async () => {
    const explain = vi.fn().mockRejectedValue(new Error("explainer down"));
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
    const retry = await screen.findByRole("button", { name: "Try again" });
    // The flow is still on screen beside the retry, not an error panel.
    expect(screen.getByTestId("fixture-flow")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    explain.mockResolvedValue(answer);
    fireEvent.click(retry);
    expect(await screen.findByText("Baltimore are the pick.")).toBeInTheDocument();
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
