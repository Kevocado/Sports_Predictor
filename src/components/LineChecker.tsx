import { useMemo, useState } from "react";
import type { PlayerPropPrediction } from "../types";
import { checkLine, lineOptions, MARKET_LABEL } from "../lib/lineCheck";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FIELD = "w-full rounded-lg border border-sp-border bg-sp-800 px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent";

/**
 * "Check a line": pick a player, pick a stat, type the sportsbook's line, read OUR probability of the over.
 *
 * It answers from the model's own distribution for that player (shipped on the prop row as `line_check`), so the
 * number is the model's estimate and not a price. It makes no recommendation and never says "bet".
 */
export function LineChecker({ players }: { players: PlayerPropPrediction[] }) {
  const choices = useMemo(
    () => players.map((p) => ({ p, options: lineOptions(p) })).filter((c) => c.options.length > 0)
      .sort((a, b) => a.p.recent_team.localeCompare(b.p.recent_team) || a.p.player_name.localeCompare(b.p.player_name)),
    [players],
  );
  const [playerId, setPlayerId] = useState("");
  const [market, setMarket] = useState("");
  const [lineText, setLineText] = useState("");

  if (choices.length === 0) return null;

  const current = choices.find((c) => String(c.p.player_id) === playerId);
  const activeMarket = current?.options.find((o) => o.market === market)?.market ?? current?.options[0]?.market ?? "";
  const projection = current ? (current.p as unknown as Record<string, number | undefined>)[activeMarket] : undefined;
  const recent = current?.p.recent_avg;
  const recentValue = recent ? (recent as Record<string, number | undefined>)[activeMarket] : undefined;
  const typed = lineText.trim() === "" ? null : Number(lineText);
  const answer = current && typed !== null ? checkLine(current.p, activeMarket, typed) : null;
  const teams = [...new Set(choices.map((c) => c.p.recent_team))];

  return (
    <section aria-label="Check a line" data-testid="line-checker" className="flex flex-col gap-3 rounded-xl border border-sp-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-sp-text">Check a line</h3>
        <p className="text-xs leading-snug text-sp-text-faint">Pick a player and a stat, type the sportsbook's line, and see the model's chance of the over.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-sp-text-dim">Player
          <select data-testid="lc-player" className={FIELD} value={playerId}
            onChange={(e) => { setPlayerId(e.target.value); setMarket(""); setLineText(""); }}>
            <option value="">Choose a player</option>
            {teams.map((team) => (
              <optgroup key={team} label={team}>
                {choices.filter((c) => c.p.recent_team === team).map((c) => (
                  <option key={c.p.player_id} value={String(c.p.player_id)}>{c.p.player_name} · {c.p.position}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-sp-text-dim">Stat
          <select data-testid="lc-market" className={FIELD} disabled={!current} value={activeMarket}
            onChange={(e) => { setMarket(e.target.value); setLineText(""); }}>
            {(current?.options ?? []).map((o) => <option key={o.market} value={o.market}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-sp-text-dim">Line
          <input data-testid="lc-line" className={FIELD} inputMode="decimal" type="number" step="0.5" min="0" disabled={!current}
            placeholder={projection !== undefined ? `e.g. ${Math.round(projection * 2) / 2}` : "e.g. 64.5"} value={lineText}
            onChange={(e) => setLineText(e.target.value)} />
        </label>
      </div>

      <div aria-live="polite" data-testid="lc-result" className="min-h-[3rem] text-sm">
        {!current && <p className="text-sp-text-faint">Choose a player to begin.</p>}
        {current && answer === null && <p className="text-sp-text-faint">Type a line for {MARKET_LABEL[activeMarket] ?? activeMarket}.</p>}
        {answer?.status === "invalid" && <p className="text-sp-text-faint">Enter a number of zero or more.</p>}
        {answer?.status === "need-half-point" && <p className="text-sp-text-dim">Use a half-point line such as 4.5 (a whole number can push, and the model prices only half-point lines for counts).</p>}
        {answer?.status === "not-priced" && <p className="text-sp-text-dim">{answer.reason}</p>}
        {answer?.status === "ok" && (
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span><span className="text-sp-text-dim">Over {typed}</span> <strong data-testid="lc-over" className="text-lg text-sp-text tabular-nums">{answer.edge === "high" ? `${pct(answer.pOver)}+` : answer.edge === "low" ? `${pct(answer.pOver)} or less` : pct(answer.pOver)}</strong></span>
            <span><span className="text-sp-text-dim">Under</span> <strong data-testid="lc-under" className="text-lg text-sp-text tabular-nums">{answer.edge === "low" ? `${pct(answer.pUnder)}+` : answer.edge === "high" ? `${pct(answer.pUnder)} or less` : pct(answer.pUnder)}</strong></span>
          </p>
        )}
        {current && (projection !== undefined || recentValue !== undefined) && (
          <p data-testid="lc-context" className="mt-1 text-xs text-sp-text-faint">
            {projection !== undefined && <>Model projection {Math.round(projection * 10) / 10}</>}
            {projection !== undefined && recentValue !== undefined && " · "}
            {recentValue !== undefined && <>his {recent?.games ?? 5}-game avg {recentValue}</>}
          </p>
        )}
      </div>
      <p className="text-xs leading-snug text-sp-text-faint">
        The model's own estimate, not a bookmaker's price and not betting advice. Yardage chances are adjusted for the model's
        past over-confidence (back-tested on four seasons of made-up lines), and lines far from the projection are still the
        least reliable end of the range.
      </p>
    </section>
  );
}
