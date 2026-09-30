/** The v2 panel as this site actually ships it: a real answer from the real
 *  service, through the real modal, over the real game and prediction.
 *
 *  Every assertion is on the RENDERED result — the background colour the browser
 *  would paint a segment, and the accessible name a screen reader would read —
 *  and never on a prop having been passed.
 *
 *  **On what these tests can and cannot know.** The pick's wording is supplied by
 *  this file, so no assertion here is evidence about the wording the NFL or CFB
 *  `/facts` endpoints actually use. What is asserted is this repo's half — the
 *  segment labels, and that the accent follows the pick's label through
 *  `barPick` whatever vocabulary it arrives in. The vocabulary itself is guarded
 *  in `src/lib/panelFacts.test.ts`, where both the service's current shape and
 *  the unplaceable case are covered.
 *
 *  **Why this file exists on a site whose call site needed only a guard.** The bar
 *  joins the pick to a segment BY LABEL (`pickIndex` in `ProbabilityBar`, spec
 *  §5b). So the accent lands only while the service's label and this site's
 *  segment label are the same string, and nothing but a test notices when they
 *  drift: a mismatch renders a bar with nothing accented, which is the panel's
 *  *correct* rendering of a bundle with no pick and a completely wrong one for a
 *  game that has one. It builds, it type-checks, and every other test here
 *  passes. "No change was needed" is a claim, and this is what holds it up.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GameDetailModal } from "./GameDetailModal";
import type { Explanation, Factor, PickRef } from "../predictor-ui";
import type { GamePrediction, GameSummary, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const ACCENT = "var(--color-pr-accent)";

/** What `ProbabilityBar` painted each segment, in order — the rendered
 *  emphasis, read off the elements the browser would colour. */
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

/** The panel's own graphic, and its accessible name.
 *
 *  Scoped deliberately: this modal renders other `role="img"` elements (the team
 *  logos), so `getByRole("img")` alone is ambiguous here. The bar is the graphic
 *  inside the "In plain English" section, and it is found by that rather than by
 *  its role, so a logo added to the modal later cannot make these assertions
 *  quietly point at the wrong element. */
const barName = (container: HTMLElement) => {
  const panel = [...container.querySelectorAll("section")].find((s) =>
    s.textContent?.includes("In plain English"),
  );
  expect(panel, "the plain-English panel is not on the page").toBeTruthy();
  const bar = panel!.querySelector<HTMLElement>("[role='img']");
  expect(bar, "the panel drew no bar").toBeTruthy();
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
  await screen.findByText(/Baltimore are the pick/);
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
    const { container } = await show({ label: startedGame.home_team }, {}, undefined, startedGame);
    expect(fills(container)).toHaveLength(0);
  });
});

