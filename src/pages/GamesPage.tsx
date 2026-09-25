import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary, WeekPrediction } from "../types";
import { useSport } from "../context/SportContext";
import { sortByConfidence } from "../lib/confidenceSort";
import { TeamLogo } from "../components/TeamName";
import { ErrorState, MatchCard, RoundNavigator, Skeleton } from "../predictor-ui";
import { kickoffZones, nextUpIds, toCardModel, weekTally } from "../lib/weekCards";
import { GameDetailModal } from "../components/GameDetailModal";

const FALLBACK_SEASON = 2026;
const PREDICTION_CONCURRENCY = 4;
type SortMode = "chronological" | "confidence";

// A full week's worth of games fired as one Promise.all was hammering the
// backend with 15+ simultaneous prediction requests and occasionally
// tripping intermittent 500s under that burst. A small worker pool keeps
// the same total requests but only a handful in flight at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function GamesPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [week, setWeek] = useState(1);
  const [currentWeek, setCurrentWeek] = useState<{ season: number; week: number } | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [predictions, setPredictions] = useState<Record<string, GamePrediction>>({});
  const [weekPredictions, setWeekPredictions] = useState<WeekPrediction[]>([]);
  const [weekLoaded, setWeekLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictionsSettled, setPredictionsSettled] = useState(false);
  const [currentWeekFailed, setCurrentWeekFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("chronological");
  const [conferenceFilter, setConferenceFilter] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);

  // On sport switch, jump straight to that sport's current week rather than
  // always restarting at week 1 (which for CFB/NFL is usually long over by
  // the time anyone's looking).
  useEffect(() => {
    let cancelled = false;
    setCurrentWeekFailed(false);
    api.currentWeek()
      .then((cw) => {
        if (cancelled) return;
        setCurrentWeek(cw);
        setSeason(cw.season);
        setWeek(cw.week);
      })
      .catch(() => { if (!cancelled) { setCurrentWeek(null); setCurrentWeekFailed(true); } });
    return () => { cancelled = true; };
  // reloadKey: every Try again also re-asks for the current week.
  }, [api, sport, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setGames([]); setPredictions({}); setWeekPredictions([]); setWeekLoaded(false); setPredictionsSettled(false); setSelectedGame(null);
    // Tracked pre-kickoff verdicts for the week (Called it / Missed and the
    // record line). Best-effort: without them finals simply show no verdict.
    api.predictionsForWeek(season, week)
      .then((rows) => { if (!cancelled) setWeekPredictions(Array.isArray(rows) ? rows : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWeekLoaded(true); });
    api.games(season, week).then(async (fetchedGames) => {
      if (cancelled) return;
      setGames(fetchedGames);
      // One batch round trip covers the week; only game_ids missing from
      // the batch fall back to per-game fetches.
      const merged: Record<string, GamePrediction> = {};
      const batch = await api.predictionsBatch(season, week).catch(() => null);
      const missing: GameSummary[] = [];
      for (const g of fetchedGames) {
        const p = batch?.[g.game_id];
        if (p) merged[g.game_id] = p;
        else missing.push(g);
      }
      const entries = await mapWithConcurrency(missing, PREDICTION_CONCURRENCY, async (g) => {
        // One retry: a single backend under a burst of concurrent requests
        // can drop a request transiently even with the concurrency cap
        // above, and a permanent "Loading…" badge for the rest of the
        // page's life is worse than one extra round trip.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try { const p = await api.gamePrediction(season, week, g.game_id); return [g.game_id, p] as const; }
          catch { /* fall through to retry, or give up after the last attempt */ }
        }
        return null;
      });
      if (cancelled) return;
      for (const entry of entries) {
        if (entry) merged[entry[0]] = entry[1];
      }
      setPredictions(merged);
      setPredictionsSettled(true);
    // The raw message ("502 Bad Gateway", "Failed to fetch") is never shown;
    // the alert below says what failed and how to recover.
    }).catch(() => { if (!cancelled) setError("games"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, season, week, reloadKey]);

  const hasConferences = games.some((g) => g.home_conference || g.away_conference);
  // Teams with no conference are filtered as "Independent", so offer it too.
  const conferenceOptions = hasConferences
    ? Array.from(new Set(games.flatMap((g) => [g.home_conference || "Independent", g.away_conference || "Independent"]))).sort()
    : [];

  const filteredGames = conferenceFilter
    ? games.filter((g) => (g.home_conference || "Independent") === conferenceFilter || (g.away_conference || "Independent") === conferenceFilter)
    : games;

  const orderedGames = sortMode === "confidence"
    ? sortByConfidence(filteredGames, predictions)
    : [...filteredGames].sort((a, b) => new Date(a.gameday).getTime() - new Date(b.gameday).getTime());

  const isCurrentWeek = currentWeek != null && currentWeek.season === season && currentWeek.week === week;
  const byId = new Map(weekPredictions.map((w) => [w.game_id, w]));
  const nextIds = nextUpIds(games, isCurrentWeek);

  const retry = () => setReloadKey((k) => k + 1);
  const pillClass = (on: boolean) =>
    `rounded-pr px-3 py-1 text-xs font-semibold transition-colors ${on ? "bg-pr-accent text-pr-accent-ink" : "text-pr-text-dim hover:text-pr-text"}`;

  return (
    <div>
      <RoundNavigator
        label={`${season} · Week ${week}`}
        unit="week"
        canPrev={week > 1}
        canNext
        onPrev={() => setWeek((w) => Math.max(1, w - 1))}
        onNext={() => setWeek((w) => w + 1)}
        onJumpToCurrent={!isCurrentWeek && currentWeek ? () => { setSeason(currentWeek.season); setWeek(currentWeek.week); } : undefined}
        record={weekTally(weekPredictions)}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Order games" className="flex gap-1 rounded-pr border border-pr-rule bg-pr-panel p-1">
          <button type="button" aria-pressed={sortMode === "chronological"} onClick={() => setSortMode("chronological")} className={pillClass(sortMode === "chronological")}>Kickoff order</button>
          <button type="button" aria-pressed={sortMode === "confidence"} onClick={() => setSortMode("confidence")} className={pillClass(sortMode === "confidence")}>Most confident first</button>
        </div>
        {conferenceOptions.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-pr-text-dim">
            Conference
            <select
              value={conferenceFilter ?? ""}
              onChange={(e) => setConferenceFilter(e.target.value || null)}
              className="rounded-pr border border-pr-rule bg-pr-panel px-2 py-1.5 text-sm text-pr-text"
            >
              <option value="">All conferences</option>
              {conferenceOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      {currentWeekFailed && season === FALLBACK_SEASON && week === 1 && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 text-sm text-pr-text-dim">
          <span>Couldn't find the current week, so this shows week 1.</span>
          <button type="button" onClick={retry} className="rounded-pr border border-pr-rule bg-pr-panel-2 px-3 py-1.5 text-xs font-semibold text-pr-text transition-colors hover:border-pr-accent">Try again</button>
        </div>
      )}
      {loading && <Skeleton label="Loading games…" />}
      {error && <ErrorState message="We couldn't load this week's games. Check your connection and try again." onRetry={retry} />}
      {!loading && !error && predictionsSettled && games.length > 0 && Object.keys(predictions).length === 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-pr border border-pr-rule bg-pr-panel px-4 py-3 text-sm text-pr-text">
          <span>Picks for this week couldn't load. The schedule is below.</span>
          <button type="button" onClick={retry} className="rounded-pr border border-pr-rule bg-pr-panel-2 px-3 py-1.5 text-xs font-semibold text-pr-text transition-colors hover:border-pr-accent">Try again</button>
        </div>
      )}
      {!loading && !error && orderedGames.length === 0 && (
        <p className="text-sm text-pr-text-dim">
          {conferenceFilter && games.length > 0 ? `No ${conferenceFilter} games this week.` : "No games scheduled for this week."}
        </p>
      )}

      {orderedGames.length > 0 && (
        <p className="mb-3 text-xs text-pr-text-dim">Kickoff times in {kickoffZones(orderedGames.map((g) => g.gameday))}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedGames.map((game) => {
          const model = toCardModel(game, predictions[game.game_id] ?? null, byId.get(game.game_id), nextIds.has(game.game_id));
          // Finals wait for the week's snapshots; games to come wait for picks.
          const isFinal = game.home_score != null;
          const pending = isFinal ? !weekLoaded : !predictionsSettled && !predictions[game.game_id];
          return (
            <MatchCard
              key={game.game_id}
              {...model}
              status={pending && isFinal ? undefined : model.status}
              left={{ ...model.left, badge: <TeamLogo sport={sport} team={game.away_team} size="md" /> }}
              right={{ ...model.right, badge: <TeamLogo sport={sport} team={game.home_team} size="md" /> }}
              pickPlaceholder={pending ? "Loading pick…" : undefined}
              onOpen={() => setSelectedGame(game)}
            />
          );
        })}
      </div>

      {selectedGame && <GameDetailModal game={selectedGame} api={api} onClose={() => setSelectedGame(null)} />}
    </div>
  );
}
