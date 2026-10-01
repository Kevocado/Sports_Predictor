/** The v2 panel as this site actually ships it: a real answer from the real
 *  service, through the real modal, over the real game and prediction.
 *
 *  Every assertion is on the RENDERED result — the background colour the browser
 *  would paint a segment, and the accessible name a screen reader would read —
 *  and never on a prop having been passed.
 *
 *  **ON WHAT CHANGED UNDER THIS FILE, AND WHY IT MATTERS.** The reviewer's fix
 *  to the shared panel made `InstantBlock` the ONLY place this site's figures
 *  appear, and made the bar's accent follow the BUNDLE's pick rather than the
 *  ANSWER's. An earlier version of this file asserted the opposite — that the
 *  accent followed the service's own `pick`, translated onto a segment by
 *  `barPick`. That path is gone from the rendered page: the summary draws no bar
 *  at all, so there is nothing on this site for `barPick` to translate onto, and
 *  the accent is decided before the button is ever pressed. What is left for
 *  this file is the half this repo still owns and can still be wrong about —
 *  that the bundle's pick is a string a segment actually carries, so the accent
 *  lands on the pick rather than on whichever segment happens to be first.
 *
 *  **On what these tests can and cannot know.** The pick's wording is supplied by
 *  this file, so no assertion here is evidence about the wording the NFL or CFB
 *  `/facts` endpoints actually use. What is asserted is this repo's half — the
 *  segment labels, and that the accent follows the bundle's pick through
 *  `pickIndex` in `ProbabilityBar` whatever label it arrives in. The
 *  service-vocabulary translation is `barPick` (`predictor-ui/lib/panelFacts.ts`),
 *  guarded in the hub.
 *
 *  **Why this file exists on a site whose call site needed only a guard.** The bar
 *  joins the pick to a segment BY LABEL (`pickIndex` in `ProbabilityBar`, spec
 *  §5b). So the accent lands only while the bundle's label and this site's
 *  segment label are the same string, and nothing but a test notices when they
 *  drift: a mismatch renders a bar with nothing accented, which is the panel's
 *  *correct* rendering of a bundle with no pick and a completely wrong one for a
 *  game that has one. It builds, it type-checks, and every other test here
 *  passes. "No change was needed" is a claim, and this is what holds it up.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GameDetailModal } from "./GameDetailModal";
import { ProbabilityBar } from "../predictor-ui";
import type { Explanation, Factor, PickRef, Segment } from "../predictor-ui";
import type { GamePrediction, GameSummary, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const ACCENT = "var(--color-pr-accent)";

/** What `ProbabilityBar` painted each segment, in order — the rendered
 *  emphasis, read off the elements the browser would colour. Scoped to the page
 *  rather than to a subtree, because "exactly one bar exists" is the claim and a
 *  subtree query would make a second bar elsewhere invisible. */
const fills = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-testid='pbar-fill']")].map(
    (f) => f.style.backgroundColor,
  );

/** Which segment carries the accent, by index. -1 when none does. */
const accentedAt = (container: HTMLElement) => fills(container).indexOf(ACCENT);

/** The DE-EMPHASIS, which is a different mechanism from the accent and fails
 *  independently of it. `dim` in `ProbabilityBar` writes an opacity onto both
 *  the segment fills and the figures, and it is driven by the selected factor
 *  rather than by the pick — so a bar can be correctly un-accented and wrongly
 *  dimmed, and only reading the opacity says which happened. */
const opacityOf =
  (selector: string) =>
  (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>(selector)].map((e) => e.style.opacity);

const fillOpacity = opacityOf("[data-testid='pbar-fill']");
const labelOpacity = opacityOf("[data-testid='pbar-label']");

/** The block — the ONE place this site draws a bar — and the graphic's name.
 *
 *  Scoped to `[data-testid="instant-block"]` rather than to a heading, because
 *  the summary deliberately draws no bar of its own (predictor-hub#52), so
 *  "the first bar on the page" and "the block's bar" are the same element and
 *  the ambiguity that used to matter here is gone. The accessible name is read as
 *  well as the colour: the accent is a colour, and a meaning carried by colour
 *  alone is not carried at all. */
