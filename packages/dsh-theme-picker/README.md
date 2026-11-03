# dsh-theme-picker

English | [中文](./README.zh.md)

> Why "picker" and not "manager": the name `dsh-theme-manager` is already taken on npm by [runcat-tommy](https://github.com/runcat-tommy/dsh-theme-manager)'s plugin of the same kind (58 built-in themes). This one uses a name that does not collide — mind which of the two you install.

One switch for every theme. Install as many theme packs as you like and they will not fight each other: switch at any moment, applied immediately, with no first-paint flash.

## Install

```sh
dsh plugin add dsh-theme-picker
dsh plugin add dsh-theme-dracula-pack   # plus at least one theme pack
```

Restart once, then open **Settings → General → Theme**.

## How it works

- **Host half** scans `node_modules` for every package that declares `dsh.theme`, injects each pack's CSS as its own `<style>` scoped to `body[data-dsh-theme="<id>"]`, and writes the catalogue and the current selection into a first-paint script.
- **Client half** registers a theme row under **Settings → General**; one click changes `<body data-dsh-theme>` and writes localStorage.

Every theme's CSS is in the page from the start, and switching flips a single attribute — no reload, no request, no flash.

One platform wrinkle is handled along the way: on Windows the three window buttons are painted by Electron's `titleBarOverlay`, and the desktop shell's colour probe only listens for `data-ds-dark-theme` and `style`, so it does not re-sample after a theme change. The picker writes a one-shot inline attribute to wake the probe, which is what makes the title bar follow the theme.

## Writing a theme pack

Drop a package into `~/.dsh/profiles/node_modules/` — or anywhere the package name resolves — with a manifest like this:

```json
{
  "name": "dsh-theme-solarized",
  "dsh": {
    "bundle": { "patch": "./dsh.bundle.patch.yml" },
    "theme": {
      "id": "solarized",
      "name": "Solarized",
      "colorScheme": "dark",
      "css": "./theme/theme.css",
      "swatches": ["#002b36", "#b58900", "#268bd2"],
      "fonts": { "terminal": "JetBrainsMono NFM, Consolas, monospace" }
    }
  }
}
```

The CSS scopes itself: write selectors as `:root:root body[data-dsh-theme="solarized"]`. The doubled `root` raises specificity to (0,3,1), which is what lets a pack beat the built-in palettes.

`fonts` is optional and declares stacks by role — `text`, `code`, `terminal`. The terminal's font is read by xterm from the theme service, which CSS variables cannot reach, so selecting a theme that declares fonts makes the picker write them through `ctx.theme.setFontFamily()` and hand the default back when you switch away.

Once the package is in place, refresh the page. The picker rescans at most once every two seconds and needs no host restart.

## Bundled themes

| id | Name | Source |
| --- | --- | --- |
| `dracula` | Dracula | `dsh-theme-dracula-pack`, palette ported from PuerJJJ/dsh-theme-dracula-pack (MIT) |

## Background image

The same settings row can also lay an image under the interface:

- **Choose an image…** reads a local file, scales it to at most 1920px wide, and stores it as a data URL — no network, no large memory footprint.
- **Image URL** takes an address directly.
- **Dim** is a slider for the scrim over the image; pull it right when the image is too bright.
- **Daily Bing** and **random wallpaper** are two preset sources.

Text surfaces — cards, inputs, menus — keep the theme colours and only the page background and the sidebar let the image through, so the message area is not washed out.

Both presets are resolved **in the host process**: `cn.bing.com` and `wallhaven.cc` send no CORS headers, so fetching them from the browser ends in `Failed to fetch`. The host resolves the direct image URL while the module loads (top-level await) and writes it into the first-paint script; the client reads that URL and uses it as a CSS background, since loading an image is not subject to CORS. The result is cached in `~/.dsh/.dsh-theme-picker-sources.json`, and an offline start reuses the previous image.

## Notes

- Do not install the upstream `dsh-theme-dracula-pack` plugin alongside this one: it brings its own `data-dsh-dracula` attribute and its own switch, which double-tints everything on top of `data-dsh-theme`.
- The selection lives in localStorage under `dsh-theme:active`. Delete that key to return to DSH's native palette.
