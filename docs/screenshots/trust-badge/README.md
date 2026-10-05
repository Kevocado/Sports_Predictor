# Trust badge — production captures (CFB, on this site)

The `trust` row inside the fixture modal at `?sport=cfb`, in production, at both
widths the standing rule asks for. Captured with Playwright against
`https://sports.40-160-91-131.sslip.io/?sport=cfb` — the method
`predictor-ui/harness/README.md` names.

| file | what |
|---|---|
| `desktop-cfb-modal.png` | 1440px, Western Michigan at Troy modal open |
| `mobile-390-cfb-modal.png` | 390px, same fixture |

Both show, at the top of the modal under **CONTEXT**:

> When the model says ~86%, its picks landed 81% of the time
> `SOURCE  n=66 · …`

with the reliability bar beneath, **above** the "We made no acceptance" note,
the "Troy is the pick" line and the "Get the AI summary" button.

## Why this is on the Sports site and not in `CFB_Predictor`

Worth recording, because it is the whole reason this row was invisible for two
hours after its endpoint went live.

**CFB has no served frontend.** Its Dockerfile never builds `frontend/`, the app
mounts no `StaticFiles`, and `cfb.{DOMAIN}` is an API-only host — Caddy proxies
`/cfb/*` into CFB, but the page a reader sees is *this* one. A `GameDetailModal`
written in CFB's repo compiles, passes its own tests, and is never served by
anything. PR #34 put the row here instead.

## What the captures are evidence OF

Each capture reads the rendered `textContent` back out and prints it, because a
screenshot proves a row was drawn and only the text says it was the right row:

```
trust row present: true
badge line: When the model says ~86%, its picks landed 81% of the time
```

Every request outside the page's own origin is blocked, so a capture is a
property of the page rather than of the network.

## What to look at

- **The moneyline only.** ATS and total hold 59 graded pairs between them and
  cannot fill a band of 30, so they read nothing. NFL's moneyline has 49 graded
  rows and also stays dark — this site's `signals` call is optional for exactly
  that reason, and a 404 there produces silence rather than an error state.
- **The row is instant.** No button pressed for either capture.
- **`n=66` sits next to the rate**, and that is the whole claim: a rate is only
  worth reading with the sample it came from.
- **Understates rather than overstates.** The model said ~86% and the picks
  landed 81%. An under-confident band is the safe direction, and it is why the
  row is a record rather than a tip.
- **On the Sports site the modal states its own pick ("Troy is the pick")** two
  lines below. The badge is about *past* picks; the pick is about *this* game.
  Neither restates the other, and the tilde on `~86%` keeps the badge's sentence
  true of the whole band rather than of picks of exactly 86%.