/**
 * The instant block, and the one-number rule that goes with it.
 *
 * The parity rule for both sports this file serves (NFL and CFB): **the block
 * renders from the bundle with the network blocked.** Every case runs with
 * `global.fetch` stubbed to reject and the api's calls failing, so a block that
 * quietly depends on a response cannot pass by rendering one it already had.
 *
 * The 68/72 case is the reason this file exists. The list card reads the stored
 * pre-kickoff snapshot (`week.home_win_prob`, `lib/weekCards.ts:86`) and the
 * modal used to read a freshly computed prediction instead, so the same pick
 * read 68% on the card and 72% in the tile — with the tile's `win · {team}` sub
 * making the fresh number read as the pick. A page must not state one figure
 * twice with two values, and the record judges the snapshot, so once a game has
 * started the snapshot is the only figure that may be called the pick.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GameDetailModal, pickProbability } from "./GameDetailModal";
import { toCardModel } from "../lib/weekCards";
import type { GamePrediction, GameSummary, GameVerdict, SportApi, WeekPrediction } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

/** A game already past kickoff with no score yet: started, not final. */
const startedGame: GameSummary = {
  game_id: "2020_01_KC_BAL",
  season: 2020,
  week: 1,
  gameday: "2020-09-07T20:00:00Z",
  home_team: "Ravens",
  away_team: "Chiefs",
  home_score: null,
  away_score: null,
};

/** The same fixture with a kickoff far enough ahead that nothing has started. */
const upcomingGame: GameSummary = { ...startedGame, game_id: "2999_01_KC_BAL", gameday: "2999-09-07T20:00:00Z" };

/** Today's freshly computed model, which the page may not call the pick. */
const fresh: GamePrediction = {
  home_win_prob: 0.72,
  away_win_prob: 0.28,
  home_cover_prob: 0.55,
  away_cover_prob: 0.45,
  over_prob: 0.5,
  under_prob: 0.5,
  predicted_margin: 3.5,
  predicted_total: 45.5,
};

function final(hit: boolean): GameVerdict {
  return {
    game_id: "x",
    resolved: true,
    moneyline: { hit, predicted: "Ravens" },
    ats: null,
    totals: null,
    actual_home_score: 24,
    actual_away_score: 17,
    home_spread_line: -2.5,
    total_line: 46.5,
  };
}

/** The stored pre-kickoff pick for the game under test: Ravens at 68%. */
const snapshot = (over: Partial<WeekPrediction> = {}): WeekPrediction => ({
  game_id: startedGame.game_id,
  status: "resolved",
  home_win_prob: 0.68,
  away_win_prob: 0.32,
  verdict: null,
  ...over,
});

/**
 * The week's rows, seeded rather than fetched — a parity test that asks the
 * network for its own fixtures proves nothing about the network being unused.
 *
 * `weekTally` (`lib/weekCards.ts:124-131`) counts resolved rows carrying a
 * verdict, less the rebuilt ones: 4 settled, 3 of them right. The fifth row is a
 * rebuild after kickoff and is NOT counted, which is the whole point of the
 * `rebuilt` field, so the strip reads 3/4 and never 4/5.
 */
const weekRows: WeekPrediction[] = [
  { game_id: "a", status: "resolved", verdict: final(true) },
  { game_id: "b", status: "resolved", verdict: final(true) },
  { game_id: "c", status: "resolved", verdict: final(true) },
  { game_id: "d", status: "resolved", verdict: final(false) },
  { game_id: "e", status: "resolved", rebuilt: true, verdict: final(true) },
  { game_id: "f", status: "pending", verdict: null },
];

/** An api whose every call fails: the network is down, not merely unused. */
function offlineApi(over: Partial<SportApi> = {}): SportApi {
  const fail = () => vi.fn().mockRejectedValue(new Error("network blocked"));
  return {
    games: fail(),
    gamePrediction: fail(),
    playerProps: fail(),
    trackRecord: fail(),
    retrain: fail(),
    gameVerdict: fail(),
    predictionsForWeek: fail(),
    currentWeek: fail(),
    standings: fail(),
    powerRankings: fail(),
    predictionsBatch: fail(),
    teamForm: fail(),
    headToHead: fail(),
    hubTeams: fail(),
    hubPlayers: fail(),
    ...over,
  };
}

