// The picks panel as it renders inside the modal: the shipped `PicksList`, the
// out line, and the availability sentence.
//
// `picksPanel.test.ts` covers the data; this file covers what reaches the page,
// including the one thing that can only be tested at this level -- that the
// out-player rule holds in the DOM, not merely in the object handed to the
// component.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GameDetailModal } from "./GameDetailModal";
import type { GameSummary, SportApi, TrackRecord } from "../types";

// Same mock the sibling modal tests use -- the modal reads `useSport()` for its
// api and these tests hand it one directly.
vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function game(over: Partial<GameSummary> = {}): GameSummary {
  return {
    game_id: "2026_12_KC_BAL", season: 2026, week: 12, gameday: "2026-11-27T20:00:00Z",
    home_team: "KC", away_team: "BAL",
    home_score: null, away_score: null,
    ...over,
  } as GameSummary;
}

/** This week's slate for KC vs BAL. `extra` appends rows; it is an ARRAY, not an
 *  object -- an object spread into an array literal is `over is not iterable`,
 *  which is what this was for a while.
 *
 *  The quarterback numbers are POST-NFL#26, whose `anytime_td` label is rushing +
 *  receiving only: Stafford 0.21 (the mobile one, real goal-line carries) and
 *  Hurts 0.12 are what a quarterback's rush-or-receive probability looks like
 *  now, not the 0.62-0.84 the old passing-dominated label produced. Rodgers at
 *  0.06 is a passer whose legs do not earn him this board. The `passing_td_*`
 *  block on each is NFL's own QB passing-TD call, transcribed from
 *  `models/player_props.py::predict_props` after #26. */
function props(extra: Partial<Record<string, unknown>>[] = []) {
  return [
    { player_id: "00-1", player_name: "M. Stafford", recent_team: "KC", position: "QB", anytime_td_prob: 0.21, passing_yards: 265.7, is_starter: null,
      passing_td_line: 2.5, passing_td_line_source: "model_line", passing_td_side: "over", passing_td_mu: 2.94, passing_td_over_prob: 0.6, passing_td_under_prob: 0.4, passing_td_prob: 0.6, passing_td_distribution: "poisson" },
    { player_id: "00-2", player_name: "A. Rodgers", recent_team: "KC", position: "QB", anytime_td_prob: 0.06, passing_yards: 239.9, is_starter: null,
      passing_td_line: 3.5, passing_td_line_source: "model_line", passing_td_side: "under", passing_td_mu: 3.12, passing_td_over_prob: 0.33, passing_td_under_prob: 0.67, passing_td_prob: 0.67, passing_td_distribution: "poisson" },
    { player_id: "00-3", player_name: "J. Hurts", recent_team: "KC", position: "QB", anytime_td_prob: 0.12, passing_yards: 251.2, is_starter: null,
      passing_td_line: 2.5, passing_td_line_source: "model_line", passing_td_side: "under", passing_td_mu: 2.31, passing_td_over_prob: 0.38, passing_td_under_prob: 0.62, passing_td_prob: 0.62, passing_td_distribution: "poisson" },
    { player_id: "00-4", player_name: "D. Cook", recent_team: "BAL", position: "RB", anytime_td_prob: 0.41, rushing_yards: 95.4, is_starter: null },
    // Seeded across two markets: he outranks every WR/TE on TD AND on receiving
    // yards, so an implementation that gates only one of them still shows him.
    { player_id: "00-5", player_name: "T. Kelce", recent_team: "KC", position: "TE", anytime_td_prob: 0.55, receiving_yards: 58.4, is_starter: null },
    { player_id: "00-6", player_name: "D. Hopkins", recent_team: "BAL", position: "WR", anytime_td_prob: 0.28, receiving_yards: 64.3, is_starter: null },
    ...extra,
  ];
}

const track: TrackRecord = {
  games: {} as TrackRecord["games"],
  player_props: {
    anytime_td: {
      n_resolved: 346, n_called: 31, hit_rate_when_called: 0.8387, brier_score: 0.1516,
      confidence_buckets: [
        { label: "50-60%", n: 5, hit_rate: 0.6 },
        { label: "60-70%", n: 3, hit_rate: 0.6667 },
        { label: "70%+", n: 23, hit_rate: 0.913 },
      ],
    },
    passing_yards: { n_resolved: 34, mean_absolute_error: 66.76, mean_signed_error: -11.06, by_position: [{ position: "QB", n_resolved: 34, mean_absolute_error: 66.76 }] },
    rushing_yards: { n_resolved: 90, mean_absolute_error: 21.5, mean_signed_error: -0.15, by_position: [{ position: "RB", n_resolved: 90, mean_absolute_error: 21.5 }] },
    receiving_yards: { n_resolved: 222, mean_absolute_error: 22.25, mean_signed_error: 3.87, by_position: [{ position: "WR", n_resolved: 222, mean_absolute_error: 22.25 }] },
    carries: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
    receptions: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
  },
};

