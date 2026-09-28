// `Explanation` comes from `../predictor-ui`, and only from there. `../api/client`
// used to re-export it as a second door onto the same type and no longer does --
// its own header says so, and it now carries a deliberate comment explaining
// that the modal and the explain call sites import the type from the panel that
// declares it. So ours' import line is not a preference, it is a door that is no
// longer there; theirs' is the only one that resolves.
import { BoxScore, ExplainerPanel, pct, spread } from "../predictor-ui";
import type { Explanation } from "../predictor-ui";
// The v2 panel's figures, derived rather than fetched. Kept from
// origin/v2-wire: A4 replaced the player-props area and never touched this.
import { barPick, panelFacts } from "../lib/panelFacts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GamePrediction, GameSummary, GameVerdict, HeadToHead as HeadToHeadData, PlayerPropPrediction, SportApi, TeamForm, WeekPrediction } from "../types";
import { TeamName } from "./TeamName";
import { MarketBar } from "./MarketBar";
import { FormStrip } from "./FormStrip";
import { HeadToHead } from "./HeadToHead";
import { boxScoreColumnsFor, buildBoxScoreGroups } from "../lib/boxScoreRows";

export const MARKET_LABEL = {
  passing_yards: "Pass yds",
  rushing_yards: "Rush yds",
  receiving_yards: "Rec yds",
} as const;

export interface YardageMarketBreakdown {
  market: keyof typeof MARKET_LABEL;
  yards: number;
  n: number;
}

/** Yardage projected for one roster, grouped by the market it was projected in.
 *
 * Kept per market and never summed. `POSITION_MARKETS` (NFL/CFB
 * `models/player_props.py`) is a dict of *lists* -- its own comment says "each
 * position can have multiple markets", RB gets both rushing_yards and carries --
 * so the earlier claim that the model projects exactly one market per position was
 * wrong, and it was wrong in a customer-visible sentence as well as in a comment.
 *
 * The arithmetic still holds, for a different and verified reason: summing the
 * roster's yardage fields adds a QB's passing to an RB's rushing and a WR's
 * receiving, and the total is not any real quantity. On a full roster it ran
 * 800-1400 yards against a real figure of roughly 300-450.
 *
 * What is *not* safe is to rely on each player having at most one yardage field. If
 * `POSITION_MARKETS` ever gives a position two yardage markets, the parts still do not
 * sum to the old single-field total, and the correct rendering is one row per market
 * with the player counted in both -- which is what this does, and which
 * `test_binds_each_market_label_to_its_own_value` and its sibling now pin.
 * Team total yards is `rushing + receiving` across every player, which needs a
 * team-level model that does not exist yet -- so this reports what is actually
 * projected and says so, rather than publishing a number nobody can reproduce.
 */
export function yardageBreakdown(props: PlayerPropPrediction[]): YardageMarketBreakdown[] {
  const totals = new Map<string, { yards: number; n: number }>();
  for (const prop of props) {
    for (const market of Object.keys(MARKET_LABEL) as (keyof typeof MARKET_LABEL)[]) {
      const value = prop[market];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const entry = totals.get(market) ?? { yards: 0, n: 0 };
      entry.yards += value;
      entry.n += 1;
      totals.set(market, entry);
    }
  }
  return (Object.keys(MARKET_LABEL) as (keyof typeof MARKET_LABEL)[])
    .filter(market => totals.has(market))
    .map(market => ({ market, yards: totals.get(market)!.yards, n: totals.get(market)!.n }));
}

export function filterPlayerPropsForGame(
  props: PlayerPropPrediction[],
  game: Pick<GameSummary, "home_team" | "away_team">,
): PlayerPropPrediction[] {
  return props.filter((prop) => prop.recent_team === game.home_team || prop.recent_team === game.away_team);
}

