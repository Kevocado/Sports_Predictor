import { Fragment, useEffect, useMemo, useState } from "react";
import { TeamLogo } from "../components/TeamName";
import type { FormEntry, Sport, SportApi, StandingsEntry, TeamRanking } from "../types";

export interface TeamHubRow {
  team: string;
  rank: number;
  rating: number;
  wins: number;
  losses: number;
  ties: number;
  group: string | null;
  pointDiff?: number;
  projectedWins?: number;
  projectedLosses?: number;
  rankDelta?: number;
  /** Recent-form string from the rankings payload (e.g. "WWLWW"). */
  form?: string | null;
}

function groupOf(r: TeamRanking): string | null {
  return r.division ?? r.conference ?? null;
}

/**
 * Join the power-rankings list (every ranked team) with the standings rows.
 * Drops the known-stale OAK duplicate when LV is present so the table never
 * shows the same franchise twice; OAK alone is kept so real data is hidden.
 */
export function mergeTeamRows(rankings: TeamRanking[], standings: StandingsEntry[]): TeamHubRow[] {
  const byTeam = new Map(standings.map((s) => [s.team, s]));
  const hasLV = rankings.some((r) => r.team === "LV");
  return rankings
    .filter((r) => r.team !== "OAK" || !hasLV)
    .map((r) => {
      const s = byTeam.get(r.team);
      return {
        team: r.team,
        rank: r.rank,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        group: groupOf(r),
        pointDiff: s?.point_diff,
        projectedWins: s?.projected_wins,
        projectedLosses: s?.projected_losses,
        rankDelta: s?.division_rank_delta ?? s?.conference_rank_delta,
        form: r.recent_form ?? null,
      };
    });
}

type SortKey = "rank" | "rating" | "wins" | "pointDiff" | "projectedWins";

const SORT_LABELS: Record<SortKey, string> = {
  rank: "Rank",
  rating: "Rating",
  wins: "Record",
  pointDiff: "+/-",
  projectedWins: "Proj",
};

function sortValue(row: TeamHubRow, key: SortKey): number {
  switch (key) {
    case "rank": return row.rank;
    case "rating": return row.rating;
    case "wins": return row.wins + row.ties * 0.5 - row.losses * 0.001;
    case "pointDiff": return row.pointDiff ?? Number.NEGATIVE_INFINITY;
    case "projectedWins": return row.projectedWins ?? Number.NEGATIVE_INFINITY;
  }
}

function recordOf(row: TeamHubRow): string {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;
}

function Trend({ delta }: { delta?: number }) {
  if (delta == null || delta === 0) return <span className="text-sp-text-faint">–</span>;
  const up = delta < 0; // negative delta = projected to climb (lower rank number)
  return (
    <span className={up ? "text-win" : "text-loss"} title={up ? "Projected to climb" : "Projected to fall"}>
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  );
}

function FormChips({ form, team }: { form?: string | null; team: string }) {
  const results = (form ?? "").toUpperCase().split("").filter((c) => c === "W" || c === "L" || c === "T");
  if (results.length === 0) return <span className="text-sp-text-faint">—</span>;
  return (
    <span data-testid={`team-form-chips-${team}`} className="inline-flex items-center justify-end gap-0.5">
      {results.map((r, i) => (
        <span
          key={i}
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${r === "W" ? "bg-win/20 text-win" : r === "L" ? "bg-loss/20 text-loss" : "bg-sp-text-faint/20 text-sp-text-dim"}`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function FormDetail({ entries }: { entries: FormEntry[] }) {
  if (entries.length === 0) return <p className="text-xs text-sp-text-faint">No recent games.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map((e) => (
        <li
          key={e.game_id}
          className="flex items-center gap-2 rounded-lg border border-sp-border/60 bg-sp-900/60 px-2.5 py-1.5 text-xs"
          title={`${e.gameday} ${e.is_home ? "vs" : "@"} ${e.opponent}`}
        >
          <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${e.result === "W" ? "bg-win/20 text-win" : e.result === "L" ? "bg-loss/20 text-loss" : "bg-sp-text-faint/20 text-sp-text-dim"}`}>
            {e.result}
          </span>
          <span className="text-sp-text-dim">{e.is_home ? "vs" : "@"} {e.opponent}</span>
          <span className="font-mono text-sp-text">{e.team_score}-{e.opponent_score}</span>
        </li>
      ))}
    </ul>
  );
}

