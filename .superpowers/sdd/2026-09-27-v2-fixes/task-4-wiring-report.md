# Task 4 wiring report — the spread tile's frame, and the rest of the review blockers

**Date:** 2026-09-27
**Worktree:** `phase4-worktrees/Sports_v2`, branch `v2-wire` (detached at `origin/v2-wire`, 344e742)
**Status:** committed, not pushed. `npm test` 162 passed, `npx tsc -b` exit 0, `npm run lint` 0 errors (1 pre-existing warning in `GamesPage.tsx`, untouched).

---

## 1. The frame: the home team's, and why

**Your reading of `game_outcome.py` is correct.** Here are the lines, from
`NFL_Predictor/src/nfl_predictor/models/game_outcome.py:77-81` (identical in
`phase4-worktrees/CFB_Predictor/src/cfb_predictor/models/game_outcome.py`):

```
77:    """margin ~ Normal(predicted_margin, sigma). home_win_prob = P(margin > 0).
78:    spread_line follows nflverse's convention: the home team's expected
79:    margin (positive means home favored by that many points, negative means
80:    home is an underdog by that many points) — the home team covers when
81:    margin > spread_line. total_points ~ Normal(predicted_total,
```

`margin` is the home team's score minus the away team's, so `predicted_margin` is
home − away; and `spread_line` is defined as **the home team's expected margin**,
so a `spread_line` of `-2.5` is the home team **receiving** 2.5. The two fields
share one frame, and the disagreement between them is
`predicted_margin - spread_line` in that frame. Nothing to argue with.

**I chose: the tile always names the home team, and both of its numbers are
rendered in the home team's own convention.**

The alternative — name the favoured team and convert the line — was rejected
deliberately, and the reason is the product's standard rather than taste. The
convention a field is *defined* in is the one it is *attributed* in. `spread_line`
arrives as one number, in the home frame, and the site's contract with the reader
is to render that number under the name the field is defined against. Converting
it means publishing a derived line under a name the payload never used, and the
site has no second market figure to check the conversion against — it received
one line, and inventing the mirror image of it is a number this site made up.

The old code did worse than convert, though. It picked the name off the model's
`home_win_prob`/`away_win_prob` and then rendered the **market's** line under it:
the team was chosen by one source and the number supplied by another. When the
model favoured the home side that was right by accident, and when it favoured the
away side the home-frame market line was shown under the away team's name — the
reader got the away team's line, in the home frame, which is not a number the
market or the model ever stated.

So the tile now takes the name from the field and the numbers from their own
convention:

```ts
value: spread(game.home_team, -line),   // "KC +2.5"
sub: `model ${signed(-margin)}`,         // "model +3.4"
```

`spread(team, line)` writes a line the way a bettor reads one — a minus is points
that team **gives** — so the home team's own line is `-spread_line`. That is the
same conversion `GameDetailModal.tsx:259` already used for the modal's own line,
which is why the tile and the match-markets paragraph now agree instead of
disagreeing.

**The part that was easy to get wrong, and the reason both numbers flip:** the
tile's stated purpose is *"The disagreement is the point."* A reader who
subtracts the two displayed figures must land on the real disagreement. Flipping
only the line would render `KC +2.5` beside `model −3.4` — 5.9 points of apparent
disagreement where the real figure is 0.9. **Both** halves take the same single
sign flip, so the displayed arithmetic is the payload's arithmetic. That invariant
is now a swept test, not a comment (§4 below).

The tile's guard also changed: it no longer requires `home_win_prob` and
`away_win_prob` to be present. It names the home team because the field says so,
so a probability it does not read is not evidence for anything it shows, and a
missing one is no longer a reason to drop a market the data does carry.

## 2. The away-favoured case, in real numbers

The case the old test got wrong, in its worst shape. Home `KC`, away `BAL`,
market `spread_line: 2.5`, model `predicted_margin: -3.4`, model probabilities
home 38% / away 62% (the model favours the away side).

**Before** — `favoured = away` (from the probabilities), then
`spread("BAL", 2.5)` → `"BAL +2.5"`, sub `"model −3.4"`. That is the market's line
read upside down *and* relabelled: it says the away team is **receiving** 2.5
when the market actually has the home team **giving** 2.5. It sits next to a 62%
away probability and reads plausibly, which is what let it ship.