/** Never resolves: the AI request is a click away and nothing clicks it. */
const never = () => new Promise<never>(() => {});

type Options = {
  game?: GameSummary;
  weekPrediction?: WeekPrediction;
  weekPredictions?: WeekPrediction[];
  api?: SportApi;
  explain?: ReturnType<typeof vi.fn>;
};

function renderModal(sport: string, o: Options = {}) {
  const explain = o.explain ?? vi.fn(never);
  const api = o.api ?? offlineApi();
  render(
    <GameDetailModal
      game={o.game ?? startedGame}
      api={api}
      weekPrediction={o.weekPrediction}
      weekPredictions={o.weekPredictions}
      onClose={() => {}}
      explain={explain}
      sport={sport}
    />,
  );
  return { explain, api };
}

/** The network is off for the whole file: nothing may quietly reach for it. */
function blockNetwork() {
  const fetchSpy = vi.fn().mockRejectedValue(new Error("network blocked"));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["nfl", "cfb"])("GameDetailModal's instant block (%s)", (sport) => {
  it("renders the block from the bundle with the network blocked", () => {
    const fetchSpy = blockNetwork();
    const { explain } = renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });

    // A started game plus a stored snapshot: every figure below comes from
    // props the page already held, so all of them are on screen with nothing
    // resolved.
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByTestId("tile-moneyline")).toBeInTheDocument();
    expect(within(block).getByTestId("pbar-fill")).toBeInTheDocument();
    expect(within(block).getByTestId("record-fill")).toBeInTheDocument();
    expect(within(block).getByText("Ravens is the pick.")).toBeInTheDocument();

    // Neither the request the block must never make, nor the one it must never
    // need. The AI button has not been pressed and nothing was spent.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();
  });

  it("shows only the stored pre-kickoff probability once the game has started", () => {
    blockNetwork();
    // The card's snapshot says 68%; today's fresh run says 72%.
    renderModal(sport, {
      weekPrediction: snapshot(),
      weekPredictions: weekRows,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(fresh) }),
    });

    const block = screen.getByTestId("instant-block");
    expect(within(block).getByText("68%")).toBeInTheDocument();
    // 72% is nowhere: not in the block, not on the page. Two values for one
    // pick is the defect this phase exists to remove.
    expect(within(block).queryByText(/72%/)).toBeNull();
    expect(screen.queryByText(/72%/)).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/72%/);
    // The tile carries the figure and its market name, and does not also call
    // the number the pick — the verdict line above it says that, once.
    expect(within(block).getByTestId("tile-moneyline")).toHaveTextContent("moneyline");
    expect(within(block).getByTestId("tile-moneyline")).not.toHaveTextContent(/win ·/);
  });

  it("shows the model's own number before kickoff", async () => {
    blockNetwork();
    // Not started: there is no snapshot to disagree with, so the live model
    // number IS the pick and no record-honesty line is owed.
    renderModal(sport, {
      game: upcomingGame,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(fresh) }),
      weekPredictions: weekRows,
    });

    const block = await screen.findByTestId("instant-block");
    expect(within(block).getByText("72%")).toBeInTheDocument();
    expect(screen.queryByText(/68%/)).toBeNull();
    expect(within(block).getByText("Made before kickoff")).toBeInTheDocument();
    // The pick is stated in words, once.
    expect(within(block).getByText("Ravens is the pick.")).toBeInTheDocument();
    expect(within(block).getByTestId("tile-moneyline")).not.toHaveTextContent(/win ·/);
  });

  it("no longer repeats the markets below the panel", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });
    expect(screen.queryByText("Match Markets")).toBeNull();
  });

  it("no longer prints the flow's pick sentences", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });
    expect(screen.queryByText(/Win probabilities/)).toBeNull();
    expect(screen.queryByText(/The model picks/)).toBeNull();
    expect(screen.queryByText(/The pick was made/)).toBeNull();
  });

  it("carries the record, and counts no pick made after kickoff", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByText("Picks made before kickoff correct")).toBeInTheDocument();
    // 4 settled, 3 right. The rebuilt fifth row is excluded, so this reads 3/4
    // and not 4/5: a pick made after kickoff is shown and never counted.
    expect(within(block).getByText("3/4")).toBeInTheDocument();
    expect(within(block).getByTestId("record-fill")).toBeInTheDocument();
  });

  it("shows the rebuilt badge and does not count the pick", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot({ rebuilt: true }), weekPredictions: weekRows });
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByText(/Rebuilt after kickoff/i)).toBeInTheDocument();
    expect(within(block).getByText(/not counted/i)).toBeInTheDocument();
    // The quiet chip is the OTHER branch; both at once would be two answers to
    // one question.
    expect(within(block).queryByText("Made before kickoff")).toBeNull();
  });

  it("says there is no pick rather than showing the fresh number in its place", async () => {
    blockNetwork();
    // Started, and the week carries no pre-kickoff pick for this game: the
    // card has no pick, so neither may the modal. Today's 72% is a real number
    // but it is not a pick made before kickoff and must not stand in for one
    // wearing the pick's label. The model still has a margin and a total, so
    // the block renders those and says the pick is absent.
    renderModal(sport, {
      game: { ...startedGame, spread_line: -2.5, total_line: 46.5 },
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(fresh) }),
      weekPredictions: weekRows,
    });
    const block = await screen.findByTestId("instant-block");
    expect(within(block).getByText(/no pick/i)).toBeInTheDocument();
    expect(within(block).queryByTestId("tile-moneyline")).toBeNull();
    expect(within(block).getByTestId("tile-spread")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/72%/);
  });

  it("draws the record as a dash, never 0/0, while the week has resolved nothing", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot(), weekPredictions: [] });
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByText("Picks made before kickoff correct")).toBeInTheDocument();
    expect(within(block).queryByTestId("record-fill")).toBeNull();
    expect(within(block).getByText("—")).toBeInTheDocument();
    expect(within(block).queryByText("0/0")).toBeNull();
  });
});

