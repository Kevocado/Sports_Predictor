import type { FormEntry } from "../types";

const RESULT_TONE: Record<FormEntry["result"], string> = {
  W: "bg-win/20 text-win",
  L: "bg-loss/20 text-loss",
  T: "bg-sp-700/60 text-sp-text-dim",
};

/** `wrap={false}` keeps the strip on one line, for table cells. */
export function FormStrip({ entries, wrap = true }: { entries: FormEntry[]; wrap?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <div className={`flex gap-1.5 ${wrap ? "flex-wrap" : "flex-nowrap"}`}>
      {entries.map((e) => (
        <span
          key={e.game_id}
          title={`${e.is_home ? "vs" : "at"} ${e.opponent} — ${e.team_score}-${e.opponent_score}`}
          className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${RESULT_TONE[e.result]}`}
        >
          {e.result}
        </span>
      ))}
    </div>
  );
}