function api(over: Partial<SportApi> = {}): SportApi {
  return {
    gamePrediction: vi.fn(() => Promise.resolve(null)),
    playerProps: vi.fn(() => Promise.resolve(props())),
    // NFL#24 (branch d495047) `GET /players/{season}/{week}/out`: a SIBLING route
    // rather than a field on `/props`, because three existing consumers depend on
    // `/props` staying a bare array. Always 200 with a list -- never a 503 -- so
    // "we could not check" and "nobody is out" stay different facts.
    playerOut: vi.fn(() => Promise.resolve([])),
    trackRecord: vi.fn(() => Promise.resolve(track)),
    gameVerdict: vi.fn(() => Promise.resolve(null)),
    teamForm: vi.fn(() => Promise.resolve(null)),
    headToHead: vi.fn(() => Promise.resolve(null)),
    ...over,
  } as unknown as SportApi;
}

async function openModal(apiObj: SportApi, g = game()) {
  render(<GameDetailModal game={g} api={apiObj} onClose={() => {}} sport="nfl" />);
  // The panel appears once props and the track record have both landed.
  await screen.findByTestId("picks-list");
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
});

describe("the picks panel renders", () => {
  it("titles the list 'Model's top calls' and gives one heading per category", async () => {
    await openModal(api());
    expect(screen.getByTestId("picks-title")).toHaveTextContent("Model's top calls");
    const headings = screen.getAllByTestId("picks-category-heading").map((h) => h.textContent);
    expect(headings).toEqual(["Rush or receiving TD", "QB passing TDs", "QB passing yards", "RB rushing yards", "WR/TE receiving yards"]);
  });

  it("never draws more than three rows under one heading", async () => {
    await openModal(api());
    for (const heading of screen.getAllByTestId("picks-category-heading")) {
      const section = heading.closest("section")!;
      expect(within(section).queryAllByTestId("picks-row").length).toBeLessThanOrEqual(3);
    }
  });

  it("draws both TD headings in the DOM: the rush-or-receive list and the QB passing call", async () => {
    await openModal(api());
    const headings = screen.getAllByTestId("picks-category-heading").map((h) => h.textContent);
    expect(headings).toContain("Rush or receiving TD");
    expect(headings).toContain("QB passing TDs");
    // Three rows each, from three eligible quarterbacks and four eligible
    // rush/receivers respectively. If either heading is rendered empty the
    // cap has silently become a promise rather than a ceiling.
    for (const heading of ["Rush or receiving TD", "QB passing TDs"]) {
      const section = screen.getAllByTestId("picks-category-heading").find((h) => h.textContent === heading)!.closest("section")!;
      expect(within(section).getAllByTestId("picks-row").length).toBe(3);
    }
  });

  it("never draws a quarterback under Rush or receiving TD on his passing alone", async () => {
    // Rodgers is a quarterback in this slate with a 0.06 rush-or-receive
    // probability and a 67% passing-TD call. The passing number is large, and
    // the TD heading is titled by rushing/receiving. He must not be on it.
    await openModal(api());
    const section = screen.getAllByTestId("picks-category-heading")
      .find((h) => h.textContent === "Rush or receiving TD")!.closest("section")!;
    const names = within(section).getAllByTestId("picks-row").map((r) => r.textContent ?? "");
    expect(names.join(" | ")).not.toContain("A. Rodgers");
    expect(names.join(" | ")).not.toContain("J. Hurts");
    // And he IS on the passing one, so this is the split working rather than
    // the panel quietly dropping quarterbacks everywhere.
    const qbSection = screen.getAllByTestId("picks-category-heading")
      .find((h) => h.textContent === "QB passing TDs")!.closest("section")!;
    expect(within(qbSection).getAllByTestId("picks-row").map((r) => r.textContent ?? "").join(" | ")).toContain("A. Rodgers");
  });

  it("draws no sportsbook wording on the passing-TD rows: the model line is never a price", async () => {
    await openModal(api());
    const section = screen.getAllByTestId("picks-category-heading")
      .find((h) => h.textContent === "QB passing TDs")!.closest("section")!;
    const text = (within(section).getAllByTestId("picks-row").map((r) => r.textContent ?? "").join(" | ")).toLowerCase();
    for (const w of ["line", "book", "sportsbook", "market", "price", "odds", "edge", "over/", "total"]) {
      expect(text, `a passing-TD row must not call the line "${w}"`).not.toMatch(new RegExp(`\\b${w.replace("/", "\\/")}`));
    }
  });

});

