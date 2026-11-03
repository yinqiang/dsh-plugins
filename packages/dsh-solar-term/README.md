# dsh-solar-term

English | [中文](./README.zh.md)

A solar-term badge at the top-left of the conversation: which of the 24 solar terms is current, the exact moment it began, and how many days remain until the next one.

## What you get

```
┃ 霜降   10月23日
┃ 立冬 还有 4 天
```

- **Placement:** the `conversation.header.leading` slot — the empty strip at the top-left of the main panel, right of the sidebar — present both with and without an open conversation.
- The first line is the current term and the date it began; the vertical bar on its left takes the season's colour: green for spring, gold for summer, ochre for autumn, blue-black for winter.
- The second line is the next term and the countdown; on the day of a transition it reads “立冬 就是今天”.
- Hovering reveals the transition moment to the minute, in the local time zone.
- It re-checks the clock every 30 seconds, refreshes immediately when the window regains focus, and rolls over to the new term after midnight.

## Algorithm

A solar term is the instant the sun's apparent ecliptic longitude crosses a multiple of 15°. `lib/client.js` carries a truncated VSOP87D series for the Earth's longitude (Meeus, table 32.a), converts it to the sun's apparent longitude, solves for the moment by Newton iteration on each 15° multiple, and subtracts ΔT (TT − UT, about 69 seconds in the 2020s).

Checked against the times published by the Purple Mountain Observatory for 2026, all 24 terms land in the same minute; 2025 matches too (立春 22:10, 春分 17:01, 冬至 23:03).

## Install

```sh
dsh plugin add dsh-solar-term
```

If the badge does not appear, restart DSH once — Loader rows are read at start-up only.

From a checkout of this repository:

```sh
node scripts/install.mjs --profile desktop --apply
```

## Tuning

| Want to change | Where |
| --- | --- |
| Size, corner radius, background opacity | `.dsh-st` in the `css` array of `lib/client.js` |
| Term name and date type sizes | `.dsh-st-name`, `.dsh-st-date` |
| The four season colours | `SEASON_COLORS` |
| Refresh interval | `setInterval(tick, 30000)` in the component |
| English term names | the `en` field of the `TERMS` table |

After an edit, copy `lib/client.js` back over the installed copy and refresh the page — client plugins go through HMR, so the host does not need a restart. With a linked development install (`scripts/install.mjs`), the edit is already in place.

## How it works

The host half, `lib/index.js`, is an empty `apply`. It exists to make the package a Loader row, which is what carries the `dsh.client` declaration into the browser boot graph. All the logic is in `lib/client.js`: computing the terms, registering the slot, and rendering the badge. The astronomy needs no network and no third-party dependency.