function VerdictBadge({ label, hit }: { label: string; hit: boolean }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg bg-sp-850/60 px-2.5 py-1 text-xs">
      <span className="text-sp-text-dim">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${hit ? "bg-win/20 text-win" : "bg-loss/20 text-loss"}`}>
        {hit ? "HIT" : "MISS"}
      </span>
    </span>
  );
}

// weekPrediction: the week's row for this game (the pick snapshotted before
// kickoff, and whether it was rebuilt after). A final is judged on that pick,
// never on today's model.
// explain: fetches the plain-English summary. Optional on purpose — a site
// deployed before the explainer exists, or a game it has no summary for, must
// still open this modal and show everything else in it.
interface Props { game: GameSummary; api: SportApi; weekPrediction?: WeekPrediction; onClose: () => void; explain?: (sport: string, id: string) => Promise<Explanation>; sport?: string; }

function PregamePick({ game, week }: { game: GameSummary; week?: WeekPrediction }) {
  if (week?.rebuilt) {
    return (
      <p className="mb-2 rounded-lg border border-sp-border/60 p-3 text-xs text-sp-text-dim">
        Rebuilt after kickoff: this pick was made after the game started, so it is shown for reference and not counted.
      </p>
    );
  }
  const home = week && week.status !== "untracked" ? week.home_win_prob : undefined;
  if (home == null) return <p className="mb-2 text-xs text-sp-text-dim">No pick was made before kickoff.</p>;
  const label = home === 0.5 ? "Toss-up" : home > 0.5 ? game.home_team : game.away_team;
  return <p className="mb-2 text-sm font-semibold text-sp-text">{`Pick before kickoff: ${label} · ${pct(home >= 0.5 ? home : 1 - home)}`}</p>;
}

export function GameDetailModal({ game, api, weekPrediction, onClose, explain, sport = "nfl" }: Props) {
  const [prediction, setPrediction] = useState<GamePrediction | null>(null);
  // The panel's figures, derived rather than fetched. Memoised because
  // `panelFacts` allocates a new array on every call and the panel takes those
  // arrays as props — without this the tiles and segments are a fresh identity on
  // every render, which re-renders the whole panel whenever anything else moves.
  const panel = useMemo(() => panelFacts(game, prediction), [game, prediction]);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [allProps, setAllProps] = useState<PlayerPropPrediction[] | null>(null);
  const [propsLoading, setPropsLoading] = useState(true);
  const [verdict, setVerdict] = useState<GameVerdict | null>(null);
  const [homeForm, setHomeForm] = useState<TeamForm | null>(null);
  const [awayForm, setAwayForm] = useState<TeamForm | null>(null);
  const [h2h, setH2h] = useState<HeadToHeadData | null>(null);
  const [summary, setSummary] = useState<Explanation | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const isFinal = game.home_score != null && game.away_score != null;

  // The summary is fetched on its own and never gates the rest of the modal:
  // it is the first thing on screen, so anything that waited for it would
  // leave the whole detail view empty behind a spinner.
  const loadSummary = useCallback(() => {
    if (!explain) return;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(false);
    explain(sport, game.game_id)
      .then((r) => { if (!cancelled) setSummary(r); })
      .catch(() => { if (!cancelled) { setSummary(null); setSummaryError(true); } })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [explain, sport, game.game_id]);

  useEffect(() => loadSummary(), [loadSummary]);

  // The answer's pick, restated in the vocabulary the bar above is drawn in.
  //
  // The bar joins the pick to a segment BY LABEL, and the service's wording and
  // this site's segment labels are two independent call sites that happen to
  // agree today: NFL and CFB both build the pick from the same `game["home_team"]`
  // string this site labels segments with. Nothing in the type system connects
  // them, so a reword on the service's side ("Ravens win", the shape PL ships)
  // un-accents every bar in the app while the verdict sentence above still names
  // a pick. `barPick` is the guard, and it fails closed. Derived, not fetched,
  // and memoised so the panel is not re-rendered by an identity change here.
  const wired = useMemo(() => {
    if (!summary || !("factors" in summary) || !summary.pick) return summary;
    return { ...summary, pick: barPick(summary.pick, panel.segments) };
  }, [summary, panel.segments]);

  useEffect(() => {
    let cancelled = false;
    setPrediction(null); setPredictionError(null); setAllProps(null); setPropsLoading(true); setVerdict(null);
    setHomeForm(null); setAwayForm(null); setH2h(null);

    // Fetch main game prediction
    api.gamePrediction(game.season, game.week, game.game_id)
      .then((r) => { if (!cancelled) setPrediction(r); })
      .catch((e) => { if (!cancelled) setPredictionError(e instanceof Error ? e.message : String(e)); });

    // Fetch player props safely (fails silently to an empty array so it doesn't break UI)
    api.playerProps(game.season, game.week)
      .then((r) => { if (!cancelled) setAllProps(r); })
      .catch(() => { if (!cancelled) setAllProps([]); })
      .finally(() => { if (!cancelled) setPropsLoading(false); });

    // Post-match verdict: only meaningful once the game has a final score,
    // and a missing verdict (not yet reconciled) is not an error.
    if (isFinal) {
      api.gameVerdict(game.game_id)
        .then((r) => { if (!cancelled) setVerdict(r); })
        .catch(() => { if (!cancelled) setVerdict(null); });
    }

    // Recent form for both teams + head-to-head history. Missing data is
    // not an error -- the section simply renders whatever resolved.
    api.teamForm(game.home_team, game.season)
      .then((r) => { if (!cancelled) setHomeForm(r); })
      .catch(() => { if (!cancelled) setHomeForm(null); });
    api.teamForm(game.away_team, game.season)
      .then((r) => { if (!cancelled) setAwayForm(r); })
      .catch(() => { if (!cancelled) setAwayForm(null); });
    api.headToHead(game.game_id, game.season, game.week)
      .then((r) => { if (!cancelled) setH2h(r); })
      .catch(() => { if (!cancelled) setH2h(null); });

    return () => { cancelled = true; };
  }, [api, game.season, game.week, game.game_id, game.home_team, game.away_team, isFinal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gameProps = allProps ? filterPlayerPropsForGame(allProps, game) : null;
  // One group per position, each already ordered starters-then-bench, with the
  // totals rows ordered away-then-home so they read like the scoreline above.
  const boxScoreGroups = useMemo(
    () => (gameProps ? buildBoxScoreGroups(gameProps, [game.away_team, game.home_team]) : []),
    [gameProps, game.away_team, game.home_team],
  );
  // Kept from origin/v2-wire, not from A4. Theirs' `visibleProps` memo is NOT
  // carried over: it filtered by the `positionFilter` state and sorted by
  // `keyYardage`, and A4 deleted the filter buttons (the box score groups by
  // position instead) along with the `playerRank` import, so the memo has
  // nothing left to read. `keyYardage` still exists -- `lib/boxScoreRows.ts`
  // uses it for the box score's row order -- but not as a modal-level sort.
  const yardageByTeam = useMemo(
    () => [
      { team: game.home_team, markets: yardageBreakdown((gameProps ?? []).filter(p => p.recent_team === game.home_team)) },
      { team: game.away_team, markets: yardageBreakdown((gameProps ?? []).filter(p => p.recent_team === game.away_team)) },
    ],
    [gameProps, game.home_team, game.away_team],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-modal-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-sp-border px-6 py-4">
          <span className="text-sm font-semibold text-sp-text-dim">Game Detail & Model Projections</span>
          <button onClick={onClose} className="rounded-full p-1.5 text-sp-text-dim transition hover:bg-sp-800 hover:text-sp-text" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-6 space-y-6">

          {/* In plain English — first, because it is the one-screen answer.
              Hidden entirely when there is no explainer, rather than shown
              empty. */}
          {explain && (
            <ExplainerPanel
              data={wired}
              loading={summaryLoading}
              error={summaryError}
              onRetry={() => loadSummary()}
              // The figures the panel draws, from this site's OWN prediction
              // response rather than from the explanation. The panel is handed
              // numbers and renders them; it must never be the thing that
              // decides what the numbers are, or the explanation and the
              // prediction could disagree on screen.
              tiles={panel.tiles}
              segments={panel.segments}
            />
          )}

          {/* Header Matchup */}
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-1">
              <TeamName team={game.away_team} size="lg" />
              {isFinal && <span className="font-mono text-xl font-bold text-sp-text">{game.away_score}</span>}
            </div>
            <span className="text-2xl font-black text-sp-text-faint">at</span>
            <div className="flex flex-col items-center gap-1">
              <TeamName team={game.home_team} size="lg" />
              {isFinal && <span className="font-mono text-xl font-bold text-sp-text">{game.home_score}</span>}
            </div>
          </div>

          {/* Post-match verdict — did the model call it right? */}
          {isFinal && (
            <section>
              <div className="mb-2">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Result &amp; verdict</h3>
                <p className="text-xs text-sp-text-dim">Whether the model's pregame call matched what actually happened.</p>
              </div>
              <PregamePick game={game} week={weekPrediction} />
              {verdict ? (
                <div className="flex flex-col gap-2">
                  <p className="font-display text-lg font-semibold tracking-wide text-sp-text">
                    {`Final: ${verdict.actual_home_score ?? game.home_score}–${verdict.actual_away_score ?? game.away_score}`}
                    {verdict.home_spread_line != null && <span className="ml-2">{`Line ${verdict.home_spread_line}`}</span>}
                    {verdict.total_line != null && <span className="ml-2">{`Total ${verdict.total_line}`}</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <VerdictBadge label="Moneyline" hit={verdict.moneyline.hit} />
                    {verdict.ats && <VerdictBadge label="Spread" hit={verdict.ats.hit} />}
                    {verdict.totals && <VerdictBadge label="Total" hit={verdict.totals.hit} />}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-sp-text-faint rounded-lg bg-sp-850/40 p-3 border border-sp-border/40">
                  This game's final result hasn't been reconciled against the model's prediction yet.
                </p>
              )}
            </section>
          )}

          {/* Recent form & head-to-head — renders whatever resolved; missing
              data is not an error. */}
          {((homeForm && homeForm.recent_form.length > 0) || (awayForm && awayForm.recent_form.length > 0) || (h2h && h2h.meetings.length > 0)) && (
            <section>
              <div className="mb-2">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Recent form &amp; head-to-head</h3>
                <p className="text-[12px] text-sp-text-dim">Last five results for each team, plus recent meetings between them.</p>
              </div>
              <div className="flex flex-col gap-3">
                {homeForm && homeForm.recent_form.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs font-medium text-sp-text">{game.home_team}</span>
                    <FormStrip entries={homeForm.recent_form} />
                  </div>
                )}
                {awayForm && awayForm.recent_form.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs font-medium text-sp-text">{game.away_team}</span>
                    <FormStrip entries={awayForm.recent_form} />
                  </div>
                )}
                {h2h && h2h.meetings.length > 0 && <HeadToHead meetings={h2h.meetings} />}
              </div>
            </section>
          )}

          {/* Match Markets Section */}
          <section>
            <div className="mb-2">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Match Markets</h3>
              <p className="text-xs text-sp-text-dim">
                {isFinal
                  ? "Today's model, for reference: the verdict above is judged on the pick made before kickoff."
                  : "Win probability (straight-up), point spread cover chance, and total points line."}
              </p>
            </div>
            {predictionError && <p className="text-xs text-loss">{predictionError}</p>}
            {!prediction && !predictionError && <p className="text-xs text-sp-text-faint">Loading match markets…</p>}
            {/* The card only shows these on the list view; restate them here
                so the modal is self-contained. */}
            {game.spread_line != null && (
              <p className="text-xs text-sp-text-dim">{`${spread(game.home_team, -game.spread_line)} · Total ${game.total_line ?? "—"}`}</p>
            )}
            {prediction && prediction.predicted_margin != null && prediction.sigma != null && (
              <p className="text-xs text-sp-text-dim">
                {`Projected margin: ${prediction.predicted_margin >= 0 ? game.home_team : game.away_team} by ${Math.abs(prediction.predicted_margin).toFixed(1)} ± ${prediction.sigma.toFixed(1)} pts`}
              </p>
            )}
            {prediction && <div className="flex flex-col gap-1.5">
              <MarketBar label={`${game.home_team} win`} prob={prediction.home_win_prob} />
              <MarketBar label={`${game.away_team} win`} prob={prediction.away_win_prob} />
              {prediction.home_cover_prob != null && <MarketBar label={`${game.home_team} covers spread`} prob={prediction.home_cover_prob} />}
              {prediction.away_cover_prob != null && <MarketBar label={`${game.away_team} covers spread`} prob={prediction.away_cover_prob} />}
              {prediction.over_prob != null && <MarketBar label="Over total points" prob={prediction.over_prob} />}
              {prediction.under_prob != null && <MarketBar label="Under total points" prob={prediction.under_prob} />}
            </div>}

            {/* Projected yardage, by market. Deliberately NOT a team total.
                Kept from origin/v2-wire (#8) even though A4 deleted the block's
                predecessor, and the reason it is not redundant is written down
                in the report: the box score's totals rows are per POSITION
                group, not per team, and they claim nothing at all when a single
                player in the group has no projection for that market. This block
                is per team, per market, carries the count it summed, and is the
                only place on the page that says out loud why there is no team
                yardage total. `data-testid` because the box score below prints
                the same three market labels as its column headers, so a bare
                getByText("Pass yds") can no longer say which of the two it meant. */}
            {yardageByTeam.some(row => row.markets.length > 0) && (
              <div className="flex flex-col gap-1.5" data-testid="yardage-by-market">
                <div className="text-xs text-sp-text-faint font-semibold uppercase tracking-wide">Projected Yardage by Market</div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {yardageByTeam.map(row => (
                    <div key={row.team} className="rounded-lg bg-sp-850/60 p-3">
                      <div className="font-semibold text-sm">{row.team}</div>
                      {row.markets.length > 0 ? (
                        <dl className="mt-1 flex flex-col gap-0.5 text-sm">
                          {row.markets.map(market => (
                            <div key={market.market} className="flex items-baseline justify-between gap-2">
                              <dt className="text-sp-text-dim">
                                {MARKET_LABEL[market.market]} <span className="text-sp-text-faint">({market.n})</span>
                              </dt>
                              <dd className="font-mono">{Math.round(market.yards)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <div className="text-sm text-sp-text-faint">No yardage projection</div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs leading-snug text-sp-text-faint">
                  Position-market projections, not team total yards. These cover the whole
                  roster rather than the expected on-field lineup, and the model projects one
                  yardage market per position, so QB rushing and RB receiving are missing.
                  A team yardage total needs a team-level model that does not exist yet.
                </p>
              </div>
            )}
          </section>

          {/* Predicted box score — the model's own markets, grouped by
              position. This replaces the old per-player projection list and its
              position filter buttons: the grouping does the filtering.

              It does NOT replace the yardage block above, which A4's plan
              believed it did. A box score's totals row is per POSITION group
              (`teamSubtotals` in lib/boxScoreRows.ts), so a team's yardage is
              spread across four tables and a reader has to add the WR and TE
              receiving rows to reach "Rec yds"; the row also refuses to print at
              all when a single player in the group has no projection for that
              market, where the block reports the partial sum and the count it
              was summed from. Neither carries a team yardage total, because the
              model computes one only as `rushing + receiving` across every
              player and has no team-level yardage model. The block above keeps
              #8's figure and its explanation; this keeps A4's. */}
          <section>
            {propsLoading && <p className="text-xs text-sp-text-faint">Loading player projections…</p>}
            {/* Two different gaps, two different sentences, because the game
                either has no props at all or has props the model does not
                project. A4 deleted the position filter buttons, and with them
                the filter this branch's sentence used to name: it read "No
                players at this position for this game", and there has been no
                position left to read that against since. The branch is now
                reachable only when `gameProps` is non-empty and every one of
                them plays K / OL / DL / P — positions with no market, so
                `buildBoxScoreGroups` has no group to render. So the sentence
                names the thing that is actually missing. */}
            {!propsLoading && boxScoreGroups.length === 0 && (
              <p className="text-xs text-sp-text-faint rounded-lg bg-sp-850/40 p-3 border border-sp-border/40">
                {gameProps && gameProps.length > 0
                  ? "No modelled positions for this game. Every player the feed returned is at a position the model does not project (kicker, offensive or defensive line), and the box score only covers QB, RB, WR and TE."
                  : "No player projection props available for this specific game yet. (Ensure your backend player-props route catches external API timeouts gracefully)."}
              </p>
            )}
            {/* A table per position, because each position has its own markets.
                The title goes on the first one only: it is the section heading,
                and it carries the "Projected order" note the vendored BoxScore
                renders when no row has a real starter flag. */}
            {boxScoreGroups.map((group, i) => (
              <BoxScore
                key={group.position}
                columns={boxScoreColumnsFor(group.position)}
                groups={[group]}
                title={i === 0 ? "Predicted box score" : undefined}
              />
            ))}
          </section>

        </div>
      </div>
    </div>
  );
}
