/** The figures the v2 panel draws, mapped from what this site already fetches.
 *
 *  The panel renders no figure of its own: it draws what the caller hands it.
 *  So this mapping is where the explainer's answer meets the site's own
 *  prediction response, and it is the only place a number reaches the panel from
 *  NFL or CFB data.
 *
 *  Four rules, each of which has a test below:
 *
 *  - **The spread tile names the home team, and puts BOTH of its numbers in the
 *    home team's own convention.** `spread_line` arrives in the home frame and
 *    `predicted_margin` is home minus away, so the disagreement between them is
 *    a subtraction in that one frame and nothing else. The derivation, quoting
 *    the field's own definition, is at the tile.
 *  - **A market the data does not carry is not passed at all.** No placeholder,
 *    no dash, no zero. `KeyNumberTile` renders nothing for an empty value, so the
 *    honest move is to omit the tile rather than pass an empty one — an empty
 *    string would work today and would be indistinguishable from a real "no value"
 *    market tomorrow.
 *  - **The segments carry the `market` key**, so a factor that references
 *    "moneyline" highlights the bar rather than being a label nobody can connect.
 *  - **`fmt` owns every number.** `pct`, `stat`, `signed` and `spread` are the
 *    family's one place for rounding, signs and team names, so a figure rendered
 *    here reads identically to every other figure on the site. Writing a
 *    `toFixed` in this file would be the same "two owners of a number" mistake as
 *    `contract.py`.
 */
import { pct, signed, spread, stat } from "../predictor-ui";
import type { MarketTile, PickRef, Segment } from "../predictor-ui";
import type { GamePrediction, GameSummary } from "../types";

/** A probability is only a probability if it is one. A missing field is not 0. */
function prob(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1 ? x : null;
}

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function panelFacts(game: GameSummary, prediction: GamePrediction | null | undefined) {
  const tiles: MarketTile[] = [];
  const segments: Segment[] = [];
  if (!prediction) return { tiles, segments };

  const home = prob(prediction.home_win_prob);
  const away = prob(prediction.away_win_prob);

  if (home !== null && away !== null) {
    // Home first, because that is the order a fixture is written in and the
    // order the family has always used for a two-way bar.
    segments.push(
      { label: game.home_team, prob: home, market: "moneyline" },
      { label: game.away_team, prob: away, market: "moneyline" },
    );
    // The tile carries the LEADING side, because a tile whose value is the
    // underdog's number answers a question nobody asked. The bar below already
    // carries both.
    const lead = home >= away
      ? { team: game.home_team, p: home }
      : { team: game.away_team, p: away };
    tiles.push({
      market: "moneyline",
      label: "moneyline",
      value: pct(lead.p),
      sub: `win · ${lead.team}`,
    });
  }

  // The spread tile needs BOTH the market's line and the model's own margin: a
  // tile showing only the line would be the market's number, and a tile showing
  // only the margin would be a figure with nothing to disagree with. The
  // disagreement is the point.
  //
  // **THE FRAME: the home team's, because that is the frame the field arrives
  // in.** `game_outcome.py:77-81` (NFL_Predictor — the source of truth for both
  // fields, CFB's identical) reads:
  //
  //     margin ~ Normal(predicted_margin, sigma). home_win_prob = P(margin > 0).
  //     spread_line follows nflverse's convention: the home team's expected
  //     margin (positive means home favored by that many points, negative means
  //     home is an underdog by that many points) — the home team covers when
  //     margin > spread_line.
  //
  // So `predicted_margin` is home minus away and `spread_line` is ALREADY the
  // home team's own line: `spread_line: -2.5` is the home team RECEIVING 2.5,
  // not giving it, and the disagreement between the two fields is
  // `predicted_margin - spread_line` with both read in the home frame. A -3.4
  // margin against a -2.5 line is 0.9 points of disagreement about the home
  // team, and it is nothing else.
  //
  // Hence: this tile names the HOME team, always. Naming the FAVOURED team — as
  // it used to — relabelled a home-frame number with the away team's name
  // whenever the model happened to favour the away side, which put the reader's
  // team on the wrong side of their own line, and picked the name off the
  // MODEL's probabilities while showing the MARKET's figure. The home team is
  // named because the field says so, so nothing here reads `home_win_prob` or
  // `away_win_prob`.
  //
  // `spread(team, line)` writes a line the way a bettor reads one — a minus is
  // points that team GIVES — so the home team's own line is `-spread_line`, and
  // `spread_line: -2.5` renders "KC +2.5", the same fact the modal already shows
  // on its own line (`GameDetailModal.tsx:259`). **Both** numbers take that one
  // sign flip. Flipping one without the other leaves the tile doing arithmetic
  // the reader can see and get a different answer from: "KC +2.5" beside
  // "model -3.4" reads as 5.9 points of disagreement when the real figure is
  // 0.9, which is the tile's whole subject.
  const margin = num(prediction.predicted_margin);
  const line = num(game.spread_line);
  if (margin !== null && line !== null) {
    tiles.push({
      market: "spread",
      label: "spread",
      value: spread(game.home_team, -line),
      sub: `model ${signed(-margin)}`,
    });
  }

  const total = num(prediction.predicted_total);
  const totalLine = num(game.total_line);
  if (total !== null && totalLine !== null) {
    tiles.push({
      market: "total",
      label: "total",
      value: stat(total),
      sub: `total pts · line ${stat(totalLine)}`,
    });
  }

  return { tiles, segments };
}

