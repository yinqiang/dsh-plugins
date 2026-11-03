# dsh-theme-dracula-pack

English | [中文](./README.zh.md)

The Dracula palette for [dsh-theme-picker](../dsh-theme-picker).

> The palette, the token coverage and the first-paint injection come from [PuerJJJ/dsh-theme-dracula-pack](https://github.com/PuerJJJ/dsh-theme-dracula-pack) (MIT).
> One thing changed: the scope moved from `body[data-dsh-dracula]` to `body[data-dsh-theme="dracula"]`, so the picker can drive it like any other pack. Not a single colour was touched.

## Install

```sh
dsh plugin add dsh-theme-dracula-pack
```

`dsh-theme-picker` has to be installed as well, or this is just data sitting in `node_modules` with nothing to read it.

## Coverage

| Layer | Count | Examples |
| --- | --- | --- |
| `--dsw-alias-*` | 101 | backgrounds, text, borders, buttons, state colours |
| `--dsw-specific-*` | 11 | sidebar, composer, bubbles, menus |
| `--shiki-token-*` | 11 | syntax highlighting |
| others | 2 | the think gradient, text selection |

Page background `#20212b`, sidebar and code blocks `#282a36`, cards `#2e3040`, selection `#44475a`, accent `#bd93f9`.

## Fonts

The manifest declares a terminal font stack (`dsh.theme.fonts.terminal`):

```
JetBrainsMono NFM, JetBrainsMono NL NFM, MesloLGM NF, Cascadia Mono, Consolas, Microsoft YaHei, monospace
```

The first entries are Nerd Font monospace variants — icons keep the same advance width as text, so column alignment survives. The tail falls back to CJK and system monospace. The picker writes this stack into the theme service when the theme is selected and hands the default back when you switch away.

> Without a Nerd Font installed, icons still render as boxes. Grab JetBrainsMono from [nerd-fonts](https://github.com/ryanoasis/nerd-fonts/releases), or change the stack to something you have.

## Terminal

The sidebar terminal is filled by xterm with `--dsw-alias-bg-base`, which hides the background image. This pack makes the terminal transparent and leaves 45% of the base colour on the container so text stays readable:

```css
:root:root body[data-dsh-theme="dracula"] .xterm .xterm-viewport { background: transparent !important; }
:root:root body[data-dsh-theme="dracula"] [class*="_screen"]:has(.xterm) { background: color-mix(in srgb, #20212b 45%, transparent) !important; }
```

For a fully transparent terminal, change the `45%` on the second line to `0%`.

## License

MIT, see [LICENSE](./LICENSE).