describe("the accent follows the pick", () => {
  it("accents the home side when the pick is the home team", async () => {
    const { container } = await show({ label: game.home_team });
    expect(fills(container)).toHaveLength(2);
    expect(accentedAt(container)).toBe(0);
    expect(barName(container)).toBe(
      "Ravens 62%, Chiefs 38%, the pick is Ravens",
    );
  });

  it("accents the AWAY side — the second segment — when the pick is the away team", async () => {
    // The case the whole field exists for. The segments are home-first, so an
    // accent driven by segment ORDER lands on Ravens and the panel tells the
    // reader the model picked the side it rated LEAST likely: 38% accented, 62%
    // grey. This is the same shape as the BAL/KC screenshot that started all of
    // this, and it is invisible to any test that only ever picks the favourite.
    const { container } = await show({ label: game.away_team }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    expect(accentedAt(container)).toBe(1);
    expect(fills(container)[0]).not.toBe(ACCENT);
    expect(barName(container)).toBe(
      "Ravens 38%, Chiefs 62%, the pick is Chiefs",
    );
  });

  it("joins on this site's own segment labels, and the accent is the segment, not the index", async () => {
    // WHAT IS ASSERTED HERE, PRECISELY: the labels on the bar are this site's
    // `GameSummary` team names, and the accent lands on the segment carrying the
    // pick's label. That is the half this repo owns and can be wrong about.
    //
    // WHAT IS *NOT* EVIDENCE OF ANYTHING: the service's own pick wording. It is
    // supplied by this test — `{ label: game.away_team }` is written here, by
    // the same author as the segments it is expected to match, so a passing
    // assertion cannot tell you the NFL or CFB `/facts` endpoint words its pick
    // this way. It is an assumption, not a measurement, and the previous version
    // of this test claimed otherwise.
    //
    // The real guard against divergence is `barPick` (`src/lib/panelFacts.ts`),
    // wired into the modal: it re-joins the service's wording onto a segment
    // this site can name, and returns anything it cannot place UNCHANGED so the
    // bar fails closed. Its own tests cover the two vocabularies and the
    // unplaceable case; this test covers the wiring that applies it. The case
    // below is the one that motivates all of it.
    const { container } = await show({ label: game.away_team }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    const labels = [...container.querySelectorAll<HTMLElement>("[data-testid='pbar-label']")].map(
      (l) => l.dataset.seg,
    );
    expect(labels).toEqual([game.home_team, game.away_team]);
    expect(accentedAt(container)).toBe(labels.indexOf(game.away_team));
  });

  it("still accents the right segment when the service words its pick '<team> win'", async () => {
    // The regression PL shipped, in the exact shape it took there: a pick whose
    // label is not a segment label matches nothing, and a bar with nothing
    // accented is the panel's correct rendering of a bundle with NO pick — printed
    // under a verdict that names one. Green build, green tests, wrong panel.
    // `barPick` re-joins "Chiefs win" onto the "Chiefs" segment; without it this
    // renders `accentedAt() === -1` and every other test in this file still passes.
    const { container } = await show({ label: `${game.away_team} win` }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    expect(accentedAt(container)).toBe(1);
    expect(barName(container)).toBe("Ravens 38%, Chiefs 62%, the pick is Chiefs");
  });

  it("accents nothing, rather than the wrong segment, when the pick names a team this game does not feature", async () => {
    // The fail-closed half, which is the only safe half. An unplaceable label is
    // returned unchanged by `barPick`, so the bar renders its genuine no-pick
    // state — indistinguishable from a real no-pick answer, which is the point.
    // Accenting the nearest segment instead would put a claim on screen that the
    // service never made, which is worse than showing none.
    const { container } = await show({ label: "BUF win" }, { home_win_prob: 0.38, away_win_prob: 0.62 });
    expect(accentedAt(container)).toBe(-1);
    // And no factor claims to be for or against a pick, either.
    expect(container.textContent).not.toMatch(/for the pick|against it/i);
  });

  it("still accents nothing when the answer genuinely has no pick", async () => {
    // The control, and the reason the tests above mean anything. A bar that
    // emphasises something is claiming there is a pick; this is the exact shape a
    // failed join impersonates, so it has to stay reachable and stay distinct.
    const { container } = await show(undefined);
    const tones = fills(container);
    expect(tones).toHaveLength(2);
    expect(tones).not.toContain(ACCENT);
    expect(new Set(tones).size).toBe(2);
    expect(barName(container)).toBe("Ravens 62%, Chiefs 38%");
  });

  it("says nothing about a pick on a no-pick answer, in words as well as in colour", async () => {
    // §13's rule, from the other end: with no pick, no row may claim to be for or
    // against one. The factors here are `neutral`, so they read "context" and
    // draw no triangle.
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

describe("an unplaceable pick fails closed, in the de-emphasis as well as the accent", () => {
  it("dims no figure when the pick names a team this game does not feature", async () => {
    // The de-emphasis half of the fail-closed guarantee. The accent half is
    // already pinned above ("accents nothing, rather than the wrong segment…"),
    // but it is a DIFFERENT mechanism: `dim` is driven by the selected factor,
    // not by the pick, so a bar can be correctly un-accented and wrongly dimmed
    // at the same time and no assertion on `backgroundColor` can see it.
    //
    // "BUF win" is the same unplaceable label that test uses, so the two agree
    // on what one looks like rather than each inventing a shape.
    const { container } = await show({ label: "BUF win" }, { home_win_prob: 0.38, away_win_prob: 0.62 });

    // The accent half, restated because the two are asserted together here.
    expect(accentedAt(container)).toBe(-1);

    // The dim half: every figure at full opacity, and the whole list asserted so
    // a figure that stopped rendering an opacity fails rather than passing as
    // "not dimmed".
    expect(fillOpacity(container)).toEqual(["1", "1"]);
    expect(labelOpacity(container)).toEqual(["1", "1"]);
  });

  it("dims the bar's figures once a factor IS selected, so the assertion above is not vacuous", async () => {
    // The control, and the reason the test above means anything. A `dim` that
    // had stopped working entirely would ALSO render `["1","1"]` for an
    // unplaceable pick — the same class of silent breakage, in the opposite
    // direction, and equally invisible to a green suite.
    //
    // `spread` is the key that makes it work. Both segments carry the
    // `moneyline` market, so a factor naming `moneyline` dims nothing (the
    // de-emphasis is per MARKET, not per segment) — which is why this needs a
    // SECOND tile: a spread tile is linkable, and no segment is about the
    // spread, so `dim` fades both. The tile needs the market's line and the
    // model's margin together, so the game carries `spread_line` and the
    // prediction carries `predicted_margin`.
    const withLine: GameSummary = { ...game, spread_line: -2.5 };
    const { container } = await show(
      { label: game.home_team },
      { predicted_margin: 3.1 },
      [{ key: "spread", direction: "up", headline: "The line is out of line", text: "Model and market disagree." }],
      withLine,
    );
    fireEvent.click(screen.getByTestId("factor-spread"));

    expect(fillOpacity(container)).toEqual(["0.4", "0.4"]);
    expect(labelOpacity(container)).toEqual(["0.4", "0.4"]);

    // The row that asked for the light is the row that is pressed, and the
    // highlight is announced as well as painted.
    expect(screen.getByTestId("factor-spread")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("factor-spread")).toHaveAttribute("data-highlighted", "true");
  });

  it("dims nothing at all when the selected factor names a figure the panel does not draw", async () => {
    // The other half of the linkage, and the one that was a defect until the
    // library made a key with no figure behind it CLEAR the highlight instead of
    // setting one. A factor is a reference to a figure; a key that resolves to
    // nothing used to be forwarded as though it did, and `dim` then faded every
    // figure in the panel with none lit — the worst of the three outcomes,
    // because the reader is left with less than before they pressed anything.
    //
    // This is not a rare shape: `template.py` always emits a `record` row and
    // pads with `context`, and neither is a market, so on a no-pick panel every
    // row is unlinkable. `linkable()` in `ExplainerPanel` now turns such a press
    // into a light that goes off, which is a change the reader can see and undo.
    const unlinkable: Factor[] = [
      { key: "record", direction: "neutral", headline: "Model record", text: "It has been good." },
      {
        key: "moneyline",
        direction: "up",
        headline: "The model likes Baltimore",
        text: "It rates Baltimore better than Kansas City.",
      },
    ];
    const { container } = await show({ label: game.home_team }, {}, unlinkable);

    fireEvent.click(screen.getByTestId("factor-record"));
    expect(fillOpacity(container)).toEqual(["1", "1"]);
    expect(labelOpacity(container)).toEqual(["1", "1"]);
    expect(screen.getByTestId("factor-record")).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("[data-highlighted='true']")).toBeNull();

    // And the row that DOES name a drawn figure still lights it, so the test
    // above is about the key resolving rather than about selection being inert.
    fireEvent.click(screen.getByTestId("factor-moneyline"));
    expect(screen.getByTestId("factor-moneyline")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the flow stands alone when the explainer is unreachable", () => {
  it("shows the flow's text with no request made and no error in its place", async () => {
    // The explainer rejects: a dead container, a proxy 502, a timeout. The
    // modal must still say what it knows from its own data, and must not
    // spend a request it was never asked to make.
    const explain = vi.fn().mockRejectedValue(new Error("unreachable"));
    render(<GameDetailModal game={game} api={mockApi()} onClose={() => {}} explain={explain} />);
    expect(await screen.findByTestId("fixture-flow")).toBeInTheDocument();
    expect(screen.getByText("Ravens vs Chiefs")).toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
    // The button offers the summary; no alert, no empty panel.
    expect(screen.getByRole("button", { name: /ai summary/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("fixture-summary")).toBeNull();
  });
});
