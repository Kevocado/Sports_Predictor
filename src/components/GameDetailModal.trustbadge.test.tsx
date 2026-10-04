/**
 * The trust badge on the Sports fixture modal — the real CFB surface.
 *
 * ## Why here and not in CFB's own repo
 *
 * CFB has no served frontend. Its Dockerfile never builds `frontend/`, the app
 * mounts no `StaticFiles`, and `cfb.{DOMAIN}` is an API-only host — Caddy
 * proxies `/cfb/*` into CFB, but the page a reader sees is this one, reached at
 * `?sport=cfb`. A `GameDetailModal` written in CFB's repo compiles, passes its
 * own tests, and is never served by anything. That is the whole reason the badge
 * was not visible when CFB's adapter had been live and answering for two hours.
 *
 * ## What this file holds
 *
 *  - the row renders INSTANT and without pressing the AI button. Spec §2:
 *    "Signals are instant: computed from stored data, no model call" and "the
 *    signals add none" of the cost. Gating it on the summary would invert that.
 *  - `{"signals": []}` renders NOTHING (spec §2, "no data, no row"), and so does
 *    a rejected request. NFL has no signals endpoint at all — 49 graded rows, no
 *    band over the floor — so its 404 must produce silence, not an error state
 *    and not a placeholder.
 *  - the row is a rate about PAST picks and must not read as a forecast for the
 *    game in front of the reader, which already states its own probability.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GameDetailModal } from "./GameDetailModal";
import { SportProvider } from "../context/SportContext";
import type { SportApi } from "../types";
import type { Signal } from "../predictor-ui";

const GAME = {
  game_id: "401871049",
  season: 2026,
  week: 5,
  home_team: "New Mexico State",
  away_team: "Western Kentucky",
  gameday: "2026-10-02T00:00:00Z",
  status: "final",
} as never;

/** The payload `cfb_predictor.signals.trust.trust_signal` builds. */
const trust = (over: Partial<Signal> = {}): Signal => ({
  kind: "trust",
  sport: "cfb",
  game_id: "401871049",
  headline: {
    text: "When the model says ~62%, its picks landed 59% of the time",
    figures: { rate: 0.5882, stated_prob: 0.623 },
  },
  n: 34,
  source:
    "34 resolved games in this project's tracking.db, 0.5-0.75 probability band, the moneyline",
  as_of: "",
  strength: 0.12,
  pre_kickoff_only: true,
  visual: "reliability_bar",
  ...over,
});

let signals: ReturnType<typeof vi.spyOn>;

/** A SportApi with only what the modal touches answered, so a new call is a
 *  visible failure rather than an undefined function. */
function api(over: Partial<SportApi> = {}): SportApi {
  const base = {
    games: vi.fn().mockResolvedValue([]),
    gamePrediction: vi.fn().mockResolvedValue(null),
    playerProps: vi.fn().mockResolvedValue([]),
    playerOut: vi.fn().mockResolvedValue([]),
    trackRecord: vi.fn().mockResolvedValue(null),
    retrain: vi.fn(),
    gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn().mockResolvedValue([]),
    currentWeek: vi.fn().mockResolvedValue({ season: 2026, week: 5 }),
    standings: vi.fn().mockResolvedValue([]),
    powerRankings: vi.fn().mockResolvedValue(null),
    predictionsBatch: vi.fn().mockResolvedValue({}),
    teamForm: vi.fn().mockResolvedValue(null),
    headToHead: vi.fn().mockResolvedValue(null),
    hubTeams: vi.fn().mockResolvedValue(null),
    hubPlayers: vi.fn().mockResolvedValue(null),
    ...over,
  };
  return base as unknown as SportApi;
}

function open(a: SportApi) {
  // The modal reads the family sport from context (`useSport`), so it has to be
  // rendered inside the provider exactly as the app does — a test that passed a
  // bare `sport` prop would be exercising a path no page takes.
  return render(
    <SportProvider>
      <GameDetailModal game={GAME} api={a} onClose={() => {}} sport="cfb" />
    </SportProvider>,
  );
}

beforeEach(() => {
  signals = vi.fn().mockResolvedValue({ sport: "cfb", id: "401871049", signals: [trust()] });
});

afterEach(() => vi.restoreAllMocks());

describe("the trust row on the Sports fixture modal", () => {
  it("renders the row without the reader asking for anything", async () => {
    open(api({ signals: signals as never }));
    expect(await screen.findByText(/its picks landed 59% of the time/)).toBeInTheDocument();
  });

  it("asks with the game's own id", async () => {
    open(api({ signals: signals as never }));
    await screen.findByText(/its picks landed/);
    expect(signals).toHaveBeenCalledWith("401871049");
  });

  it("renders nothing when the sport has no signal", async () => {
    signals.mockResolvedValue({ sport: "cfb", id: "401871049", signals: [] });
    open(api({ signals: signals as never }));
    expect((await screen.findAllByText(/New Mexico State/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/its picks landed/)).not.toBeInTheDocument();
  });

  it("renders nothing when the sport has no signals endpoint at all", async () => {
    // NFL: no endpoint, and no band over the floor to justify one. A 404 must be
    // silence, not an error state on a page that is otherwise fine.
    signals.mockRejectedValue(new Error("404 Not Found"));
    open(api({ signals: signals as never }));
    expect((await screen.findAllByText(/New Mexico State/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/its picks landed/)).not.toBeInTheDocument();
  });

  it("renders nothing when the client has no signals method", async () => {
    // Before this change `signals` is not on SportApi at all. The modal has to
    // tolerate its absence, because nflApi and cfbApi are built by one factory
    // and a sport with no feed simply has nothing to ask.
    const a = api();
    delete (a as { signals?: unknown }).signals;
    open(a);
    expect((await screen.findAllByText(/New Mexico State/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/its picks landed/)).not.toBeInTheDocument();
  });

  it("keeps the badge's past rate distinct from the game's own number", async () => {
    open(api({ signals: signals as never }));
    const row = await screen.findByText(/its picks landed 59% of the time/);
    // The modal already states this game's probability. The badge must not
    // restate it or promise a future rate.
    expect(row.textContent).not.toMatch(/this game|will be|is right/);
  });
});