**After** — `value: "KC −2.5"`, `sub: "model +3.4"`. In the home team's own terms:
the market has KC **giving** 2.5, the model has KC **receiving** 3.4. The two
displayed figures differ by 5.9, and 5.9 is the real disagreement —
`predicted_margin - spread_line = -3.4 - 2.5 = -5.9`. The model's line is the
larger number, so the model is 5.9 points more bearish on the home team than the
market is, and the tile now says that.

For the fixture's own case (`spread_line: -2.5`, `predicted_margin: -3.4`) the
tile reads `KC +2.5` / `model +3.4`: the market has KC receiving 2.5, the model
has KC receiving 3.4, a **0.9**-point disagreement about the home team. That is
the arithmetic the review specified, unchanged.

## 3. The wrong comment

`src/lib/panelFacts.test.ts:95-104` asserted the opposite convention in a comment
(*"A negative spread_line means the home team is giving points"*) and pinned
`"BAL −2.5"` for the away-favoured case. Both the comment and the assertion were
wrong, and the comment was the defect: it told the next reader that a `-2.5` line
was the home team *giving* points, which is backwards. **The test was rewritten,
not deleted** — the wrong text is gone and its replacement states the convention
correctly and cites the field's definition, because a test that pins the frame is
the only thing that keeps the frame from drifting again.

The imprecise-but-correct comment at `src/components/GameDetailModal.test.tsx:54`
was also corrected. It said *"nflverse spread_line −2.5 means the away side is
favoured, so the home team is +2.5"* — right rendering, wrong reason. The field
is defined in the home frame from the start; the away side being favoured is a
*consequence* of that, not the rule, and stating it as the rule invites the next
reader to "fix" the frame by flipping the team instead of the sign. It now cites
`game_outcome.py` and says so.

## 4. What the new tests pin

`src/lib/panelFacts.test.ts`, six spread-frame tests plus a sign sweep:

- the tile names the home team from the field, pinned in **both** directions (model
  favours home, model favours away) — the old test's two arms, with the outputs
  the review identified as wrong now asserted as right;
- the line is converted into the home team's terms **and the margin with it**;
- **the away-favoured, opposite-signs case** (§2), asserting both strings and the
  5.9 gap measured from the *rendered text*;
- a sweep over `margin ∈ {-3.4, 0, 3.4} × line ∈ {-2.5, 0, 2.5}` asserting that
  the gap between the two **displayed** numbers equals `predicted_margin -
  spread_line` in every quadrant. A single unflipped half breaks this in exactly
  one quadrant, which is why it is swept rather than sampled;
- the tile draws with a missing/nonsense probability, since it reads none.

Mutation-checked: reverting `panelFacts.ts` to the old logic fails **6 of the 19**
tests in the file. These are not decorative.

## 5. Items 3–7

**3. `npx tsc -b` (was exit 2).** `src/pages/TrackRecordPage.test.tsx:61` — the
`trackRecord` mock's return type was inferred from its first implementation (all
non-null numbers), so `mockReturnValueOnce` with `pct_moneyline_correct: null` did
not fit even though `types.ts:39` declares `number | null`. Typed the mock as
`vi.fn<() => Promise<TrackRecord>>(...)`, so the nullable case is in the
signature. **The payload is not cast.** The comment on the mock records why: a
cast would have hidden the same mismatch everywhere else.

**4. `npm test` (was 1 failed).** `src/App.test.tsx:42` asserted the sports nav
was exactly `["PL","F1","NFL","CFB","NBA"]`; the bundled hub commit added
`"Home"`. Updated to the six labels and added an assertion that the `Home` link's
href is absolute `https://` — that was the one thing the new entry could have got
wrong, and the old assertion never looked at it.

