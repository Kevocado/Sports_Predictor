/** The figures the v2 panel draws, mapped from what this site already fetches.
 *
 *  The panel renders no figure of its own: it draws what the caller hands it.
 *  So this mapping is where the explainer's answer meets the site's own
 *  prediction response, and it is the only place a number reaches the panel from
 *  NFL or CFB data.
 *
 *  Three rules, each of which has a test below:
 *
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
import type { MarketTile, Segment } from "../predictor-ui";
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
  const margin = num(prediction.predicted_margin);
  const line = num(game.spread_line);
  // `away` is required as well as `home` here, and not incidentally: the tile
  // names the FAVOURED team, which is whichever of the two is likelier, so a
  // tile built from one probability would name a team on no evidence at all.
  if (margin !== null && line !== null && home !== null && away !== null) {
    const favoured = home >= away ? game.home_team : game.away_team;
    tiles.push({
      market: "spread",
      label: "spread",
      value: spread(favoured, line),
      sub: `model ${signed(margin)}`,
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
