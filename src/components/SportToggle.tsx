import { useSport } from "../context/SportContext";
import type { Sport } from "../types";

const SPORTS: { key: Sport; label: string }[] = [
  { key: "nfl", label: "NFL" },
  { key: "cfb", label: "CFB" },
];

export function SportToggle() {
  const { sport, setSport } = useSport();
  return (
    <div className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
      {SPORTS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSport(key)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            sport === key ? (key === "nfl" ? "bg-nfl-blue text-white" : "bg-cfb-orange text-white") : "text-sp-text-dim hover:text-sp-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
