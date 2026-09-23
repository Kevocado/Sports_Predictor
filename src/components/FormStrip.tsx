import type { FormEntry } from "../types";

const RESULT_TONE: Record<FormEntry["result"], string> = {
  W: "bg-win/20 text-win",
  L: "bg-loss/20 text-loss",
  T: "bg-sp-700/60 text-sp-text-dim",
};

export function FormStrip({ entries }: { entries: FormEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <span
          key={e.game_id}
          title={`${e.is_home ? "vs" : "at"} ${e.opponent} — ${e.team_score}-${e.opponent_score}`}
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${RESULT_TONE[e.result]}`}
        >
          {e.result}
        </span>
      ))}
    </div>
  );
}
