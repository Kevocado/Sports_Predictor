/**
 * The reviewer's two live-page follow-ups, measured on the LIVE data path.
 *
 * **Why this file exists.** Phase 1 merged and went live, and the reviewer then
 * opened the live NFL modal (PIT–CLE, pre-kickoff) and found two leftovers: a bare
 * heading with nothing under it, sitting above the AI button, and an "Other model
 * markets" block whose contents were never checked against the block above it.
 * Both are asserted here rather than left to a screenshot, because both are the
 * kind of defect that a rename satisfies and only a deletion fixes.
 *
 * **The payloads below are the LIVE ones**, copied verbatim from the running
 * deployment on 2026-10-01 (`sports.40-160-91-131.sslip.io`, NFL week 4 game
 * `2026_04_PIT_CLE`; CFB week 5 game `401871049`), and they are what make these
 * cases worth having rather than invented:
 *
 *  - NFL carries all four cover/totals probabilities.
 *  - CFB carries `home_cover_prob` and `away_cover_prob` as **null** and **no
 *    `over_prob`/`under_prob` key at all**, so for that sport the totals markets
 *    have nothing to state. Asserting their ABSENCE there is the honest case:
 *    a CFB page must not grow a market the model did not produce.
 *  - The two sports' pre-kickoff moneyline pairs (`41/59` NFL, `50/50` CFB) are
 *    numerically distinct from every figure the sections below are allowed to
 *    carry, so "the moneyline is not in there" is a testable claim and not a
 *    coincidence.
 *
 * The only field changed from the live payload is `gameday`, pushed far into the
 * future, because `hasStarted` reads the wall clock: a live-dated case would
 * become a different case tomorrow. Everything the sections read — the field set,
 * the magnitudes, the nulls — is the live one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GameDetailModal } from "./GameDetailModal";
import type { GamePrediction, GameSummary, GameVerdict, SportApi, WeekPrediction } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

// ---------------------------------------------------------------------------
// The live payloads.
// ---------------------------------------------------------------------------

/** NFL week 4, PIT at CLE, pre-kickoff. Kickoff pushed forward so the case does
 *  not rot into a different one; the rest is verbatim. */
const nflGame: GameSummary = {
  game_id: "2026_04_PIT_CLE",
  season: 2026,
  week: 4,
  gameday: "2999-10-02T00:15:00",
  home_team: "CLE",
  away_team: "PIT",
  home_score: null,
  away_score: null,
  spread_line: -2.5,
  total_line: 38.5,
};

/** NFL live `/games/2026/4/2026_04_PIT_CLE/prediction`. */
const nflPrediction = {
  home_win_prob: 0.4059804061443604,
  away_win_prob: 0.5940195938556396,
  home_cover_prob: 0.4805254318219593,
  away_cover_prob: 0.5194745681780407,
  over_prob: 0.5660451531442474,
  under_prob: 0.4339548468557526,
  predicted_margin: -3.145751476287842,
  predicted_total: 40.57671356201172,
  sigma: 13.223153618916728,
  total_sigma: 12.486688413234214,
} as GamePrediction;

/** NFL live week row: `pending`, same pair, `rebuilt: false`. */
const nflWeekRow: WeekPrediction = {
  game_id: "2026_04_PIT_CLE",
  status: "pending",
  rebuilt: false,
  home_win_prob: 0.4059804061443604,
  away_win_prob: 0.5940195938556396,
  verdict: null,
};

/** CFB week 5, Western Kentucky at New Mexico State, pre-kickoff. Live. */
const cfbGame: GameSummary = {
  game_id: "401871049",
  season: 2026,
  week: 5,
  gameday: "2999-10-03T00:00:00",
  home_team: "New Mexico State",
  away_team: "Western Kentucky",
  home_score: null,
  away_score: null,
  spread_line: null,
  total_line: null,
};

/** CFB live `/games/2026/5/401871049/prediction`, verbatim — including the two
 *  cover probabilities it carries as `null` and the totals pair it does NOT
 *  carry at all. Cast, because `GamePrediction` types the totals pair as present
 *  and the live payload says otherwise; the cast is the point being recorded. */
const cfbPrediction = {
  home_win_prob: 0.5033366855301382,
  away_win_prob: 0.4966633144698618,
  home_cover_prob: null,
  away_cover_prob: null,
  predicted_margin: 0.1420685033478577,
  predicted_total: 55.1264533996582,
  sigma: 16.98585958519707,
  total_sigma: 15.998238941965075,
} as unknown as GamePrediction;

