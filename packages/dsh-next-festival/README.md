# dsh-next-festival

English | [中文](./README.zh.md)

The next festival for the region you pick, with a countdown, at the top-left of the conversation.

## What you get

```
┃ 感恩节   11月26日
┃ 还有 N 天
```

- **Placement:** its own `shell.overlay` list entry, drawn as a small floating card at the bottom-right of the window. It never registers into `conversation.header.leading` — that is a **single** slot already owned by `dsh-solar-term`, so registering there would displace one of the two. The plugins stay fully independent. Move the card by editing `right` / `bottom` in the `.dsh-nf` CSS rule.
- The first line is the next festival and its date. The bar on the left is coloured by kind: red for a public holiday, gold for a traditional one, green for an ethnic one, violet for a religious one.
- The second line names the selected region next to the countdown, so it is clear the day count follows that region's local calendar day; on the day itself it reads "就是今天" / "today". An approximate date carries "约" / "approx." beside the date itself, not beside the countdown.
- Hovering, or focusing the badge with the keyboard, shows the region, kind, local calendar day, time zone, the next two festivals, and a note when a date is approximate. The same summary is in the badge's accessible label.
- It re-checks the clock every 30 seconds, refreshes when the window becomes visible again, and rolls over to the following festival after the day ends.

## Regions

Mainland China (`cn`), Hong Kong (`hk`), Macau (`mo`), Taiwan (`tw`), United States (`us`), United Kingdom (`gb`, England and Wales), Singapore (`sg`), Malaysia (`my`). The Chinese regions include local traditional festivals and ethnic festivals; Hong Kong, Macau and Taiwan keep their local names (for example 佛誕, 天后誕, 雙十節).

## Where the setting lives

**Sidebar → Plugins → Installed → Next festival → Festival region.** This is the plugin's own page: the picker is registered into the `plugins.bundle.config` keyed slot, so it appears between the bundle description and its component rows, not in the general Settings page.

Pick one of the eight regions, then press **Save**. An unsaved-change hint stays visible until you save, and the draft is dropped if you leave the page; a separate status line confirms a save and clears after a few seconds. A change made in another tab is reported instead of silently overwriting your draft. The choice is stored in this browser's `localStorage` under `dsh-next-festival:region`; it is deliberately not a profile setting, so a different browser can pick a different region. Both the badge and the picker update immediately, and other tabs on the same origin follow along. Default: Mainland China.

## How the dates are computed

Everything runs locally in `lib/client.js`. There is no network call and no dependency.

| Rule | Examples | Method |
| --- | --- | --- |
| `fixed` | New Year, National Day, 7/1, 12/20, 10/10, 7/4, 11/5 | Calendar date |
| `lunar` | Chinese New Year, Lantern, Dragon Boat, Mid-Autumn, Buddha's Birthday, 三月三, 火把節 | `Intl` `chinese` calendar scanned backwards to a Gregorian date; leap months (`bis`) are skipped |
| `nth` | Thanksgiving, Mother's Day, US/UK bank holidays | Nth or last weekday of a month |
| `easter` | Good Friday, Easter Monday | Meeus/Jones/Butcher Gregorian Easter plus an offset |
| `islamic` | Hari Raya Puasa, Hari Raya Haji, 开斋节, 古尔邦节 | `Intl` `islamic-umalqura` calendar; marked approximate |
| `solar` | 清明, 冬至 | Low-precision solar-longitude solver |
| `table` | Losar, Shoton, Deepavali, Vesak, Thaipusam, Naadam, harvest festivals | Official 2026/2027 dates plus later calendar estimates, all approximate |

"Today" is the **local calendar day of the selected region**, obtained with `Intl.DateTimeFormat` and that region's IANA time zone. This year's and next year's rules are expanded, sorted, and the first date on or after today wins; the difference is a pure day count, so travelling or a different system time zone does not shift the countdown by a day.

### Accuracy

- Lunar, weekday-rule, Easter and fixed dates are exact for the years `Intl` supports. The solar-term solver was checked against published 2026 almanac dates: 清明 on 2026-04-05 and 冬至 on 2026-12-22 (04:50 UTC+8, i.e. 20:50 UTC on 12/21).
- Islamic dates follow the Umm al-Qura civil calendar; countries that observe the moon may differ by a day. Tibetan, Tamil and Buddhist-calendar festivals come from a year table: most 2026/2027 dates are official announcements (Xizang tourism bureau and Lhasa notices, China Tibet News, Malaysia JPA and the PM's Department, Singapore MOM, the Taiwan Gazette), while the remaining 2027–2030 entries are third-party calendar estimates. All of them carry an "约" / "approx." marker and a "check the official calendar" note.
- 泼水节 uses the customary 4/13 (the Dai New Year season runs 13–15 April); Naadam and the Indigenous harvest festival have no single national day, so a customary mid-year date is used. All three are approximate.
- Beyond the table, festivals with a fallback rule (Vesak, Naadam, harvest festivals) fall back to an estimated date; those without one are hidden rather than invented. The table needs updating every few years.
- Only the festival's own date is shown. Observed/substitute days, make-up holidays and the second day of a multi-day holiday (US federal observed dates, UK bank-holiday substitutes, Hong Kong/Macau/Taiwan 補假, Malaysia's second Hari Raya day) are not computed. Hong Kong's Boxing Day — "the first weekday after Christmas Day", not a fixed 12/26 — is the one exception handled through its published year table.
- 除夕 is computed as the day before Chinese New Year, not as 腊月三十: several consecutive years have no 30th day of the twelfth lunar month.
- A browser without the `chinese` or `islamic-umalqura` calendar skips those festivals and keeps the Gregorian ones.
- If `localStorage` is unavailable, the choice lasts for the session and the picker says so.

## Install

```sh
dsh plugin add dsh-next-festival
```

Restart DSH once if the badge does not appear — Loader rows are read at start-up only.

From a checkout of this repository:

```sh
node scripts/install.mjs --profile desktop --apply
```

## Tuning

| Want to change | Where |
| --- | --- |
| Festival list, names, rules | `FESTIVALS` in `lib/client.js` |
| Published dates for calendar-table festivals | the `years` maps in the same table |
| Region names and time zones | `REGIONS` |
| Badge size, colours, or kind colours | the `css` array and `KIND_COLORS` |
| Setting-page layout | `.dsh-nf-row` and friends in the `css` array |
| Refresh interval | `setInterval(tick, 30000)` in the badge component |

With a linked development install, editing `lib/client.js` is enough — client bundles are served from disk and picked up on the next page load.

## How it works

The host half, `lib/index.js`, is an empty `apply`. It exists so the package is a Loader row, which carries `dsh.client` into the browser boot graph. `lib/client.js` registers two slots: the badge into its own `shell.overlay` list entry, and the region picker into `plugins.bundle.config` keyed by the package name. It deliberately does **not** touch `conversation.header.leading`, the single slot `dsh-solar-term` renders in; the two plugins never share a slot. The second slot is declared by the Plugins page only while that page is open; `ctx.slots.inject` waits for it, so no restart is needed to make the picker appear.