export function TeamHubPage({ api, season, sport }: { api: SportApi; season: number; sport: Sport }) {
  const [rows, setRows] = useState<TeamHubRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, FormEntry[]>>({});
  const [formLoading, setFormLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(null); setExpanded(null); setForms({});
    Promise.all([api.powerRankings(season), api.standings(season)])
      .then(([pr, st]) => { if (!cancelled) setRows(mergeTeamRows(pr.rankings, st)); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [api, season]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) if (r.group) set.add(r.group);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (rows ?? []).filter(
      (r) => (group === "all" || r.group === group) && (!q || r.team.toLowerCase().includes(q)),
    );
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir);
  }, [rows, query, group, sortKey, sortAsc]);

  const maxRating = useMemo(() => Math.max(1, ...(rows ?? []).map((r) => r.rating)), [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "rank");
    }
  }

  function toggleExpand(team: string) {
    if (expanded === team) {
      setExpanded(null);
      return;
    }
    setExpanded(team);
    if (!forms[team] && formLoading !== team) {
      setFormLoading(team);
      api.teamForm(team, season, 5)
        .then((f) => setForms((prev) => ({ ...prev, [team]: f.recent_form })))
        .catch(() => setForms((prev) => ({ ...prev, [team]: [] })))
        .finally(() => setFormLoading((cur) => (cur === team ? null : cur)));
    }
  }

  if (error) return <p role="alert" className="text-sm text-loss">{error}</p>;
  if (!rows) return <p className="text-sm text-sp-text-faint">Loading team hub…</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-sp-text">Team Hub</h2>
          <p className="text-xs text-sp-text-faint">
            Power ratings, records, projections, and recent form for every ranked team. Click a row for last-5 games with scores.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams…"
            aria-label="Search teams"
            className="rounded-lg border border-sp-border bg-sp-900/70 px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-text-faint focus:border-sp-gold focus:outline-none"
          />
          {groups.length > 1 && (
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Filter by group"
              className="rounded-lg border border-sp-border bg-sp-900/70 px-3 py-1.5 text-sm text-sp-text focus:border-sp-gold focus:outline-none"
            >
              <option value="all">All groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-sp-text-faint">No teams match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sp-border bg-sp-850/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sp-border/60 text-left text-xs text-sp-text-faint">
                {(["rank", "team", "rating", "wins", "pointDiff", "projectedWins", "form", "trend"] as const).map((key) => {
                  if (key === "team") {
                    return <th key={key} className="px-3 py-2.5 font-medium uppercase tracking-wider">Team</th>;
                  }
                  if (key === "form" || key === "trend") {
                    return <th key={key} className="px-3 py-2.5 text-right font-medium uppercase tracking-wider">{key === "form" ? "Form" : "Trend"}</th>;
                  }
                  return (
                    <th key={key} className={`px-3 py-2.5 font-medium ${key === "rank" ? "" : "text-right"}`}>
                      <button
                        onClick={() => toggleSort(key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-sp-text ${sortKey === key ? "text-sp-gold" : ""}`}
                      >
                        {SORT_LABELS[key]}
                        {sortKey === key && <span aria-hidden>{sortAsc ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody data-testid="team-hub-rows">
              {visible.map((row) => (
                <Fragment key={row.team}>
                  <tr
                    data-testid={`team-hub-row-${row.team}`}
                    data-team={row.team}
                    className={`border-b border-sp-border/30 transition hover:bg-sp-800/40 ${expanded === row.team ? "bg-sp-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-sp-text-dim">{row.rank}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleExpand(row.team)} className="flex items-center gap-2.5 text-left" aria-expanded={expanded === row.team}>
                        <TeamLogo sport={sport} team={row.team} size="sm" />
                        <span>
                          <span className="block font-medium leading-tight text-sp-text">{row.team}</span>
                          {row.group && <span className="block text-[11px] leading-tight text-sp-text-faint">{row.group}</span>}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sp-700/60">
                          <div className="h-full rounded-full bg-sp-gold" style={{ width: `${(row.rating / maxRating) * 100}%` }} />
                        </div>
                        <span className="font-mono text-sp-text-dim">{Math.round(row.rating)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sp-text">{recordOf(row)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${(row.pointDiff ?? 0) >= 0 ? "text-win" : "text-loss"}`}>
                      {row.pointDiff == null ? "—" : `${row.pointDiff > 0 ? "+" : ""}${Math.round(row.pointDiff)}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sp-text-dim">
                      {row.projectedWins == null ? "—" : `${row.projectedWins.toFixed(1)}-${(row.projectedLosses ?? 0).toFixed(1)}`}
                    </td>
                    <td className="px-3 py-2 text-right"><FormChips form={row.form} team={row.team} /></td>
                    <td className="px-3 py-2 text-right"><Trend delta={row.rankDelta} /></td>
                  </tr>
                  {expanded === row.team && (
                    <tr key={`${row.team}-form`} className="border-b border-sp-border/30 bg-sp-900/40">
                      <td colSpan={8} className="px-3 py-3" data-testid={`team-form-${row.team}`}>
                        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-sp-text-faint">
                          Last 5 — {row.team}
                        </p>
                        {formLoading === row.team ? (
                          <p className="text-xs text-sp-text-faint">Loading form…</p>
                        ) : (
                          <FormDetail entries={forms[row.team] ?? []} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
