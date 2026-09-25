import type { SiteLink } from "../predictor-ui";

// Every Predictor site, for the family switcher. NFL and CFB live in this
// app (?sport=); the others are their own VPS subdomains. Change the hosts
// here when the real domain lands.
export const SITES: SiteLink[] = [
  { sport: "pl", label: "PL", href: "https://pl.40-160-91-131.sslip.io" },
  { sport: "f1", label: "F1", href: "https://f1.40-160-91-131.sslip.io" },
  { sport: "nfl", label: "NFL", href: "?sport=nfl" },
  { sport: "cfb", label: "CFB", href: "?sport=cfb" },
  { sport: "nba", label: "NBA", href: "https://nba.40-160-91-131.sslip.io" },
];
