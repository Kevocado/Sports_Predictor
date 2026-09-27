import { useEffect, useMemo, useState } from "react";
import type { GamePrediction, GameSummary, GameVerdict, HeadToHead as HeadToHeadData, PlayerPropPrediction, SportApi, TeamForm } from "../types";
import { TeamName } from "./TeamName";
import { MarketBar } from "./MarketBar";
import { FormStrip } from "./FormStrip";
import { HeadToHead } from "./HeadToHead";
import { POSITION_ORDER, keyStatLabel, keyYardage, tdConfidenceTone } from "../lib/playerRank";

type PositionFilter = "ALL" | (typeof POSITION_ORDER)[number];

const MARKET_LABEL = {
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
 * Kept per market and never summed. The model projects exactly one yardage
 * market per position (NFL/CFB `models/player_props.py::POSITION_MARKETS`), so
 * summing the roster's single yardage field adds a QB's passing to an RB's
 * rushing and a WR's receiving, and the total is not any real quantity: on a
 * full roster it ran 800-1400 yards, against a real figure of roughly 300-450.
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
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${hit ? "bg-win/20 text-win" : "bg-loss/20 text-loss"}`}>
        {hit ? "HIT" : "MISS"}
      </span>
    </span>
  );
}

interface Props { game: GameSummary; api: SportApi; onClose: () => void; }

export function GameDetailModal({ game, api, onClose }: Props) {
  const [prediction, setPrediction] = useState<GamePrediction | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [allProps, setAllProps] = useState<PlayerPropPrediction[] | null>(null);
  const [propsLoading, setPropsLoading] = useState(true);
  const [verdict, setVerdict] = useState<GameVerdict | null>(null);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [homeForm, setHomeForm] = useState<TeamForm | null>(null);
  const [awayForm, setAwayForm] = useState<TeamForm | null>(null);
  const [h2h, setH2h] = useState<HeadToHeadData | null>(null);
  const isFinal = game.home_score != null && game.away_score != null;

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
  const availablePositions = useMemo(
    () => POSITION_ORDER.filter((position) => (gameProps ?? []).some((p) => p.position === position)),
    [gameProps],
  );
  const yardageByTeam = useMemo(
    () => [
      { team: game.home_team, markets: yardageBreakdown((gameProps ?? []).filter(p => p.recent_team === game.home_team)) },
      { team: game.away_team, markets: yardageBreakdown((gameProps ?? []).filter(p => p.recent_team === game.away_team)) },
    ],
    [gameProps, game.home_team, game.away_team],
  );
  const visibleProps = useMemo(() => {
    if (!gameProps) return null;
    const filtered = positionFilter === "ALL" ? gameProps : gameProps.filter((p) => p.position === positionFilter);
    return [...filtered].sort((a, b) => keyYardage(b) - keyYardage(a) || b.anytime_td_prob - a.anytime_td_prob);
  }, [gameProps, positionFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-modal-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-sp-border px-6 py-4">
          <span className="text-sm font-semibold text-sp-text-dim">Game Detail & Model Projections</span>
          <button onClick={onClose} className="rounded-full p-1.5 text-sp-text-dim transition hover:bg-sp-800 hover:text-sp-text" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-6 space-y-6">
          
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
                <p className="text-[11px] text-sp-text-dim">Whether the model's pregame call matched what actually happened.</p>
              </div>
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
                <p className="text-[11px] text-sp-text-dim">Last five results for each team, plus recent meetings between them.</p>
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
              <p className="text-[11px] text-sp-text-dim">Win probability (straight-up), point spread cover chance, and total points line.</p>
            </div>
            {predictionError && <p className="text-xs text-loss">{predictionError}</p>}
            {!prediction && !predictionError && <p className="text-xs text-sp-text-faint">Loading match markets…</p>}
            {/* The card only shows these on the list view; restate them here
                so the modal is self-contained. */}
            {game.spread_line != null && (
              <p className="text-[11px] text-sp-text-faint">{`Spread ${game.spread_line} · Total ${game.total_line ?? "—"}`}</p>
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

            {/* Projected yardage, by market. Deliberately NOT a team total. */}
            {yardageByTeam.some(row => row.markets.length > 0) && (
              <div className="flex flex-col gap-1.5">
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

          {/* Player Props Section */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">Model Player Projections</h3>
                <p className="text-[11px] text-sp-text-dim">Predicted touchdown probabilities and expected yardage milestones from your machine learning models.</p>
              </div>
              {availablePositions.length > 1 && (
                <div className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
                  {(["ALL", ...availablePositions] as PositionFilter[]).map((position) => (
                    <button
                      key={position}
                      onClick={() => setPositionFilter(position)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${positionFilter === position ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}
                    >
                      {position}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {propsLoading && <p className="text-xs text-sp-text-faint">Loading player projections…</p>}
            {!propsLoading && visibleProps && visibleProps.length === 0 && (
              <p className="text-xs text-sp-text-faint rounded-lg bg-sp-850/40 p-3 border border-sp-border/40">
                {gameProps && gameProps.length > 0
                  ? "No players at this position for this game."
                  : "No player projection props available for this specific game yet. (Ensure your backend player-props route catches external API timeouts gracefully)."}
              </p>
            )}
            {visibleProps && visibleProps.length > 0 && <div className="flex flex-col gap-1.5">
              {visibleProps.map((prop) => (
                <div key={prop.player_id} className="flex items-center justify-between rounded-lg bg-sp-850/60 px-3 py-2 text-sm">
                  <span className="text-sp-text font-medium">{prop.player_name} <span className="text-xs text-sp-text-faint font-normal">({prop.position} · {prop.recent_team})</span></span>
                  <div className="flex items-center gap-2 font-mono text-xs text-sp-text-dim">
                    <span>{keyStatLabel(prop.position)} {Math.round(keyYardage(prop))}</span>
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${tdConfidenceTone(prop.anytime_td_prob)}`}>
                      TD {Math.round(prop.anytime_td_prob * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>}
          </section>

        </div>
      </div>
    </div>
  );
}
