import { siteLinks, type SiteLink } from "../predictor-ui";

// Every Predictor site, for the family switcher: labels and links come from the shared list in predictor-ui.
// NFL and CFB live in this one app, so both stay relative (?sport=); the shared helper only makes the CURRENT one so.
const HOST = "40-160-91-131.sslip.io";
export const SITES: SiteLink[] = siteLinks("nfl", HOST).map((link) => (link.sport === "cfb" ? { ...link, href: "?sport=cfb" } : link));
