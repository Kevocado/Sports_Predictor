import { BoxScore, ExplainerPanel, pct, spread } from "../predictor-ui";
import type { Explanation } from "../api/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GamePrediction, GameSummary, GameVerdict, HeadToHead as HeadToHeadData, PlayerPropPrediction, SportApi, TeamForm, WeekPrediction } from "../types";
import { TeamName } from "./TeamName";
import { MarketBar } from "./MarketBar";
import { FormStrip } from "./FormStrip";
import { HeadToHead } from "./HeadToHead";
import { boxScoreColumnsFor, buildBoxScoreGroups } from "../lib/boxScoreRows";

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
              data={summary}
              loading={summaryLoading}
              error={summaryError}
              onRetry={() => loadSummary()}
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
          </section>

          {/* Predicted box score — the model's own markets, grouped by
              position. This replaces the old per-player projection list and its
              position filter buttons: the grouping does the filtering, and the
              per-team totals rows replace the "Team Yardage Predictions" cards
              that used to encode the same number a second way. */}
          <section>
            {propsLoading && <p className="text-xs text-sp-text-faint">Loading player projections…</p>}
            {!propsLoading && boxScoreGroups.length === 0 && (
              <p className="text-xs text-sp-text-faint rounded-lg bg-sp-850/40 p-3 border border-sp-border/40">
                {gameProps && gameProps.length > 0
                  ? "No players at this position for this game."
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