/** CFB live week row: `pending` at 63/37. */
const cfbWeekRow: WeekPrediction = {
  game_id: "401871049",
  status: "pending",
  rebuilt: false,
  home_win_prob: 0.6314425631817645,
  away_win_prob: 0.3685574368182355,
  verdict: null,
};

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

/** An api whose every call fails except the ones a case names: the network is
 *  off, so a block that quietly depends on a response cannot pass on one it
 *  already had. */
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

function renderModal(
  sport: string,
  o: { game: GameSummary; weekPrediction?: WeekPrediction; api: SportApi },
) {
  return render(
    <GameDetailModal
      game={o.game}
      api={o.api}
      weekPrediction={o.weekPrediction}
      onClose={() => {}}
      explain={vi.fn(never)}
      sport={sport}
    />,
  );
}

/** The flow, which is what renders above the AI button. */
const flow = (): HTMLElement => screen.getByTestId("fixture-flow");

/** The "Other model markets" section, located by its heading and scoped to it, so
 *  every assertion below is about THAT section and not about the page. */
function otherMarkets(): HTMLElement {
  const sections = [...document.querySelectorAll("section")].filter((s) =>
    /Other model markets/.test(s.textContent ?? ""),
  );
  expect(sections, "the Other model markets section").toHaveLength(1);
  return sections[0];
}

/** The block's moneyline tile, which is the ONE place a win probability may live. */
const moneylineTile = () => screen.getByTestId("tile-moneyline");

/** Every percentage rendered inside a container, as the digits a reader sees.
 *  Read from the rendered text rather than from the props, so a row that grew a
 *  fifth figure is caught by what is on screen and not by what was passed in. */
const percentagesIn = (container: HTMLElement): string[] =>
  (container.textContent ?? "").match(/\d+%/g) ?? [];

/** Every figure drawn inside a container that belongs to the instant block. */
const figuresOutsideBlock = (container: HTMLElement): string[] => {
  const block = screen.queryByTestId("instant-block");
  return [...container.querySelectorAll<HTMLElement>("[data-testid]")]
    .filter((el) => !/^(instant-block|tile-|pbar-|record-fill)/.test(el.dataset.testid ?? ""))
    .filter((el) => (block ? !block.contains(el) : true))
    .map((el) => `${el.dataset.testid}: ${el.textContent ?? ""}`);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * (1a) The empty pre-game heading.
 *
 * **Measured before the fix, on both sports and every state this site can reach:**
 *
 *  - `pre-game` — the flow renders ONE row and it is a heading: `CLE vs PIT`,
 *    with no sentence under it. That is the reviewer's screenshot.
 *  - a game already kicked off with no score — the site passes this as
 *    `pre-game` too (`flowState` is `finished` or `pre-game`, never `in-play`),
 *    so the SAME lone heading renders on a game in progress.
 *  - `finished` — the flow renders TWO real sentences ("The result is a win for
 *    …", "The pick rightness: …"), which is live content and must survive.
 *
 * So the heading is empty in every state that produces it, and the sentences live
 * only in `finished`. The heading is dropped by withholding the two fields the
 * vendored `FixtureFlow` builds it from, pre-game only — never by editing
 * `src/predictor-ui/`, which this PR does not touch.
 */
describe("the flow's heading is only there when it has rows under it", () => {
  it.each([
    ["nfl", () => nflGame, nflPrediction, nflWeekRow],
    ["cfb", () => cfbGame, cfbPrediction, cfbWeekRow],
  ] as const)(
    "%s: renders NOTHING in the flow pre-kickoff, not a bare heading",
    async (sport, game, prediction, weekRow) => {
      renderModal(sport, {
        game: game(),
        weekPrediction: weekRow,
        api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(prediction) }),
      });
      // Awaited on the block's moneyline tile: the page's own prediction has
      // landed, so this is the state the reviewer was looking at.
      await screen.findByTestId("tile-moneyline");

      const f = flow();
      expect(f.textContent, "the pre-game flow states nothing").toBe("");
      expect(f.children, "the pre-game flow draws no rows").toHaveLength(0);
      expect(f.querySelectorAll("h1,h2,h3,h4,h5,h6"), "the pre-game flow draws no heading").toHaveLength(0);
      // Asserted over the whole page too: a heading that moved into another
      // component is still the same leftover.
      expect(document.body.textContent ?? "").not.toMatch(
        new RegExp(`${escapeRe(game().home_team)} vs ${escapeRe(game().away_team)}`),
      );

      // Everything the pre-game page DOES owe a reader is still on screen: the
      // block's figures, and the button.
      expect(within(screen.getByTestId("instant-block")).getByTestId("tile-moneyline")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ai summary/i })).toBeInTheDocument();
    },
  );

  it.each([
    ["nfl", nflGame, nflPrediction, nflWeekRow],
    ["cfb", cfbGame, cfbPrediction, cfbWeekRow],
  ] as const)(
    "%s: renders NOTHING in the flow for a game kicked off with no score yet",
    async (sport, game, prediction, weekRow) => {
      // The same state, reached the way a live game reaches it: kickoff in the
      // past, neither score yet. `flowState` is `pre-game` here too, so this is
      // the case a reader sees on a game in progress.
      renderModal(sport, {
        game: { ...game, gameday: "2020-10-02T00:15:00" },
        weekPrediction: weekRow,
        api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(prediction) }),
      });
      await screen.findByTestId("tile-moneyline");

      const f = flow();
      expect(f.textContent).toBe("");
      expect(f.querySelectorAll("h1,h2,h3,h4,h5,h6")).toHaveLength(0);
    },
  );

  it.each([
    ["nfl", nflGame, nflPrediction, nflWeekRow],
    ["cfb", cfbGame, cfbPrediction, cfbWeekRow],
  ] as const)(
    "%s: KEEPS the finished flow's real sentences — a blanket delete would lose them",
    async (sport, game, prediction, weekRow) => {
      const verdict: GameVerdict = {
        game_id: game.game_id,
        resolved: true,
        moneyline: { hit: true, predicted: game.home_team },
        ats: null,
        totals: null,
        actual_home_score: 24,
        actual_away_score: 17,
        home_spread_line: -2.5,
        total_line: 38.5,
      };
      renderModal(sport, {
        game: { ...game, gameday: "2020-10-02T00:15:00", home_score: 24, away_score: 17 },
        weekPrediction: weekRow,
        api: offlineApi({
          gamePrediction: vi.fn().mockResolvedValue(prediction),
          gameVerdict: vi.fn().mockResolvedValue(verdict),
        }),
      });
      // The rightness sentence arrives with the reconciled verdict, which loads
      // after the first paint, so the wait is on the sentence itself.
      await screen.findByText(/The pick rightness/);

      const f = flow();
      expect(within(f).getByText(`The result is a win for ${game.home_team}.`)).toBeInTheDocument();
      expect(within(f).getByText("The pick rightness: the model's pick was right.")).toBeInTheDocument();
      // And no heading in this state either: the finished rows are sentences, and
      // the heading only ever came from the pre-game branch.
      expect(f.querySelectorAll("h1,h2,h3,h4,h5,h6")).toHaveLength(0);
    },
  );
});

