# dsh-balance-floater

English | [中文](./README.zh.md)

Account balance in the sidebar, with arcade damage numbers. When the balance drops, a red number floats off it; when it goes up, a green one does.

## What you get

- **Placement:** to the right of the avatar button in the bottom-left corner of the sidebar. The avatar is registered into the `settings.launcher` slot by `client-ui-settings-account`, and its `triggerRow` is the only horizontally laid out row in the footer, so the chip is inserted beside it as a sibling — not into `sidebar.footer.action`, which is a separate block that can only sit a row above.
- **Hidden on the collapsed rail:** at 56px there is no room for a second element beside the avatar.
- **Data:** `ctx.remote.account.getBalance()`, polled every **3 minutes**, and refreshed immediately when the window regains focus, when the chip is clicked, and after **every completed task** (a task counts as finished when `running === false` arrives on `ctx.remote.$on("api-session/status")`).
- **A drop** floats a red `-¥0.42` up and fades it out, with a random horizontal offset and rotation; a single drop below ¥1 is enlarged to crit size.
- **A gain** shows a green `+¥100.00`.
- **Status dot:** green for healthy, grey for signed out, amber when the last read failed (the previous value stays on screen).

## Install

```sh
dsh plugin add dsh-balance-floater
```

Or search for `dsh-balance-floater` under **Plugins → Discover**. Restart DSH once after installing — Loader rows are read at start-up only.

From a checkout of this repository:

```sh
node scripts/install.mjs --profile desktop --apply
```

## Tuning

| Want to change | Where |
| --- | --- |
| Polling interval | `POLL_MS` in `lib/client.js` |
| Number size and colour | `.dsh-bf-float`, `.dsh-bf-hit`, `.dsh-bf-crit` in the `css` array of `lib/client.js` |
| Float speed | the `1150ms` in `@keyframes dsh-bf-rise` |

## How it works

The host half, `lib/index.js`, is an empty `apply`. Its job is to make the package a Loader row, which is what carries the `dsh.client` declaration into the browser boot graph. All the behaviour lives in `lib/client.js`: it registers the slot, polls the balance, and draws the floating numbers on a `position: fixed` overlay, which also keeps them clear of the sidebar's `overflow: hidden`.