const barName = (container: HTMLElement) => {
  const block = container.querySelector<HTMLElement>("[data-testid='instant-block']");
  expect(block, "the instant block is not on the page").toBeTruthy();
  const bar = block!.querySelector<HTMLElement>("[role='img']");
  expect(bar, "the block drew no bar").toBeTruthy();
  return bar!.getAttribute("aria-label") ?? "";
};

const game: GameSummary = {
  // The kickoff is deliberately far in the future. This file's subject is how
  // the PANEL joins a pick to a segment — which label, which accent, which
  // de-emphasis — and the modal now chooses the moneyline source by timing
  // (`pickProbability`): a game that has started with no stored pre-kickoff pick
  // draws no bar at all, because a fresh number must not stand in for a pick
  // made before kickoff. An unstarted fixture keeps these tests on their own
  // subject. The timing rule itself is pinned in
  // GameDetailModal.instant.test.tsx, and by the case below.
  game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2999-09-07T20:00:00Z",
  home_team: "Ravens", away_team: "Chiefs",
  home_score: null, away_score: null,
};

/** The same fixture with a kickoff in the past: started, and no stored pick. */
const startedGame: GameSummary = { ...game, game_id: "2020_01_KC_BAL", gameday: "2020-09-07T20:00:00Z" };

/** Home 62 / away 38, so the pick is the FAVOURITE and the bar is not lopsided. */
const prediction = (over: Partial<GamePrediction> = {}): GamePrediction => ({
  home_win_prob: 0.62, away_win_prob: 0.38,
  home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null,
  ...over,
});

function mockApi(over: Partial<SportApi> = {}): SportApi {
  return {
    games: vi.fn(),
    gamePrediction: vi.fn().mockResolvedValue(prediction()),
    playerProps: vi.fn().mockResolvedValue([]),
    // Phase 2: the out list has its own route on NFL. Absent here means
    // "no check ran", which the panel words as such rather than as nobody being out.
    playerOut: vi.fn().mockResolvedValue([]),
    trackRecord: vi.fn(), retrain: vi.fn(),
    gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn(), currentWeek: vi.fn(),
    hubTeams: vi.fn(), hubPlayers: vi.fn(),
    standings: vi.fn(), powerRankings: vi.fn(), predictionsBatch: vi.fn(),
    teamForm: vi.fn().mockResolvedValue({ team: "", recent_form: [] }),
    headToHead: vi.fn().mockResolvedValue({ game_id: "", meetings: [] }),
    ...over,
  };
}

/** A v2 answer in the shape the service sends. `pick` is spread in only when
 *  there is one, because the service states "no pick" by OMITTING the key and
 *  the panel acts on the absence. `factors` is overridable so a test can name a
 *  factor the panel draws no figure for. */
const v2 = (pick?: PickRef, factors?: Factor[]): Explanation =>
  ({
    verdict: "Baltimore are the pick, but the line is thinner than the number.",
    band: "moderate",
    ...(pick ? { pick } : {}),
    factors: factors ?? [
      {
        key: "moneyline",
        direction: "neutral",
        headline: "The model likes Baltimore",
        text: "It rates Baltimore better than Kansas City.",
      },
    ],
    source: "template",
    model: "",
    generated_at: new Date().toISOString(),
    sport: "nfl",
    pick_timing: "pre_kickoff",
  }) as Explanation;

async function show(
  pick?: PickRef,
  over: Partial<GamePrediction> = {},
  factors?: Factor[],
  thisGame: GameSummary = game,
  { expectBar = true }: { expectBar?: boolean } = {},
) {
  const explain = vi.fn().mockResolvedValue(v2(pick, factors));
  const out = render(
    <GameDetailModal
      game={thisGame}
      api={mockApi({ gamePrediction: vi.fn().mockResolvedValue(prediction(over)) })}
      onClose={() => {}}
      explain={explain}
    />,
  );
  // Flow-first since the rollout: the summary the assertions below read sits
  // behind the button, so every test asks for it. One funnel, so one press.
  fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
  await screen.findByTestId("fixture-summary");
  // Then wait for the BAR, which is what nearly every case in this file asserts
  // on. The summary resolves on the injected `explain` promise and the bar waits
  // on the site's own `gamePrediction`; they are different promises, so "the
  // summary is up" is not "the figures are up", and asserting on the segments
  // between them is a race CI lost before it was written down.
  //
  // `expectBar: false` for the one case whose subject is the ABSENCE of a bar —
  // it cannot wait for the thing it is proving is not there, and a wait that
  // times out there would be a second way of saying the same thing.
  if (expectBar) await screen.findAllByTestId("pbar-fill");
  return out;
}