/**
 * (1c) "Other model markets" carries ONLY what the instant block does not.
 *
 * The rule is one-directional: what the block draws (the moneyline tile, the
 * probability bar, the spread and total tiles) must not be restated here, and
 * what the block does not draw at all (cover chance, the totals pair, the
 * margin's own sigma) must still be here — the shared `panelFacts` adapter emits
 * moneyline, spread and total only, so taking these with the duplicates would
 * have been a deletion wearing a dedup's name.
 */
describe("Other model markets", () => {
  it("NFL: carries cover, the totals pair and sigma — and NO moneyline figure", async () => {
    renderModal("nfl", {
      game: nflGame,
      weekPrediction: nflWeekRow,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(nflPrediction) }),
    });
    // Awaited on a COVER row, not on the block: the block's moneyline tile is on
    // screen from the stored week row, a tick before the site's own prediction
    // lands, and this section is drawn entirely from that prediction. Waiting on
    // the block made these two cases green locally and red in CI for exactly that
    // reason once already.
    await screen.findByText(`${nflGame.home_team} covers spread`);
    const section = otherMarkets();

    // What it MUST carry, at the live values. 48/52 cover, 57/43 totals, and the
    // sigma the block never draws.
    expect(within(section).getByText(`${nflGame.home_team} covers spread`).parentElement).toHaveTextContent("48%");
    expect(within(section).getByText(`${nflGame.away_team} covers spread`).parentElement).toHaveTextContent("52%");
    expect(within(section).getByText("Over total points").parentElement).toHaveTextContent("57%");
    expect(within(section).getByText("Under total points").parentElement).toHaveTextContent("43%");
    expect(section).toHaveTextContent(/± 13\.2 pts/);

    // What it must NOT carry: the moneyline pair. The block states it at 41/59
    // pre-kickoff, and those two figures are in no other market on this page, so
    // finding either inside this section is the moneyline being restated.
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/41%/);
    expect(text).not.toMatch(/59%/);
    expect(text).not.toMatch(/moneyline/i);
    expect(text).not.toMatch(/win probability|win chance|likeliest|favourite|favorite/i);

    // Traced, not just read: this section draws no tile, no bar segment and no
    // record of its own — it carries the block's figures' siblings, not copies.
    expect(figuresOutsideBlock(section)).toEqual([]);
    expect(screen.getAllByTestId("tile-moneyline")).toHaveLength(1);
    expect(screen.getAllByTestId("pbar-fill")).toHaveLength(2);

    // The whole census of percentages in the section, as a SET. This is the
    // assertion that catches a moneyline added back as a fifth row: it names the
    // four figures this block is allowed to state here, so any other percentage
    // appearing anywhere in the section is a failure with the intruder in it.
    expect(percentagesIn(section).sort()).toEqual(["43%", "48%", "52%", "57%"]);

    // The block's own moneyline figure, one value, on the tile and named on the
    // bar — and nowhere in this section. Spelled out so a future reader knows
    // which number the census above is guarding against.
    expect(within(moneylineTile()).getByText("59%")).toBeInTheDocument();
    expect(percentagesIn(screen.getByTestId("instant-block"))).toContain("59%");

    // ONE measured overlap, stated rather than hidden: this section's sentence
    // restates the model's margin magnitude, which the block's spread tile also
    // carries in its own sub (`model +3.1`). Sigma, by contrast, is drawn NOWHERE
    // else on the page, which is why the sentence stays at all — so the reason it
    // cannot simply be deleted along with the restated margin is on the record
    // here, rather than being re-derived later.
    expect(screen.getByTestId("tile-spread")).toHaveTextContent("model +3.1");
    expect(section).toHaveTextContent(/Projected margin: PIT by 3\.1 ± 13\.2 pts/);
    const sigmas = screen.getAllByText(/± 13\.2/);
    expect(sigmas.length).toBeGreaterThan(0);
    for (const el of sigmas) expect(section.contains(el)).toBe(true);
  });

  it("CFB: carries sigma and NO percentage at all — the moneyline never, and the totals markets it has none of", async () => {
    renderModal("cfb", {
      game: cfbGame,
      weekPrediction: cfbWeekRow,
      api: offlineApi({ gamePrediction: vi.fn().mockResolvedValue(cfbPrediction) }),
    });
    // Awaited on the margin sentence, which is off the site's own prediction — the
    // one figure this section draws for CFB. See the NFL case for why the block
    // is the wrong thing to wait on.
    await screen.findByText(/Projected margin: New Mexico State/);
    const section = otherMarkets();

    // The live CFB payload carries no cover probability and no totals pair, so
    // there is nothing here to state and nothing is invented: no percentage at
    // all appears in this section, which is also how the moneyline's absence is
    // asserted for this sport rather than skipped.
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toMatch(/moneyline/i);
    expect(within(section).queryByText("Over total points")).toBeNull();
    expect(within(section).queryByText("Under total points")).toBeNull();
    expect(within(section).queryByText(`${cfbGame.home_team} covers spread`)).toBeNull();

    // What the live payload does carry and the block does not draw: the margin
    // and its sigma.
    expect(section).toHaveTextContent(/Projected margin: New Mexico State by 0\.1 ± 17\.0 pts/);

    // The block still owns the moneyline, exactly once.
    expect(figuresOutsideBlock(section)).toEqual([]);
    expect(screen.getAllByTestId("tile-moneyline")).toHaveLength(1);
  });

  it("survives the AI summary: the section is unchanged after the button is pressed", async () => {
    const summary = {
      verdict: "Pittsburgh rate better.",
      band: "moderate",
      pick: { label: "PIT" },
      factors: [],
      source: "template",
      model: "",
      generated_at: "2026-10-01T12:00:00Z",
      sport: "nfl",
      pick_timing: "pre_kickoff",
    };
    render(
      <GameDetailModal
        game={nflGame}
        api={offlineApi({ gamePrediction: vi.fn().mockResolvedValue(nflPrediction) })}
        weekPrediction={nflWeekRow}
        onClose={() => {}}
        explain={vi.fn().mockResolvedValue(summary)}
        sport="nfl"
      />,
    );
    await screen.findByText(`${nflGame.home_team} covers spread`);
    const before = otherMarkets().textContent;

    fireEvent.click(screen.getByRole("button", { name: /ai summary/i }));
    await screen.findByTestId("fixture-summary");

    // Words were added; no figure moved and none was doubled into this section.
    expect(otherMarkets().textContent).toBe(before);
    expect(screen.getAllByTestId("tile-moneyline")).toHaveLength(1);
    expect(figuresOutsideBlock(otherMarkets())).toEqual([]);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}