/**
 * The root cause, asserted as a function rather than only through the screen.
 *
 * The defect was that two surfaces each defined "the pick's probability" from a
 * different endpoint. These cases pin the ONE function the modal now uses, and
 * the last one pins the property that actually matters: for a started game the
 * modal's answer EQUALS the list card's answer, for every pair of inputs. If a
 * future change reintroduces a second definition, this is what fails.
 */
describe("pickProbability — one number per pick, chosen by timing", () => {
  const past = (over: Partial<GameSummary> = {}): GameSummary => ({ ...startedGame, ...over });
  const future = (over: Partial<GameSummary> = {}): GameSummary => ({ ...upcomingGame, ...over });

  it("reads the stored snapshot for a started game, ignoring today's fresh run", () => {
    // The 68/72 case, as a function: the snapshot is 0.68, the fresh run 0.72.
    expect(pickProbability(past(), fresh, snapshot())).toBe(0.68);
  });

  it("reads today's model before kickoff, where no snapshot can disagree", () => {
    expect(pickProbability(future(), fresh, snapshot())).toBe(0.72);
  });

  it("has no pick for a started game the week never tracked", () => {
    // NOT 0.72. A number the model produced after the start is not a pick made
    // before it, and promoting one into the pick's place is the defect itself.
    expect(pickProbability(past(), fresh, null)).toBeNull();
    expect(pickProbability(past(), fresh, snapshot({ status: "untracked", home_win_prob: 0.7 }))).toBeNull();
  });

  it("has no pick for a final with no snapshot either", () => {
    const done = past({ home_score: 24, away_score: 17 });
    expect(pickProbability(done, fresh, null)).toBeNull();
  });

  it("takes the snapshot for a final, which is judged on the pre-kickoff pick", () => {
    const done = past({ home_score: 24, away_score: 17 });
    expect(pickProbability(done, fresh, snapshot())).toBe(0.68);
  });

  it("agrees with the list card for every input, which is the whole point", () => {
    // `toCardModel` is what the card renders. For a STARTED game the modal and
    // the card must return the same pick probability, whatever the inputs are —
    // the two surfaces reading one snapshot differently is exactly what put 68%
    // on one part of the page and 72% on another.
    const games = [past(), past({ home_score: 24, away_score: 17 }), future()];
    const weeks = [null, snapshot(), snapshot({ status: "untracked", home_win_prob: 0.7 })];
    for (const game of games) {
      for (const week of weeks) {
        expect(
          pickProbability(game, fresh, week),
          `modal and card disagree for ${JSON.stringify({ started: game.gameday < "2026", week })}`,
        ).toBe(toCardModel(game, fresh, week ?? undefined, false).pick?.prob ?? null);
      }
    }
  });
});