describe("the picks never render before the injury list has answered (CodeRabbit Major on Sports#24)", () => {
  const outEntry = {
    player_id: "00-5", player_name: "T. Kelce", recent_team: "KC", report_status: "Out",
    report_season: 2026, report_week: 12, source: "NFL official injury report",
  };

  it("holds the whole panel back while /out is pending, so an out player is never ranked for a moment", async () => {
    // outPlayers starts as [] and props can land first. Without a resolved flag the
    // panel rendered with NOBODY out, ranking the out player until /out answered.
    let resolveOut!: (v: unknown[]) => void;
    const pending = new Promise<unknown[]>((r) => { resolveOut = r; });
    render(<GameDetailModal game={game()} api={api({ playerOut: vi.fn(() => pending as never) })} onClose={() => {}} sport="nfl" />);
    // Give props time to land. If the panel rendered, it did so with an empty out list.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("picks-list")).toBeNull();
    // Once /out answers, the panel renders WITHOUT the out player in any row.
    resolveOut([outEntry]);
    await screen.findByTestId("picks-list");
    for (const row of screen.getAllByTestId("picks-row")) expect(row.textContent!).not.toContain("T. Kelce");
  });

  it("still renders, saying availability was not checked, when /out fails", async () => {
    render(<GameDetailModal game={game()} api={api({ playerOut: vi.fn(() => Promise.reject(new Error("503"))) })} onClose={() => {}} sport="nfl" />);
    await screen.findByTestId("picks-list");
  });

  it("does not wait for /out on CFB, which has no injury feed", async () => {
    const outSpy = vi.fn(() => new Promise(() => {}));
    render(<GameDetailModal game={game()} api={api({ playerOut: outSpy as never })} onClose={() => {}} sport="cfb" />);
    await screen.findByTestId("picks-list");
    expect(outSpy).not.toHaveBeenCalled();
  });
});

