/**
 * The Caddyfile is deployed, not compiled, so a block that does not parse is
 * found in production — and so is a block that parses but forwards too much.
 * These read it and pin the rules that are easy to break while editing for a
 * good reason.
 *
 * **The rule: the explainer is a different service, so its errors are not ours to
 * publish.**
 *
 * `reverse_proxy` passes an upstream response through *verbatim*, body included.
 * Every FastAPI proxy in this family — PL's is the one that survived NBA's and
 * F1's removals — deliberately does the opposite: every non-2xx becomes a fixed
 * `502 {"detail": "The summary service is not available."}`, because "an
 * explainer error can carry key material or an internal path". Caddy forwarding
 * the body undoes that decision at the edge, for the one upstream whose error
 * vocabulary nobody on this site has audited.
 *
 * The site is told nothing wrong, so the failure is silent: the panel shows
 * whatever the explainer last said, and nothing in the logs distinguishes an
 * explainer 503 from a deliberate 502.
 *
 * **The matchers are spelled `4xx` and `5xx` because that is all Caddy takes.**
 * Checked against `caddy:2-alpine` (v2.11.4) rather than believed:
 *
 *     status 4xx          accepted
 *     status 2xx          accepted
 *     status ">= 400"     REJECTED -- bad status value '>= 400': Atoi
 *     status 4xx5xx       REJECTED -- bad status value '4xx5xx': Atoi
 *
 * The first two rounds of this fix used `status >= 400` and a test that passed,
 * because the test only checked the *string* and never asked Caddy to parse the
 * file. There is no Caddy in CI, so the guard below exists to stop the unparseable
 * spellings coming back.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caddy = readFileSync(resolve(__dirname, "..", "Caddyfile"), "utf8");

/** The `handle_path /api/explain/*` block, braces counted rather than guessed. */
function blockFor(selector: string): string {
  const at = caddy.indexOf(selector);
  if (at < 0) return "";
  const open = caddy.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < caddy.length; i += 1) {
    if (caddy[i] === "{") depth += 1;
    else if (caddy[i] === "}" && (depth -= 1) === 0) return caddy.slice(open, i + 1);
  }
  return "";
}

/** The block with its comments removed, because a comment is not configuration.
 *
 *  This was not foresight. The first version of the matcher-spelling check
 *  scanned the raw text and failed on the word "pattern" — from a comment
 *  explaining the matcher. A guard that reads prose about the config will
 *  report on the prose, and worse, will be fixed by rewording the comment
 *  instead of the config. `#` to end-of-line is Caddy's own comment rule, so
 *  stripping it is not an approximation.
 */
const explain = () => blockFor("handle_path /api/explain/*").replace(/\s*#.*$/gm, "");
/** Every status range this block claims to intercept. */
const intercepted = () => [...explain().matchAll(/status\s+(\dxx)/g)].map((m) => m[1]);

describe("Caddyfile", () => {
  it("keeps the explainer's error body out of the browser", () => {
    const block = explain();
    expect(block, "no /api/explain block found in the Caddyfile").not.toBe("");
    // A bare `reverse_proxy` forwards the upstream body. The interceptor is what
    // replaces a non-2xx with a message this site chose.
    expect(block).toMatch(/handle_response/);
  });

  it("intercepts 4xx AND 5xx, not just one of them", () => {
    // Both ranges or the guard has a hole. A 4xx-only interceptor passes the
    // "does not forward the body" check while still publishing every 500 and 503
    // the explainer emits -- and a 5xx is the case most likely to carry an
    // internal message, because it is the one that came from inside.
    expect(new Set(intercepted())).toEqual(new Set(["4xx", "5xx"]));
  });

  it("spells the matchers the way Caddy can parse", () => {
    // There is no Caddy in CI, so an unparseable matcher is a production
    // incident. `>= 400` and `4xx5xx` both fail to adapt on v2.11.4; only a bare
    // integer or a single `Nxx` wildcard works.
    const spells = [...explain().matchAll(/status\s+([^\s}]+)/g)].map((m) => m[1]);
    expect(spells.length).toBeGreaterThan(0);
    for (const s of spells) {
      expect(s, `"${s}" does not parse as a Caddy status matcher`).toMatch(/^\d(xx|\d{3})$/);
    }
  });

  it("answers an explainer failure as a 502 the site's own error state understands", () => {
    // PL's proxy returns 502 with a fixed detail string, and the panel's retry is
    // written against that. A 503 or a 500 would land in a different branch of
    // the same UI.
    const replies = [...explain().matchAll(/respond\s+"([^"]*)"\s+(\d{3})/g)];
    expect(replies.length).toBeGreaterThan(0);
    for (const [, body, status] of replies) {
      expect(status).toBe("502");
      // And the two ranges cannot answer differently: one message, not two
      // slightly different ones a reader could tell apart.
      expect(body).toBe("The summary service is not available.");
    }
  });

  it("replies with a literal, never a placeholder that carries upstream content", () => {
    // The interceptor could be written and still echo, by passing an upstream
    // field through: `{rp.error.body}` would restore exactly what this rule
    // exists to keep out. So every replacement body is asserted to be a quoted
    // literal with nothing interpolated into it.
    const bodies = [...explain().matchAll(/respond\s+"([^"]*)"/g)].map((m) => m[1]);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, `the replacement body interpolates something: ${body}`).not.toMatch(/[{}]/);
    }
  });

  it("leaves the explainer's success path alone", () => {
    // The guard is on 4xx/5xx and not on 2xx, because forwarding a 200 is the
    // whole point of the proxy. An interceptor that swallowed 2xx would pass the
    // tests above and break the feature.
    expect(intercepted()).not.toContain("2xx");
  });

  it("still rewrites the prefix to the path the service serves", () => {
    // The security rule must not cost the routing. `handle_path` strips
    // /api/explain and the service serves /explain, so the rewrite is load-
    // bearing and a well-meaning tidy-up could drop it.
    expect(explain()).toMatch(/rewrite\s+\*\s+\/explain\{uri\}/);
  });
});
