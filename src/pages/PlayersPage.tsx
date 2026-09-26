import { useEffect, useMemo, useState } from "react";
import { TeamLogo } from "../components/TeamName";
import { epa, share } from "../lib/hubFormat";
import { keyYardage, POSITION_ORDER, type SkillPosition } from "../lib/playerRank";
import { EmptyState, ErrorState, pct, Skeleton, StatTable, type Column } from "../predictor-ui";
import type { HubPlayer, HubPlayersResponse, PlayerPropPrediction, Sport } from "../types";
import { useSport } from "../context/SportContext";

const FALLBACK_SEASON = 2026;

const POSITION_LABEL: Record<SkillPosition, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};

const EPA_TIP: Record<Sport, string> = {
  nfl: "Expected points added over the season: how much this player's plays moved their team's scoring chances.",
  cfb: "Predicted points added over the season (college football's EPA): how much this player's plays moved their team's scoring chances.",
};
const PROJ_TIP = "The model's yardage projection for this week's game (passing for quarterbacks, rushing for running backs, receiving otherwise), with the chance they score.";

// The feeds occasionally emit placeholder rows with no real player behind them.
const isRealPlayer = (name: string) => !["", "team"].includes(name.trim().toLowerCase());

type Row = HubPlayer & { prop: PlayerPropPrediction | null };
type Col = Column<Row> & { optional?: boolean };

const count = (key: keyof HubPlayer, label: string, optional = false): Col => ({
  key, label, numeric: true, optional, value: (p) => p[key] as number,
});

function columns(position: SkillPosition, sport: Sport): Col[] {
  const player: Col = {
    key: "name", label: "Player", value: (p) => p.name,
    render: (p) => (
      <span className="inline-flex items-center gap-2">
        <TeamLogo sport={sport} team={p.team} size="sm" />
        <span>
          {p.name} <span className="text-xs font-normal text-pr-text-dim">{p.team}</span>
        </span>
      </span>
    ),
  };
  const byPosition: Record<SkillPosition, Col[]> = {
    QB: [count("passing_yards", "Pass yds"), count("passing_tds", "Pass TD"), count("interceptions", "INT", true), count("rushing_yards", "Rush yds")],
    RB: [count("carries", "Carries"), count("rushing_yards", "Rush yds"), count("rushing_tds", "Rush TD"), count("receptions", "Rec"), count("receiving_yards", "Rec yds")],
    WR: [],
    TE: [],
  };
  const receiving: Col[] = [
    count("targets", "Targets", true),
    { key: "target_share", label: "Target share", numeric: true, optional: true, value: (p) => p.target_share, render: (p) => share(p.target_share) },
    count("receptions", "Rec"), count("receiving_yards", "Rec yds"), count("receiving_tds", "Rec TD"),
  ];
  byPosition.WR = receiving;
  byPosition.TE = receiving;
  return [
    player,
    count("games", "G"),
    ...byPosition[position],
    { key: "epa", label: "EPA", numeric: true, tooltip: EPA_TIP[sport], value: (p) => p.epa_total, render: (p) => epa(p.epa_total) },
    {
      key: "proj", label: "Projected this week", numeric: true, tooltip: PROJ_TIP,
      value: (p) => (p.prop ? keyYardage(p.prop) : null),
      render: (p) => p.prop ? (
        <span className="inline-flex items-baseline gap-2">
          <span>{Math.round(keyYardage(p.prop))}</span>
          <span className="text-xs text-pr-text-dim">TD {pct(p.prop.anytime_td_prob)}</span>
        </span>
      ) : "—",
    },
  ];
}

