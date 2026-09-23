import { useEffect, useMemo, useState } from "react";
import type { PlayerPropPrediction, Sport } from "../types";
import { useSport } from "../context/SportContext";
import { TeamLogo } from "../components/TeamName";
import { POSITION_ORDER, groupByPosition, keyStatLabel, keyYardage, tdConfidenceTone, type SkillPosition } from "../lib/playerRank";

const FALLBACK_SEASON = 2026;

const POSITION_LABEL: Record<SkillPosition, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};

// The feeds occasionally emit placeholder rows with no real player behind
// them; a "top players" view must never crown one.
function isRealPlayer(prop: PlayerPropPrediction): boolean {
  const name = prop.player_name.trim().toLowerCase();
  return name !== "" && name !== "team";
}

function TdBadge({ prob }: { prob: number }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${tdConfidenceTone(prob)}`}>
      TD {Math.round(prob * 100)}%
    </span>
  );
}

/** PL-style per-position leaderboard card: the week's best at one position. */
function SpotlightCard({ position, players, sport }: { position: SkillPosition; players: PlayerPropPrediction[]; sport: Sport }) {
  const top = players.slice(0, 3);
  if (top.length === 0) return null;
  const [first, ...rest] = top;
  return (
    <section data-testid={`spotlight-${position}`} className="rounded-xl border border-sp-border bg-sp-850/40 p-4">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-sp-text-faint">
        Top {POSITION_LABEL[position]}
      </h3>
      <div data-testid={`spotlight-${position}-player-${first.player_id}`} className="mt-3 flex items-center gap-3">
        <TeamLogo sport={sport} team={first.recent_team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold uppercase leading-tight tracking-wide text-sp-text">
            {first.player_name}
          </p>
          <p className="text-xs text-sp-text-faint">{first.recent_team}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-sp-gold">{Math.round(keyYardage(first))}</p>
          <p className="text-[10px] uppercase tracking-wider text-sp-text-faint">proj {keyStatLabel(position).toLowerCase()}</p>
        </div>
      </div>
      <div className="mt-2"><TdBadge prob={first.anytime_td_prob} /></div>
      {rest.map((prop, i) => (
        <div
          key={prop.player_id}
          data-testid={`spotlight-${position}-player-${prop.player_id}`}
          className="mt-2 flex items-center gap-2 border-t border-sp-border/40 pt-2 text-sm"
        >
          <span className="w-4 shrink-0 font-mono text-xs text-sp-text-faint">{i + 2}</span>
          <TeamLogo sport={sport} team={prop.recent_team} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium text-sp-text">
            {prop.player_name} <span className="text-xs font-normal text-sp-text-faint">({prop.recent_team})</span>
          </span>
          <span className="shrink-0 font-mono text-xs text-sp-text-dim">{Math.round(keyYardage(prop))}</span>
        </div>
      ))}
    </section>
  );
}

export function PlayersPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [week, setWeek] = useState(1);
  const [props, setProps] = useState<PlayerPropPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Follow the sport's actual current week rather than a hardcoded
  // season/week, matching GamesPage's own current-week lookup.
  useEffect(() => {
    let cancelled = false;
    api.currentWeek()
      .then((cw) => { if (!cancelled) { setSeason(cw.season); setWeek(cw.week); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api, sport]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setProps([]);
    api.playerProps(season, week)
      .then((fetched) => { if (!cancelled) setProps(fetched); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, season, week]);

  const filtered = useMemo(() => {
    const named = props.filter(isRealPlayer);
    const query = search.trim().toLowerCase();
    if (!query) return named;
    return named.filter((p) => p.player_name.toLowerCase().includes(query) || p.recent_team.toLowerCase().includes(query));
  }, [props, search]);

  const grouped = useMemo(() => groupByPosition(filtered), [filtered]);
  const hasAny = POSITION_ORDER.some((position) => grouped[position].length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-sp-text">Week {week} Top Players</h2>
          <p className="text-xs text-sp-text-faint">The week's best players by position, ranked by projected yardage.</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          className="rounded-lg border border-sp-border bg-sp-850/60 px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-text-faint focus:outline-none focus:ring-1 focus:ring-sp-gold"
        />
      </div>
      {loading && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!loading && !error && !hasAny && (
        <p className="text-sm text-sp-text-faint">No player predictions available for this week yet.</p>
      )}
      {!loading && !error && hasAny && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {POSITION_ORDER.map((position) => (
            <SpotlightCard key={position} position={position} players={grouped[position]} sport={sport} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-8">
        {POSITION_ORDER.map((position) => {
          const players = grouped[position];
          if (players.length === 0) return null;
          return (
            <section key={position} aria-label={`${POSITION_LABEL[position]} rankings`}>
              <h3 className="mb-3 flex items-baseline gap-2 font-display text-base font-semibold uppercase tracking-wider text-sp-text-faint">
                {POSITION_LABEL[position]}
                <span className="text-xs font-normal text-sp-text-dim">({players.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((prop, i) => (
                  <div key={prop.player_id} className="flex items-center justify-between gap-3 rounded-lg border border-sp-border bg-sp-850/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 shrink-0 text-right font-mono text-xs text-sp-text-faint">{i + 1}</span>
                      <TeamLogo sport={sport} team={prop.recent_team} size="sm" />
                      <span className="truncate text-sp-text font-medium">
                        {prop.player_name}{" "}
                        <span className="text-xs text-sp-text-faint font-normal">({prop.recent_team})</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-sp-text-dim">
                      <span>{keyStatLabel(position)} {Math.round(keyYardage(prop))}</span>
                      <TdBadge prob={prop.anytime_td_prob} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
