import { useState } from "react";
import { TeamChip } from "../predictor-ui";
import { teamLogoUrl } from "../data/teamLogos";
import { useSport } from "../context/SportContext";
import type { Sport } from "../types";

/**
 * A short code for a team that has no logo: abbreviations stay as they are
 * ("KC"), multi-word names become initials ("Ohio State" → "OS"), single
 * short words are upper-cased ("Army" → "ARMY").
 */
export function teamCode(team: string): string {
  const words = team.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].length <= 4 ? words[0].toUpperCase() : words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

type LogoSize = "sm" | "md" | "lg";

const SIZES: Record<LogoSize, string> = {
  sm: "h-7 w-7",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

/** Team logo from the ESPN mapping, falling back to the initial-letter avatar. */
export function TeamLogo({ sport, team, size = "md" }: { sport: Sport; team: string; size?: LogoSize }) {
  const [failed, setFailed] = useState(false);
  const url = teamLogoUrl(sport, team);
  if (!url || failed) {
    // No real team colour is known here, so the chip stays neutral rather
    // than inventing one.
    return <TeamChip code={teamCode(team)} name={team} />;
  }
  return (
    <img
      src={url}
      alt={`${team} logo`}
      title={team}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] ${SIZES[size]}`}
    />
  );
}

export function TeamName({ team, size = "md" }: { team: string; size?: LogoSize }) {
  const { sport } = useSport();
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <TeamLogo sport={sport} team={team} size={size} />
      <span className="font-display text-base font-semibold uppercase leading-tight tracking-wider text-sp-text">{team}</span>
    </div>
  );
}