/** What PL's `/facts` calls the two sides. `match_pick` in the PL API's facts
 *  module words the pick `"<team> win"`; this is the only suffix the family's
 *  explainers are known to add to a team name, and it is the whole reason the
 *  bar needs translating at all. */
const WIN_SUFFIX = " win";

/** The answer's pick, in the vocabulary THIS site's bar is drawn in.
 *
 *  The bar joins the pick to a segment **by label** (`pickIndex` in
 *  `ProbabilityBar`, spec §5b: the service derives the pick and the renderer
 *  follows it). The NFL and CFB `/facts` endpoints build the pick as
 *  `{"label": game["home_team"]}` (`api/facts.py:110-111` and `cfb/.../facts.py:
 *  97-98`) — the bare team name, the same string this site labels its segments
 *  with — so today the two match exactly and the join is a no-op.
 *
 *  **That is a coincidence of two independent call sites, not a contract**, and
 *  it is the defect PL shipped: PL's facts said "Arsenal win" where the site said
 *  "Arsenal", so a fixture with a real pick rendered a bar with nothing accented.
 *  That is the panel's *correct* rendering of a bundle with **no pick**, printed
 *  directly under a verdict sentence naming one — a green build, green tests, and
 *  a panel that contradicts the sentence above it. If NFL or CFB rewords its pick
 *  to "Ravens win" tomorrow, this site renders exactly that, silently.
 *
 *  So the same translating helper PL has, ported here rather than reinvented: an
 *  exact label passes through, a trailing " win" is dropped and the bare name
 *  re-joined to a segment, and anything that still cannot be placed is returned
 *  **unchanged** so the bar fails closed — nothing accented — rather than
 *  accenting the nearest segment to a claim nobody made. Failing closed is the
 *  point: "no accent" is a state this panel already renders correctly for a
 *  genuine no-pick answer, so an unplaceable label degrades to a known-truthful
 *  rendering instead of a wrong one.
 *
 *  Only the STRING moves. The pick's identity — which side, and at what
 *  probability — is the service's, derived server-side from the validated facts,
 *  and is never re-derived here from this site's own numbers: a site that worked
 *  the pick out for itself would reintroduce the exact defect the field exists
 *  to remove, and would accent whichever segment happened to be widest.
 *
 *  Takes a pick rather than a pick-or-nothing on purpose. The contract states "no
 *  pick" by OMITTING the key and never as `null` ("`is there a pick` stays one
 *  question with one answer"), so whether there is a pick is the caller's
 *  question to ask before it gets here; this function only ever translates one
 *  that exists, and cannot turn a real pick into `null` on the way through.
 */
export function barPick(pick: PickRef, segments: Segment[]): PickRef {
  if (segments.some((s) => s.label === pick.label)) return pick;
  if (!pick.label.endsWith(WIN_SUFFIX)) return pick;
  const bare = pick.label.slice(0, -WIN_SUFFIX.length);
  const match = segments.find((s) => s.label === bare);
  return match ? { ...pick, label: match.label } : pick;
}