function Leaders({ position, leaders }: { position: SkillPosition; leaders: HubPlayer[] }) {
  if (leaders.length === 0) return null;
  return (
    <section className="mb-5 rounded-pr border border-pr-rule bg-pr-panel p-4">
      <h3 id={`leaders-${position}`} className="font-pr-display text-sm font-semibold uppercase tracking-wide text-pr-text-dim">
        {POSITION_LABEL[position]}: EPA leaders
      </h3>
      <ol aria-labelledby={`leaders-${position}`} className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-5">
        {leaders.slice(0, 5).map((p, i) => (
          <li key={p.player_id} className="flex items-baseline gap-2 text-sm">
            <span className="w-4 shrink-0 font-mono text-xs text-pr-text-dim">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-pr-text">
              {p.name} <span className="text-xs text-pr-text-dim">{p.team}</span>
            </span>
            <span className="font-mono tabular-nums text-pr-text">{epa(p.epa_total)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Season player table by position at PL depth: volume, touchdowns,
 * efficiency (EPA) and, where the model has one, this week's projection.
 */
export function PlayersPage() {
  const { api, sport } = useSport();
  const [when, setWhen] = useState<{ season: number; week: number | null } | null>(null);
  const [data, setData] = useState<HubPlayersResponse | null>(null);
  const [props, setProps] = useState<PlayerPropPrediction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [position, setPosition] = useState<SkillPosition>("QB");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Clear the previous sport's table so it never shows under this sport's logos.
    setWhen(null); setData(null);
    api.currentWeek()
      .then((cw) => { if (!cancelled) setWhen({ season: cw.season, week: cw.week }); })
      .catch(() => { if (!cancelled) setWhen({ season: FALLBACK_SEASON, week: null }); });
    return () => { cancelled = true; };
  }, [api, sport]);

  useEffect(() => {
    if (!when) return;
    let cancelled = false;
    setData(null); setError(null); setProps([]);
    api.hubPlayers(when.season)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    // Projections are a bonus column: without them the table still stands.
    if (when.week != null) {
      api.playerProps(when.season, when.week)
        .then((res) => { if (!cancelled) setProps(res); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [api, when, attempt]);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(props.map((p) => [p.player_id, p]));
    const byName = new Map(props.map((p) => [`${p.player_name}|${p.recent_team}`, p]));
    return (data?.players ?? [])
      .filter((p) => isRealPlayer(p.name))
      .map((p) => ({ ...p, prop: byId.get(p.player_id) ?? byName.get(`${p.name}|${p.team}`) ?? null }));
  }, [data, props]);

  const atPosition = useMemo(() => rows.filter((p) => p.position === position), [rows, position]);
  // A column the feed never fills (college targets, say) reads as a wall of
  // zeros; drop it rather than imply every receiver saw no targets.
  const cols = useMemo(
    () => columns(position, sport).filter((c) => !c.optional || atPosition.some((p) => { const v = c.value(p); return v != null && v !== 0; })),
    [position, sport, atPosition],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? atPosition.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)) : atPosition;
  }, [atPosition, search]);

  if (error) return <ErrorState message={`Couldn't load player stats: ${error}`} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <Skeleton label="Loading players…" />;
  if (rows.length === 0) return <EmptyState message={`No player stats for ${when?.season ?? "this"} season yet.`} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-pr-display text-2xl font-semibold uppercase tracking-wide text-pr-text">Players</h2>
          <p className="text-xs text-pr-text-dim">
            {data.season} season to date{when?.week != null ? `, with week ${when.week} projections` : ""}.
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team…"
          aria-label="Search players"
          className="rounded-pr border border-pr-rule bg-pr-panel px-3 py-1.5 text-sm text-pr-text placeholder:text-pr-text-faint focus:border-pr-accent focus:outline-none"
        />
      </div>
      <div role="group" aria-label="Position" className="mb-4 flex w-fit gap-1 rounded-pr border border-pr-rule bg-pr-panel p-1">
        {POSITION_ORDER.map((pos) => (
          <button
            key={pos}
            type="button"
            aria-pressed={pos === position}
            onClick={() => setPosition(pos)}
            className={`rounded-pr px-3 py-1 font-pr-display text-sm font-semibold uppercase tracking-wide ${pos === position ? "bg-pr-accent text-pr-accent-ink" : "text-pr-text-dim hover:text-pr-text"}`}
          >
            {pos}
          </button>
        ))}
      </div>
      <Leaders position={position} leaders={data.leaderboards[position] ?? []} />
      {visible.length === 0 ? (
        <EmptyState
          message={search ? "No players match." : `No ${POSITION_LABEL[position].toLowerCase()} with stats yet.`}
          action={search ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
        />
      ) : (
        <StatTable
          key={position}
          rows={visible}
          columns={cols}
          rowKey={(p) => p.player_id}
          initialSort={{ key: "epa", dir: "desc" }}
          caption={`${data.season} ${POSITION_LABEL[position].toLowerCase()}`}
        />
      )}
    </div>
  );
}
