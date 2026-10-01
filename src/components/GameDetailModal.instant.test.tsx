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
 *
 * **The block is the only place the figures appear, BEFORE and AFTER the button.**
 * `InstantBlock` renders the tiles, the bar, its legend and the record, and the
 * panel behind the button deliberately renders none of them: an earlier plan said
 * the figures sat under the summary, and the reviewer's fix inverted that — the
 * summary adds WORDS and the block keeps the numbers, so pressing the button must
 * not produce a second copy of any figure. That makes "exactly once" a claim
 * about two states rather than one, and the second state is where a duplicate
 * would actually appear, so it is asserted here rather than assumed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GameDetailModal, pickProbability } from "./GameDetailModal";
import { toCardModel } from "../lib/weekCards";
import type { Explanation } from "../predictor-ui";
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
    // Phase 2: the out list has its own route on NFL. Absent here means
    // "no check ran", which the panel words as such rather than as nobody being out.
    playerOut: vi.fn().mockResolvedValue([]),
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

/** The one colour that means "this is the pick". A bar that spends it on
 *  anything but the pick is claiming something nobody picked, and a bar that
 *  spends it on nothing while a pick exists is claiming there is no pick. */
const ACCENT = "var(--color-pr-accent)";

/** What `ProbabilityBar` painted each segment, in order, as the browser would
 *  colour it. Read from the elements rather than from the props, so a bar that
 *  stopped accenting cannot pass by still being handed a pick. */
const fills = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("[data-testid='pbar-fill']")].map((f) => f.style.backgroundColor);

/** Which segment carries the accent, by index. -1 when none does. */
const accentedAt = (root: HTMLElement) => fills(root).indexOf(ACCENT);

/** The bar's accessible name — the screen-reader half of the accent. The accent
 *  is a colour, and a meaning carried by colour alone is not carried at all, so
 *  a bar that accents without saying so is only half right and the name is how
 *  that is checked. */
const barName = (root: HTMLElement) =>
  root.querySelector<HTMLElement>("[data-testid='instant-block'] [role='img']")?.getAttribute("aria-label") ?? "";

/** Every element that draws one of this page's figures. A figure is counted by
 *  the element that draws it, never by the digits it prints: the panel puts the
 *  leading side's percentage on a tile AND on the bar, by design, so a
 *  text-frequency assertion would be measuring the panel's design rather than
 *  this phase's rule. What must be unique is the FIGURE — one tile, one bar,
 *  one record — and one place it may live.
 *
 *  `tile-total` is in the list whether or not it renders: a count of 0 and a
 *  count of 1 are both correct for a game with no total, and the assertion that
 *  matters is the one that says the element appears at most once and never
 *  outside the block. */
const FIGURE_TESTIDS = [
  "tile-moneyline",
  "tile-spread",
  "tile-total",
  "pbar-fill",
  "pbar-label",
  "pbar-legend",
  "pbar-market-fill",
  "pbar-market-figures",
  "record-fill",
] as const;

/** The figures on the page, and where each one lives.
 *
 *  Returned as a list rather than asserted inside a helper so the failure names
 *  the figure and its count, which is the thing a reader of the failure needs
 *  and the thing a bare `toHaveLength` does not give. */
const figureCensus = (): Array<{ testid: string; count: number; inBlock: number }> =>
  FIGURE_TESTIDS.map((testid) => {
    const all = screen.queryAllByTestId(testid);
    const block = screen.queryByTestId("instant-block");
    return {
      testid,
      count: all.length,
      inBlock: block ? all.filter((el) => block.contains(el)).length : 0,
    };
  });

/** A v2 answer in the shape the service sends, so the button resolves. The
 *  `pick` is deliberately the AWAY side with the game's own vocabulary: if the
 *  summary's pick could still reach a rendered bar, this answer is what would
 *  show it, so an unplaceable-looking label here is the canary for that. */
const aiSummary = (): Explanation =>
  ({
    verdict: "Baltimore are the pick, but the line is thinner than the number.",
    band: "moderate",
    pick: { label: "Chiefs win" },
    factors: [
      { key: "moneyline", direction: "neutral", headline: "The model likes Baltimore", text: "It rates Baltimore better than Kansas City." },
    ],
    source: "template",
    model: "",
    generated_at: "2026-09-07T12:00:00Z",
    sport: "nfl",
    pick_timing: "pre_kickoff",
  }) as unknown as Explanation;

