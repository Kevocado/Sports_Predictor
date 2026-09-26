import { useEffect, useMemo, useState } from "react";
import { FormStrip } from "../components/FormStrip";
import { TeamLogo } from "../components/TeamName";
import { epa, perGame, share, signedInt } from "../lib/hubFormat";
import { EmptyState, ErrorState, Skeleton, StatTable, streak, type Column } from "../predictor-ui";
import type { FormEntry, HubRecentGame, HubTeam, HubTeamsResponse, Sport, SportApi } from "../types";

const EPA_TIP = "Expected points added per play: how much each snap moved the team's scoring chances. Above 0 beats an average offense.";
const DEF_EPA_TIP = "Expected points allowed per play. Lower is better: below 0 means the defense takes points away.";
const SUCCESS_TIP = "Share of plays that gained enough yards to keep the drive on schedule.";

function recordOf(t: HubTeam): string {
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
}

function trendWord(t: HubTeam): string {
  switch (t.form_trend) {
    case "up": return "Rising";
    case "down": return "Slipping";
    case "steady": return "Steady";
    default: return t.games === 0 ? "New this season" : "Early days";
  }
}

// FormStrip reads oldest first; recent_games arrives newest first.
function formEntries(t: HubTeam): FormEntry[] {
  return [...t.recent_games].reverse().map((g) => ({ ...g, game_id: `${g.gameday}-${g.opponent}` }));
}

function gameLine(g: HubRecentGame): string {
  return `${g.result} ${g.team_score}–${g.opponent_score} ${g.is_home ? "v" : "at"} ${g.opponent}`;
}

function TeamDetail({ team }: { team: HubTeam }) {
  const extras: [string, string][] = [
    ["Streak", streak(team.streak)],
    ["Yards/play", perGame(team.yards_per_play)],
    ["Pass rate", share(team.pass_rate)],
    ["Def success rate", share(team.def_success_rate)],
  ];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
      <div>
        <p className="mb-1.5 font-pr-display text-xs font-semibold uppercase tracking-wide text-pr-text-dim">Last {team.recent_games.length || 5}</p>
        {team.recent_games.length === 0 ? (
          <p className="text-xs text-pr-text-dim">No games yet this season.</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-sm tabular-nums">
            {team.recent_games.map((g) => (
              <li key={`${g.gameday}-${g.opponent}`} className="text-pr-text">
                {gameLine(g)} <span className="text-xs text-pr-text-dim">{g.gameday}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        {extras.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-pr-text-dim">{label}</dt>
            <dd className="font-mono tabular-nums text-pr-text">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function columns(sport: Sport, advanced: boolean, hasTurnovers: boolean): Column<HubTeam>[] {
  const played = (t: HubTeam) => t.games > 0;
  const cols: (Column<HubTeam> | false)[] = [
    {
      key: "team", label: "Team", value: (t) => t.team,
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          <TeamLogo sport={sport} team={t.team} size="sm" />
          {t.team}
        </span>
      ),
    },
    {
      key: "record", label: "Record", numeric: true,
      value: (t) => (played(t) ? (t.wins + t.ties / 2) / t.games : null),
      render: recordOf,
    },
    advanced && { key: "off_epa", label: "Off EPA/play", numeric: true, tooltip: EPA_TIP, value: (t) => t.off_epa_play, render: (t) => epa(t.off_epa_play) },
    // Lower is better on defense, so sort it the other way up by negating.
    advanced && { key: "def_epa", label: "Def EPA/play", numeric: true, tooltip: DEF_EPA_TIP, value: (t) => (t.def_epa_play == null ? null : -t.def_epa_play), render: (t) => epa(t.def_epa_play) },
    advanced && { key: "success", label: "Success rate", numeric: true, tooltip: SUCCESS_TIP, value: (t) => t.off_success_rate, render: (t) => share(t.off_success_rate) },
    { key: "pf", label: "Pts for/g", numeric: true, value: (t) => t.points_for_pg, render: (t) => perGame(t.points_for_pg) },
    { key: "pa", label: "Pts against/g", numeric: true, value: (t) => (t.points_against_pg == null ? null : -t.points_against_pg), render: (t) => perGame(t.points_against_pg) },
    hasTurnovers && { key: "to", label: "Turnovers ±", numeric: true, value: (t) => t.turnover_margin, render: (t) => signedInt(t.turnover_margin) },
    {
      key: "form", label: "Form",
      value: (t) => (played(t) ? t.form.filter((r) => r === "W").length : null),
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          <FormStrip entries={formEntries(t)} wrap={false} />
          <span className="text-xs text-pr-text-dim">{trendWord(t)}</span>
        </span>
      ),
    },
  ];
  return cols.filter((c): c is Column<HubTeam> => c !== false);
}

/**
 * Season team table at PL depth: record, efficiency (EPA per play, success
 * rate), scoring, turnovers and form, sortable, one row expanding into the
 * last five results.
 */
export function TeamHubPage({ api, season, sport }: { api: SportApi; season: number; sport: Sport }) {
  const [data, setData] = useState<HubTeamsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    api.hubTeams(season)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [api, season, attempt]);

  const advanced = data?.advanced_available !== false;
  const cols = useMemo(
    () => columns(sport, advanced, (data?.teams ?? []).some((t) => t.turnover_margin != null)),
    [sport, advanced, data],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.teams ?? []).filter((t) => !q || t.team.toLowerCase().includes(q));
  }, [data, query]);

  if (error) return <ErrorState message={`Couldn't load team stats: ${error}`} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <Skeleton label="Loading teams…" />;
  if (data.teams.length === 0) return <EmptyState message={`No team stats for ${season} yet.`} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-pr-display text-2xl font-semibold uppercase tracking-wide text-pr-text">Teams</h2>
          <p className="text-xs text-pr-text-dim">{season} season. Pick a header to sort; open a team for its last five games.</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams…"
          aria-label="Search teams"
          className="rounded-pr border border-pr-rule bg-pr-panel px-3 py-1.5 text-sm text-pr-text placeholder:text-pr-text-faint focus:border-pr-accent focus:outline-none"
        />
      </div>
      {!advanced && (
        <p role="status" className="mb-3 rounded-pr border border-pr-rule bg-pr-panel px-3 py-2 text-sm text-pr-text-dim">
          Advanced stats unavailable right now. Showing results and scoring only.
        </p>
      )}
      {visible.length === 0 ? (
        <EmptyState message="No teams match." action={{ label: "Clear search", onClick: () => setQuery("") }} />
      ) : (
        <StatTable
          rows={visible}
          columns={cols}
          rowKey={(t) => t.team}
          initialSort={{ key: "record", dir: "desc" }}
          caption={`${season} team stats`}
          expand={(t) => <TeamDetail team={t} />}
        />
      )}
    </div>
  );
}