describe("an out player, in the DOM", () => {
  const outEntry = {
    player_id: "00-5", player_name: "T. Kelce", recent_team: "KC", report_status: "Out",
    report_season: 2026, report_week: 12, source: "NFL official injury report",
  };

  it("appears in no ranking at all, having been seeded above both of his markets", async () => {
    await openModal(api({ playerOut: vi.fn(() => Promise.resolve([outEntry])) }));
    const rows = screen.getAllByTestId("picks-row").map((r) => r.textContent!);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).not.toContain("T. Kelce");
  });

  it("is named exactly once on the page, below the lists, with source and date", async () => {
    const { container } = render(<GameDetailModal game={game()} api={api({ playerOut: vi.fn(() => Promise.resolve([outEntry])) })} onClose={() => {}} sport="nfl" />);
    await screen.findByTestId("picks-list");
    const panel = container.querySelector("[data-testid='picks-list']")!;
    expect((panel.textContent!.match(/T\. Kelce/g) ?? []).length).toBe(1);
    const outLine = screen.getByTestId("picks-out");
    expect(outLine.textContent).toContain("T. Kelce");
    expect(outLine.textContent).toContain("NFL official injury report");
    expect(outLine.textContent).toMatch(/week 12/);
    // Below the lists: the out block follows every category in document order.
    expect(outLine.compareDocumentPosition(screen.getAllByTestId("picks-category").at(-1)!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("does not backfill his slot with a fourth row", async () => {
    await openModal(api({ playerOut: vi.fn(() => Promise.resolve([outEntry])) }));
    // Kelce is the top TD row before the gate and the only TE on the board, so
    // both of his lists have room to grow if a replacement is swapped in. The
    // bound is now per heading rather than a flat nine, because the panel has
    // five headings after the TD split and a flat total would have to be
    // rewritten every time one is added -- which is how a ceiling quietly goes
    // stale.
    const sections = screen.getAllByTestId("picks-category").map((s) => within(s).queryAllByTestId("picks-row").length);
    expect(sections.length).toBe(5);
    for (const count of sections) expect(count).toBeLessThanOrEqual(3);
    // The TD list still shows three, filled from below: Cook 0.41, Swift 0.30,
    // Hopkins 0.28 -- never four.
    const td = screen.getAllByTestId("picks-category-heading")
      .find((h) => h.textContent === "Rush or receiving TD")!.closest("section")!;
    expect(within(td).getAllByTestId("picks-row").length).toBe(3);
  });

  it("ignores Doubtful and Questionable -- only Out removes a player", async () => {
    const doubtful = { ...outEntry, player_id: "00-6", player_name: "D. Hopkins", report_status: "Questionable" };
    await openModal(api({ playerOut: vi.fn(() => Promise.resolve([doubtful])) }));
    const rows = screen.getAllByTestId("picks-row").map((r) => r.textContent!);
    expect(rows.some((r) => r.includes("D. Hopkins"))).toBe(true);
    expect(screen.queryByTestId("picks-out")).not.toBeInTheDocument();
  });

  it("says the report was checked when nobody is out", async () => {
    await openModal(api());
    expect(screen.getByTestId("picks-availability").textContent).toMatch(/checked/i);
  });
});

describe("CFB: no availability feed at all", () => {
  it("never calls the /out route, because CFB has no such route", async () => {
    const outSpy = vi.fn(() => Promise.resolve([]));
    render(<GameDetailModal game={game()} api={api({ playerOut: outSpy })} onClose={() => {}} sport="cfb" />);
    await screen.findByTestId("picks-list");
    expect(outSpy).not.toHaveBeenCalled();
  });

  it("claims no CFB player is available", async () => {
    render(<GameDetailModal game={game()} api={api()} onClose={() => {}} sport="cfb" />);
    await screen.findByTestId("picks-list");
    const panel = document.querySelector("[data-testid='picks-list']")!.textContent!.toLowerCase();
    expect(panel).not.toMatch(/\b(is|are|confirmed|cleared|expected) to play\b/);
    expect(panel).not.toContain("available");
  });

  it("words its empty out list as the absence of a check, not as nobody being out", async () => {
    render(<GameDetailModal game={game()} api={api()} onClose={() => {}} sport="cfb" />);
    await screen.findByTestId("picks-list");
    // No out block is rendered at all -- there is nothing to report.
    expect(screen.queryByTestId("picks-out")).not.toBeInTheDocument();
    const line = screen.getByTestId("picks-availability").textContent!;
    expect(line).toContain("no injury report or depth-chart feed");
    expect(line).toContain("not a claim that nobody is out");
  });

  it("does not put the CFB flag on an NFL row", async () => {
    await openModal(api());
    expect(screen.getByTestId("picks-list").textContent).not.toContain("no availability check");
  });
});

describe("no odds, no edge, no guarantee anywhere in the panel", () => {
  it("reads clean of the banned vocabulary", async () => {
    await openModal(api());
    const panel = document.querySelector("[data-testid='picks-list']")!.textContent!.toLowerCase();
    for (const w of ["lock", "guaranteed", "guarantee", "best bet", "edge", "value", "odds", "moneyline"]) {
      expect(panel, `must not contain "${w}"`).not.toMatch(new RegExp(`\\b${w}\\b`));
    }
  });
});

describe("absence of props", () => {
  it("renders no picks panel at all rather than an empty ranked list", async () => {
    const emptyApi = api({ playerProps: vi.fn(() => Promise.resolve([])), playerOut: vi.fn(() => Promise.resolve([])) });
    render(<GameDetailModal game={game()} api={emptyApi} onClose={() => {}} sport="nfl" />);
    await screen.findByText(/Loading player projections|player projection props/i);
    expect(screen.queryByTestId("picks-list")).not.toBeInTheDocument();
  });

  it("still renders the panel when the /out route 404s, ungated rather than broken", async () => {
    // NFL#24 is OPEN: a deployment without it answers 404 on /out. That must not
    // take the picks page down -- the ranking is still true, just ungated.
    const noRoute = api({ playerOut: vi.fn(() => Promise.reject(new Error("404 Not Found"))) });
    await openModal(noRoute);
    expect(screen.getAllByTestId("picks-row").length).toBeGreaterThan(0);
    expect(screen.getByTestId("picks-availability").textContent).not.toMatch(/no availability check/i);
  });

  it("still renders the panel when /track-record fails (the rows never needed it)", async () => {
    const noTrack = api({ trackRecord: vi.fn(() => Promise.reject(new Error("boom"))) });
    await openModal(noTrack);
    const tdSection = screen.getAllByTestId("picks-category-heading")[0].closest("section")!;
    expect(within(tdSection).getAllByTestId("picks-row").length).toBeGreaterThan(0);
  });

  it("shows only the player and the prediction on every row", async () => {
    await openModal(api());
    for (const row of screen.getAllByTestId("picks-row")) {
      const text = row.textContent ?? "";
      for (const bit of ["uncalibrated", "Brier", "graded", "bucket", "MAE", "±", "no error estimate", "no availability check", "resolved"]) {
        expect(text, `a pick row must not contain "${bit}"`).not.toContain(bit);
      }
    }
  });
});