/** Press the button and wait for the summary to take its place above the flow. */
async function askForTheSummary() {
  fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
  return screen.findByTestId("fixture-summary");
}

/** The block, with the site's own prediction landed.
 *
 *  The block is on screen from the FIRST frame — it has no state and no effect,
 *  so it renders before anything resolves. That is the point of it, and it is
 *  also why awaiting the block is not awaiting its figures: with a prediction
 *  still in flight the block draws a verdict chip and a record strip and NO
 *  bar, and an assertion about the bar written right after `findByTestId` on the
 *  block passes or fails on how fast the api's promise resolved. Two of these
 *  cases were green locally and red in CI for exactly that reason.
 *
 *  So the wait is on the figure the case is about. A prediction this site has
 *  always produces a moneyline tile, whatever the kickoff; the cases that need
 *  the bar wait for its segments.
 */
async function blockWithFigures(): Promise<HTMLElement> {
  return (await screen.findByTestId("tile-moneyline")).closest<HTMLElement>(
    '[data-testid="instant-block"]',
  ) as HTMLElement;
}

/** The block, once the bar's two segments are painted. */
async function blockWithBar(): Promise<HTMLElement> {
  await screen.findAllByTestId("pbar-fill");
  return screen.getByTestId("instant-block");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["nfl", "cfb"])("GameDetailModal's instant block (%s)", (sport) => {
  it("shows the block BEFORE the button, with no request made", () => {
    const fetchSpy = blockNetwork();
    const { explain } = renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });

    // A started game plus a stored snapshot: every figure below comes from
    // props the page already held, so all of them are on screen with nothing
    // resolved.
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByTestId("tile-moneyline")).toBeInTheDocument();
    expect(within(block).getAllByTestId("pbar-fill")).toHaveLength(2);
    expect(within(block).getByTestId("record-fill")).toBeInTheDocument();
    expect(within(block).getByText("Ravens is the pick.")).toBeInTheDocument();

    // Neither the request the block must never make, nor the one it must never
    // need. The AI button has not been pressed and nothing was spent.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();

    // The button is still there, and nothing is behind it yet: the block is not
    // a placeholder that a press fills in, it is the finished answer.
    expect(screen.getByRole("button", { name: /ai summary/i })).toBeInTheDocument();
    expect(screen.queryByTestId("fixture-summary")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/Baltimore are the pick/);
  });

  it("keeps every figure EXACTLY ONCE after the button is pressed", async () => {
    blockNetwork();
    // The AI answer names the away side in the service's own vocabulary
    // ("Chiefs win"), which is the label the shared panel would have had to
    // translate onto a segment. It is here so that a summary which grew a bar
    // back would put a SECOND bar and a SECOND accent on the page and be caught
    // here rather than by a screenshot.
    const { explain } = renderModal(sport, {
      weekPrediction: snapshot(),
      weekPredictions: weekRows,
      explain: vi.fn().mockResolvedValue(aiSummary()),
    });

    // Before: the block holds every figure the game has.
    const block = screen.getByTestId("instant-block");
    const before = figureCensus();
    expect(before.find((f) => f.testid === "tile-moneyline")?.count).toBe(1);
    expect(before.find((f) => f.testid === "pbar-fill")?.count).toBe(2);
    expect(before.find((f) => f.testid === "record-fill")?.count).toBe(1);

    const summary = await askForTheSummary();
    expect(explain).toHaveBeenCalledTimes(1);

    // AFTER: not one figure has been added, removed or doubled, and not one has
    // moved out of the block. The summary is words; the numbers stayed put.
    expect(figureCensus()).toEqual(before);

    // And the census is the shape it should be, spelled out rather than left to
    // the equality above: no figure outside the block, and no market row, which
    // this site has no implied figures to fill one with.
    const after = figureCensus();
    for (const figure of after) {
      expect(figure.inBlock, `${figure.testid} rendered outside the block`).toBe(figure.count);
    }
    for (const absent of ["pbar-legend", "pbar-market-fill", "pbar-market-figures"] as const) {
      expect(after.find((f) => f.testid === absent)?.count, `${absent} was drawn`).toBe(0);
    }

    // The block never unmounted: "the summary appears above it, not instead of
    // it after a gap". Asserted on the ORDER, because a panel that unmounted and
    // remounted would satisfy an existence check while still flickering.
    // The block never unmounted: "the summary appears above it, not instead of
    // it after a gap". Asserted on the ORDER — `FOLLOWING` set on
    // `block.compare(summary)` means the summary comes after the block, which
    // is the reader's reading order: the facts, then what the words added.
    expect(
      block.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
      "the summary does not render after the block",
    ).toBeTruthy();
    // The facts and the flow are still mounted under the summary.
    expect(screen.getByTestId("fixture-flow")).toBeInTheDocument();
    expect(screen.getByTestId("instant-block")).toBe(block);
  });

  it("accents the bar segment matching the bundle's pick, and says so", async () => {
    blockNetwork();
    // The pick is the LEADING side, so with the card's 68/32 the accent belongs
    // to segment 0. Asserted on the painted colour AND the accessible name,
    // because the accent is a colour and a meaning carried by colour alone is
    // not carried at all.
    renderModal(sport, {
      weekPrediction: snapshot(),
      weekPredictions: weekRows,
      explain: vi.fn().mockResolvedValue(aiSummary()),
    });
    const block = screen.getByTestId("instant-block");
    expect(fills(block)).toHaveLength(2);
    expect(accentedAt(block)).toBe(0);
    expect(fills(block)[1]).not.toBe(ACCENT);
    expect(barName(block)).toBe("Ravens 68%, Chiefs 32%, the pick is Ravens");

    // The label the bundle names is a SEGMENT's label — the join is by string,
    // so a bundle whose pick label is not on the bar accents nothing at all.
    // This is the whole of what the accent depends on, so it is checked here
    // rather than assumed: the accented segment is the pick's, by name.
    const labels = [...block.querySelectorAll<HTMLElement>("[data-testid='pbar-label']")].map((l) => l.dataset.seg);
    expect(labels).toEqual(["Ravens", "Chiefs"]);
    expect(labels[accentedAt(block)]).toBe("Ravens");

    // And it survives the press: the summary does not re-accent, because it
    // draws no bar. The service's own answer picks "Chiefs win"; a second
    // accent on segment 1 would be the panel translating a pick into a
    // contradiction with the block's.
    const blockBefore = screen.getByTestId("instant-block");
    await askForTheSummary();
    expect(accentedAt(screen.getByTestId("instant-block"))).toBe(0);
    expect(screen.getByTestId("instant-block")).toBe(blockBefore);
  });

  it("accents the AWAY segment when the away side leads, which is the case an index would get wrong", async () => {
    blockNetwork();
    // The segments are home-first, so an accent driven by segment ORDER lands
    // on Ravens and tells the reader the model picked the side it rated LEAST
    // likely. Pre-kickoff, so today's model is the pick and the bundle supplies
    // it: away 62, home 38.
    renderModal(sport, {
      game: upcomingGame,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue({ ...fresh, home_win_prob: 0.38, away_win_prob: 0.62 }) }),
      weekPredictions: weekRows,
      explain: vi.fn().mockResolvedValue(aiSummary()),
    });
    const block = await blockWithBar();
    expect(accentedAt(block)).toBe(1);
    expect(fills(block)[0]).not.toBe(ACCENT);
    expect(barName(block)).toBe("Ravens 38%, Chiefs 62%, the pick is Chiefs");
    // The verdict line names the same team the bar accents, once, in words.
    expect(within(block).getByText("Chiefs is the pick.")).toBeInTheDocument();
    // Still exactly one accent after the button.
    await askForTheSummary();
    expect(accentedAt(screen.getByTestId("instant-block"))).toBe(1);
  });

  it("shows the record with NO pick at all, rather than dropping it", () => {
    blockNetwork();
    // A record and no pick is a bundle the block must still render: the record
    // is about past picks, not this fixture, and a guard that required a pick
    // dropped it silently. Here the week carries rows but none for this game,
    // so the strip renders and the block says the pick is absent.
    renderModal(sport, { weekPredictions: weekRows });
    const block = screen.getByTestId("instant-block");
    expect(within(block).getByText("Picks made before kickoff correct")).toBeInTheDocument();
    expect(within(block).getByText("3/4")).toBeInTheDocument();
    expect(within(block).getByText(/no pick/i)).toBeInTheDocument();
    // No moneyline tile and no bar, because there is no pick to state and a bar
    // that accents something claims there is one.
    expect(within(block).queryByTestId("tile-moneyline")).toBeNull();
    expect(within(block).queryByTestId("pbar-fill")).toBeNull();
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

    const block = await blockWithFigures();
    expect(within(block).getByText("72%")).toBeInTheDocument();
    expect(screen.queryByText(/68%/)).toBeNull();
    expect(within(block).getByText("Made before kickoff")).toBeInTheDocument();
    // The pick is stated in words, once.
    expect(within(block).getByText("Ravens is the pick.")).toBeInTheDocument();
    expect(within(block).getByTestId("tile-moneyline")).not.toHaveTextContent(/win ·/);
  });

  it("no longer repeats the markets below the panel", async () => {
    blockNetwork();
    // The fresh run below: the only thing this page may now draw from it beyond
    // the block's own tiles is the part the tiles do NOT draw — cover chance and
    // the over/under pair. Those rows have no other home in the panel, so
    // deleting them with the duplicates would lose a figure the site can state.
    renderModal(sport, {
      game: { ...startedGame, spread_line: -2.5, total_line: 46.5 },
      weekPrediction: snapshot(),
      weekPredictions: weekRows,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(fresh) }),
    });
    // Awaited on a cover row, which comes off today's fresh run: the block and
    // this section's heading are both on screen before the prediction lands, so
    // waiting on either would make the rows below a race.
    await screen.findByText("Ravens covers spread");

    // The section, and the two win-probability bars that headed it. Those bars
    // are the duplicate: the block's tile and bar already state that one pair,
    // and stating it twice is how this page came to read 68% and 72% at once.
    expect(screen.queryByText("Match Markets")).toBeNull();
    expect(screen.queryByText("Ravens win")).toBeNull();
    expect(screen.queryByText("Chiefs win")).toBeNull();
    // Spelled out in full, because a heading is a thing a rename can satisfy
    // and a row is a thing only a deletion can.
    expect(document.body.textContent ?? "").not.toMatch(/\bRavens win\b|\bChiefs win\b/);

    // The rows that are NOT duplicates survive, and the section that was renamed
    // rather than deleted is here with its new name. Partial removal is the
    // point: the cover and over/under rows exist nowhere else in the panel
    // (the shared adapter emits moneyline, spread and total only), so taking
    // them with the duplicates would have been a deletion wearing a dedup's
    // name.
    expect(screen.getByText("Other model markets")).toBeInTheDocument();
    expect(screen.getByText("Ravens covers spread")).toBeInTheDocument();
    expect(screen.getByText("Chiefs covers spread")).toBeInTheDocument();
    expect(screen.getByText("Over total points")).toBeInTheDocument();
    expect(screen.getByText("Under total points")).toBeInTheDocument();
  });

  it("no longer prints the flow's pick sentences", () => {
    blockNetwork();
    renderModal(sport, { weekPrediction: snapshot(), weekPredictions: weekRows });
    // These three left the shared package: the block's verdict line, its timing
    // chip and its rebuilt badge say all of it, once, and the flow below states
    // the result rather than restating which pick was made.
    expect(screen.queryByText(/Win probabilities/)).toBeNull();
    expect(screen.queryByText(/The model picks/)).toBeNull();
    expect(screen.queryByText(/The pick was made/)).toBeNull();
    // Asserted over the whole page, not by a scoped query, so a sentence that
    // moved into another component is still caught.
    expect(document.body.textContent ?? "").not.toMatch(/Win probabilities|The model picks|The pick was made/);
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
    // Awaited on the spread tile, because that is the figure this case needs and
    // the block is on screen before it exists: the tile comes off today's fresh
    // run, which lands a tick after the first paint.
    await screen.findByTestId("tile-spread");
    const block = screen.getByTestId("instant-block");
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