describe("which figures the bar is drawn from", () => {
  it("draws the bar for a game that has not started, from today's model", async () => {
    // The fixture the rest of this file uses. Stated once, here, so the far-future
    // kickoff at the top of the file cannot be mistaken for an accident.
    const { container } = await show({ label: game.home_team });
    expect(fills(container)).toHaveLength(2);
  });

  it("draws NO bar for a game that has started with no stored pre-kickoff pick", async () => {
    // The same panel, a started game, and no snapshot. Today's 62/38 is a real
    // number, but it is not a pick made before kickoff — and a bar whose pick is
    // accented states that a pick exists. So there is no bar, rather than a bar
    // wearing a number the record would not judge.
    const { container } = await show({ label: startedGame.home_team }, {}, undefined, startedGame, { expectBar: false });
    expect(fills(container)).toHaveLength(0);
  });
});

describe("the accent follows the bundle's pick", () => {
  it("accents the home side when the bundle's pick is the home team", async () => {
    const { container } = await show({ label: game.home_team });
    expect(fills(container)).toHaveLength(2);
    expect(accentedAt(container)).toBe(0);
    expect(barName(container)).toBe(
      "Ravens 62%, Chiefs 38%, the pick is Ravens",
    );
  });

  it("accents the AWAY side — the second segment — when the bundle's pick is the away team", async () => {
    // The case the whole field exists for. The segments are home-first, so an
    // accent driven by segment ORDER lands on Ravens and the panel tells the
    // reader the model picked the side it rated LEAST likely: 38% accented, 62%
    // grey. This is the same shape as the BAL/KC screenshot that started all of
    // this, and it is invisible to any test that only ever picks the favourite.
    //
    // The bundle is what decides this now, and the bundle's pick is the LEADING
    // side of the pair the site already had — no request, no answer needed.
    const { container } = await show({ label: game.home_team }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    expect(accentedAt(container)).toBe(1);
    expect(fills(container)[0]).not.toBe(ACCENT);
    expect(barName(container)).toBe(
      "Ravens 38%, Chiefs 62%, the pick is Chiefs",
    );
  });

  it("joins on this site's own segment labels, and the accent is the segment, not the index", async () => {
    // WHAT IS ASSERTED HERE, PRECISELY: the labels on the bar are this site's
    // `GameSummary` team names, and the accent lands on the segment carrying the
    // bundle's pick label. That is the half this repo owns and can be wrong
    // about — the modal builds the pick label as one of the two team names, and
    // the shared adapter builds the segment labels the same way, so the join is
    // by construction here and by string equality at run time.
    //
    // WHAT IS *NOT* EVIDENCE OF ANYTHING: the service's own pick wording. It is
    // supplied by this test, and since predictor-hub#52 the answer's pick reaches
    // no rendered figure on this site at all — the block above already states the
    // pick and the summary draws no bar. So this test is about the bundle's
    // vocabulary, and the answer's is asserted to be inert two tests below.
    const { container } = await show({ label: game.home_team }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    const labels = [...container.querySelectorAll<HTMLElement>("[data-testid='pbar-label']")].map(
      (l) => l.dataset.seg,
    );
    expect(labels).toEqual([game.home_team, game.away_team]);
    expect(accentedAt(container)).toBe(labels.indexOf(game.away_team));
  });

  it("is already painted BEFORE the button, and the answer cannot move it", async () => {
    // THE ORDER, and it is the substance of the change. The accent is derived
    // from the bundle, so it is correct on the first frame: a reader who never
    // presses anything still sees which side was picked. Pressing the button
    // must not move it — and this test is what would fail if the summary ever
    // grew a bar, since a second bar with the service's own pick on it would
    // put a second accent on the page.
    const explain = vi.fn().mockResolvedValue(v2({ label: `${game.away_team} win` }));
    const { container } = render(
      <GameDetailModal
        game={game}
        api={mockApi({ gamePrediction: vi.fn().mockResolvedValue(prediction({ home_win_prob: 0.38, away_win_prob: 0.62 })) })}
        onClose={() => {}}
        explain={explain}
      />,
    );

    // Before: the pick is accented with nothing spent. Awaited on the bar
    // rather than on the block, because the block is on screen from the first
    // frame and the bar appears when the site's own prediction lands — the point
    // being that it needs the SITE's request, not the summary's.
    expect(explain).not.toHaveBeenCalled();
    await screen.findAllByTestId("pbar-fill");
    expect(accentedAt(container)).toBe(1);
    expect(barName(container)).toBe("Ravens 38%, Chiefs 62%, the pick is Chiefs");

    // After: the SAME single bar, the SAME accent, and the answer's own wording
    // ("Chiefs win") drawn nowhere — it cannot be a segment label, so nothing
    // renders it, and there is no second bar to put it on.
    fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
    await screen.findByTestId("fixture-summary");
    expect(fills(container)).toHaveLength(2);
    expect(accentedAt(container)).toBe(1);
    expect(container.textContent).not.toContain("Chiefs win");
  });

  it("leaves the accent where the bundle put it when the answer names a team this game does not feature", async () => {
    // The fail-closed half, and now a statement about this site's page rather
    // than about one bar. An unplaceable answer used to be translated by
    // `barPick` onto a segment, or returned unchanged so a bar could fail closed.
    // The bar now lives in the block and is handed the BUNDLE's pick, so the
    // answer's pick is inert by construction — and inert is the right property:
    // the accent is a claim about what the site picked, and only the site's own
    // figures can support that claim.
    const { container } = await show({ label: "BUF win" }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    // The bundle says Chiefs, so Chiefs is accented and the answer's BUF changes
    // nothing at all: no new bar, no second accent, no "BUF" anywhere.
    expect(accentedAt(container)).toBe(1);
    expect(fills(container)).toHaveLength(2);
    expect(barName(container)).toBe("Ravens 38%, Chiefs 62%, the pick is Chiefs");
    expect(container.textContent).not.toContain("BUF");
    // And no factor claims to be for or against a pick.
    expect(container.textContent).not.toMatch(/for the pick|against it/i);
  });

  it("says nothing about a pick on a no-pick answer, in words as well as in colour", async () => {
    // §13's rule, from the other end: the answer having no pick must not put a
    // claim about a pick anywhere on the page — and the block's own pick, which
    // comes from the site's own leading side, is the only one there is. The
    // factors here are `neutral`, so they read "context" and draw no triangle.
    const { container } = await show(undefined);
    expect(container.textContent).not.toMatch(/for the pick|against it/i);
    expect(container.textContent).toContain("context");
    expect(container.querySelector("svg[data-direction]")).toBeNull();
  });
});

describe("the market row, and why this site does not draw one", () => {
  /** Measured, not assumed. The NFL moneyline's implied figures are NOT
   *  reachable from this site:
   *
   *  - the NFL API's `/games` returns the schedule rows, which carry
   *    `spread_line` and `total_line` and **no moneyline price for either side**;
   *  - `/games/{season}/{week}/{id}/prediction` carries the model's own
   *    probabilities and nothing from a book;
   *  - the odds join DOES exist in the NFL API (`data/odds_api.py`, the h2h feed
   *    from The Odds API, and `odds/value_bets.py`), but `value_bets` is
   *    imported by `api/routes.py` and exposed by **no route**, so no endpoint
   *    this site consumes returns an implied moneyline;
   *  - and the explainer's own facts bundle carries the moneyline market with the
   *    MODEL's numbers only — `{"market": "moneyline", "model": {...}}` — so even
   *    the service has no second split to quote.
   *
   *  §13b says omit the row rather than draw a comparison the reader cannot make,
   *  and there is nothing here to fill it honestly. So it is omitted, and this
   *  test is what holds that omission honest: if implied moneyline data ever
   *  reaches the site, it fails and the row becomes a decision rather than an
   *  oversight.
   */
  it("draws no market row, because the site has no implied moneyline to fill one with", async () => {
    const { container } = await show({ label: game.home_team });
    expect(container.querySelector("[data-testid='pbar-legend']")).toBeNull();
    expect(container.querySelector("[data-testid='pbar-market-figures']")).toBeNull();
    expect(container.querySelector("[data-testid='pbar-market-fill']")).toBeNull();
  });

  it("does not synthesise a market row out of the model's own probabilities", async () => {
    // The one way this row can be shipped wrong while looking right: a legend
    // built from `home_win_prob`/`away_win_prob` renders the model compared with
    // itself — two bars, the same numbers, the same widths, reading exactly like
    // a working market comparison. A lopsided model is the case most likely to
    // tempt it, so that is the case asserted.
    const { container } = await show(
      { label: game.home_team },
      { home_win_prob: 0.91, away_win_prob: 0.09 },
    );
    expect(container.querySelector("[data-testid='pbar-legend']")).toBeNull();
    // The model's own figures are on the bar and nowhere else.
    expect(barName(container)).toBe(
      "Ravens 91%, Chiefs 9%, the pick is Ravens",
    );
  });

  it("still draws the bar's own figures at full size, since there is no row to collide with", async () => {
    // `expandable` is the control that collapses the market row's labels on a
    // narrow surface. This site passes no legend, so the control would never
    // render and the prop is left at its default of off — opting in would be
    // opting in to a viewport this modal does not have (`max-w-3xl`, and the
    // measured collision is at 260px). Pinned so a future opt-in is a decision
    // someone makes rather than a leftover.
    const { container } = await show({ label: game.home_team });
    expect(container.querySelector("[data-testid='pbar-market-toggle']")).toBeNull();
    expect(container.querySelectorAll("[data-testid='pbar-label']")).toHaveLength(2);
    await waitFor(() => expect(container.querySelector("[data-testid='pbar-fill']")).not.toBeNull());
  });
});

/** §13c's step-through-the-figures: select a factor, the figure it names lights
 *  and the rest fade. The bar in the block is the only figure on this page, and
 *  **as of predictor-hub#52 nothing can select it** — see the note on the last
 *  case. The mechanism is still there and still tested, at the component; what
 *  this site cannot yet do is reach it.
 */
describe("the de-emphasis, and the linkage the block cannot yet make", () => {
  const withLine: GameSummary = { ...game, spread_line: -2.5 };
  const spreadFactor: Factor[] = [
    { key: "spread", direction: "up", headline: "The line is out of line", text: "Model and market disagree." },
  ];

  it("fades no figure while nothing is selected, so the next case is not vacuous", async () => {
    // The control. A `dim` that had stopped working entirely would render exactly
    // this, which is why the case that follows is written as a *failing* test
    // rather than a passing one: it is the only way to tell "nothing is selected"
    // apart from "selection does nothing".
    const { container } = await show(
      { label: game.home_team },
      { predicted_margin: 3.1 },
      spreadFactor,
      withLine,
    );
    expect(fillOpacity(container)).toEqual(["1", "1"]);
    expect(labelOpacity(container)).toEqual(["1", "1"]);
    expect(container.querySelector("[data-highlighted='true']")).toBeNull();
  });

  it("still honours highlightKey when something DOES select a figure", () => {
    // The mechanism, tested at the component it lives in rather than through a
    // page that cannot reach it. `dim` is driven by `highlightKey`, and the
    // de-emphasis is per MARKET, not per segment — so `spread` fades both
    // moneyline segments, while a factor naming `moneyline` fades neither.
    //
    // A site test rather than a hub test, because the thing being protected is
    // what this site SHIPS: when the wiring is restored this is the behaviour it
    // will get, and if a re-vendor ever loses it this is what says so.
    const segments: Segment[] = [
      { label: game.home_team, prob: 0.62, market: "moneyline" },
      { label: game.away_team, prob: 0.38, market: "moneyline" },
    ];
    const off = render(<ProbabilityBar segments={segments} highlightKey="spread" />);
    const spans = [...off.container.querySelectorAll<HTMLElement>("[data-testid='pbar-fill']")];
    expect(spans.map((s) => s.style.opacity)).toEqual(["0.4", "0.4"]);

    const on = render(<ProbabilityBar segments={segments} highlightKey="moneyline" />);
    const onSpans = [...on.container.querySelectorAll<HTMLElement>("[data-testid='pbar-fill']")];
    expect(onSpans.map((s) => s.style.opacity)).toEqual(["1", "1"]);
  });

  it.fails("a selected factor still lights the figure it names on this page", async () => {
    // A KNOWN GAP, written as a failing test on purpose, and the reason is in
    // the PR rather than only here.
    //
    // What predictor-hub#52 changed: `FixtureExplainer`'s summary state stopped
    // passing `tiles`/`segments` to `ExplainerPanel`, because the instant block
    // above already draws them and a second copy was the overlap the change
    // exists to remove. Correct, and it is why every figure is now drawn once.
    // The cost: `ExplainerPanel` computes `linkable(key)` from those props, so
    // with none passed every key is unlinkable, `selectFactor` always resolves
    // to `null`, and the factor rows became controls that change nothing on
    // screen. `aria-pressed` stays "false" for every row and no figure is ever
    // dimmed.
    //
    // This is a hub-level consequence and every site that vendors the package
    // has it; the site cannot fix it alone, because `InstantBlock` takes no
    // highlight key and `FixtureExplainer` exposes no way to pass one. So it is
    // recorded as `it.fails`: the moment the hub lifts the selection out to the
    // explainer (or hands `InstantBlock` the highlighted key) this test starts
    // passing and vitest reports the failing case as resolved, which is the
    // signal to promote it and delete this comment. Keeping it green instead
    // would have asserted the defect as intent.
    const { container } = await show(
      { label: game.home_team },
      { predicted_margin: 3.1 },
      spreadFactor,
      withLine,
    );
    fireEvent.click(screen.getByTestId("factor-spread"));
    expect(fillOpacity(container)).toEqual(["0.4", "0.4"]);
    expect(labelOpacity(container)).toEqual(["0.4", "0.4"]);
    expect(screen.getByTestId("factor-spread")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the factor rows' own state honest rather than pretending a link exists", async () => {
    // While the gap above stands, a row must not LOOK selected while changing
    // nothing — the `FactorList` half of the fix (the pressed row) and the
    // un-pressed half. Asserted on the attribute a screen reader reads, because
    // that is what a reader is told.
    const { container } = await show({ label: game.home_team });
    fireEvent.click(screen.getByTestId("factor-moneyline"));
    expect(screen.getByTestId("factor-moneyline")).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("[data-highlighted='true']")).toBeNull();
    expect(fillOpacity(container)).toEqual(["1", "1"]);
  });
});

describe("the flow stands alone when the explainer is unreachable", () => {
  it("shows the flow's text with no request made and no error in its place", async () => {
    // The explainer rejects: a dead container, a proxy 502, a timeout. The
    // modal must still say what it knows from its own data, and must not
    // spend a request it was never asked to make.
    //
    // **On the fixture being a FINAL and not the pre-game one above.** This case
    // used to assert `Ravens vs Chiefs`, which was the pre-game flow's ONLY row
    // and so its only evidence that the flow rendered anything. Since the empty
    // pre-game heading came out (see `flowName` in GameDetailModal.tsx and
    // GameDetailModal.leftovers.test.tsx, which pins the pre-game case for both
    // sports), a pre-game fixture has no text to assert here at all and the test
    // name would be describing nothing. A final is the state where the flow DOES
    // word something from local facts — the result — so the case tests what it
    // says it tests, on real rendered text, and the unreachable-explainer
    // condition is unchanged.
    const explain = vi.fn().mockRejectedValue(new Error("unreachable"));
    const finalGame: GameSummary = { ...game, gameday: "2020-09-07T20:00:00Z", home_score: 24, away_score: 17 };
    render(
      <GameDetailModal
        game={finalGame}
        api={mockApi({
          gameVerdict: vi.fn().mockResolvedValue({
            game_id: finalGame.game_id, resolved: true,
            moneyline: { hit: true, predicted: "Ravens" }, ats: null, totals: null,
            actual_home_score: 24, actual_away_score: 17,
          }),
        })}
        onClose={() => {}}
        explain={explain}
      />,
    );
    // Awaited on the flow's own sentence, which lands with the reconciled verdict
    // rather than on the first paint.
    const flowEl = await screen.findByText("The result is a win for Ravens.");
    expect(flowEl.closest('[data-testid="fixture-flow"]')).toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
    // The button offers the summary; no alert, no empty panel.
    expect(screen.getByRole("button", { name: /ai summary/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("fixture-summary")).toBeNull();
  });
});
