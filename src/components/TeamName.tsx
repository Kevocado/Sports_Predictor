const PALETTE = ["#f2a900", "#2e6bd8", "#d8571f", "#22c55e", "#8b5cf6", "#ec4899", "#05d1c8", "#ef4444"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function teamColor(team: string): string {
  return PALETTE[hashString(team) % PALETTE.length];
}

export function teamInitial(team: string): string {
  return team.trim().charAt(0).toUpperCase() || "?";
}

const SIZES: Record<"sm" | "md" | "lg", string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
};

export function TeamName({ team, size = "md" }: { team: string; size?: "sm" | "md" | "lg" }) {
  const color = teamColor(team);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div
        className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size]}`}
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px -2px ${color}88` }}
        title={team}
      >
        {teamInitial(team)}
      </div>
      <span className="text-xs font-semibold leading-tight text-sp-text">{team}</span>
    </div>
  );
}