**5. The "join" test that did not test the join.** `barPick` is ported from PL
(`phase4-worktrees/PL_v2/frontend/src/lib/panelFacts.ts`) into
`src/lib/panelFacts.ts` and wired into the modal: an exact label passes through, a
trailing `" win"` is stripped and re-joined to a segment, and anything that still
cannot be placed is returned **unchanged** so the bar fails closed. Only the
string moves; the pick's identity is never re-derived from this site's numbers.

  Verified against the actual sources rather than assumed: NFL
  `src/nfl_predictor/api/facts.py:110-111` and CFB `.../facts.py:97-98` both build
  `{"label": home_team}` / `{"label": away_team}` — bare team names, the same
  strings this site labels segments with. So the join is currently exact, and the
  helper is the guard for the day it is not.

  Six tests in `panelFacts.test.ts` cover the helper directly: pass-through,
  `"<team> win"` translation **for both segments** (the home side is index 0 and an
  index-0 implementation would pass half the work), the rest of the pick carried
  through untouched, the unplaceable cases (`"BUF win"`, `"Chiefs win"`,
  `"Ravens to win"`, `""`, `" win"`, no segments) all returning unchanged, and a
  team whose own name ends in the suffix not being truncated into a different
  team.

  `GameDetailModal.v2.test.tsx` gains two tests: one where the service words its
  pick `"Chiefs win"` and the bar **still** accents segment 1, and one where the
  pick names a team this game does not feature and the bar accents **nothing**
  rather than the nearest segment. Both are mutation-checked — reverting
  `data={wired}` to `data={summary}` fails the first.

  The old test's claim — *"Both halves are asserted here"* — was false and is
  replaced. The pick's wording in that file is supplied **by the test itself**, so
  no assertion there is evidence about what NFL or CFB actually send. The file
  header and the test comment now say so plainly, and name `barPick` and its unit
  tests as the real guard. That distinction is the point of item 5: the old
  comment was asserting evidence it did not have.

**6. `src/lib/sites.test.ts`.** **Deleted** (`git rm`), not replaced. It was a
shape-only test over a three-line constant — it would have passed with
`href: "https://example.invalid"`, and it never checked that the nav renders. The
real render test already exists in `App.test.tsx` and item 4's edit extends it to
cover the new hub entry, so a second shape test adds a second place to forget.

**7. `src/api/client.ts`.** The `Explanation` re-export is **dropped**; no consumer
remained (the modal, `GamesPage.tsx` and the v2 test all import it from
`../predictor-ui`). The module still *uses* the type, so it now imports it
non-exported, with a comment recording that the re-export had no consumer and
that two doors onto one type is the same "local copy" mistake the original
declaration was deleted for. Noted rather than kept: a re-export with no consumer
is a second door, and this file's own history is the argument.

**Vendored `src/predictor-ui/` — untouched.** Confirmed via `git status`: no
changes there, and `src/predictor-ui.sync.test.ts` passes. Nothing to report: the
library's `spread()` convention is correct as written, and `GameDetailModal.tsx`
was already using it properly at line 259. The defect was entirely in this site's
call site.

---

## Command output, from the repo root

```
$ npm test

 Test Files  23 passed (23)
      Tests  162 passed (162)
   Duration  3.64s
```

```
$ npx tsc -b
$ echo $?
0
```

```
$ npm run lint

> sports-predictor-frontend@0.0.0 lint
> oxlint

  ! unicorn(no-new-array): Do not use `new Array(singleArgument)`.
    ,-[src/pages/GamesPage.tsx:21:24]
 20 | async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
 21 |   const results: R[] = new Array(items.length);
    :                        ^^^^^^^^^^^^^^^^^^^^^^
 22 |   let next = 0;
    `----
  help: It's not clear whether the argument is meant to be the length of the array or the only element. If the argument is the array's length, consider using `Array.from({ length: n })`. If the argument is the only element, use `[element]`.

Found 1 warning and 0 errors.
Finished in 37ms on 67 files with 96 rules using 10 threads.
```

That one warning is pre-existing and in `GamesPage.tsx`, a file this change does
not touch. `npm run lint` exited 0.

## Not done, deliberately

- **Not pushed, not merged, not deployed.** Committed only, SHA in the handoff.
- **`tsconfig.app.tsbuildinfo`** is tracked and was already dirty on arrival
  (`git status` showed it modified before any edit). Left unstaged — it is a build
  artifact and its churn is noise in a review diff.
- Staged explicit paths only. No `git add -A`.
