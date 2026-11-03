# dsh-theme-dracula-pack

[English](./README.md) | 中文

[dsh-theme-picker](../dsh-theme-picker) 的 Dracula 配色包。

> 配色、token 覆盖与首帧注入方案来自 [PuerJJJ/dsh-theme-dracula-pack](https://github.com/PuerJJJ/dsh-theme-dracula-pack)（MIT）。
> 这里只做了一件事：把作用域从 `body[data-dsh-dracula]` 换成 `body[data-dsh-theme="dracula"]`，让管理器统一调度。颜色一个没改。

## 安装

```sh
dsh plugin add dsh-theme-dracula-pack
```

需要同时安装 `dsh-theme-picker`，否则它只是躺在 `node_modules` 里的数据，没有入口。

## 覆盖范围

| 层 | 数量 | 例子 |
| --- | --- | --- |
| `--dsw-alias-*` | 101 | 背景、文字、边框、按钮、状态色 |
| `--dsw-specific-*` | 11 | 侧栏、输入框、气泡、菜单 |
| `--shiki-token-*` | 11 | 代码高亮 |
| 其他 | 2 | think 渐变、文字选区 |

页面底色 `#20212b`，侧栏与代码块 `#282a36`，卡片 `#2e3040`，选中 `#44475a`，强调 `#bd93f9`。

## 字体

清单里声明了终端字体栈（`dsh.theme.fonts.terminal`）：

```
JetBrainsMono NFM, JetBrainsMono NL NFM, MesloLGM NF, Cascadia Mono, Consolas, Microsoft YaHei, monospace
```

前几个是 Nerd Font 的等宽变体（图标与正文同宽，不会撑歪列对齐），后面兜底中文与系统等宽。选中本主题时由 `dsh-theme-picker` 写入主题服务；切到别的主题时交还默认。

> 机器上缺 Nerd Font 的话图标仍会显示成方块。可从 [nerd-fonts](https://github.com/ryanoasis/nerd-fonts/releases) 取 JetBrainsMono 装上，或把清单换成你自己有的字体。

## 终端

侧边栏终端默认被 xterm 用 `--dsw-alias-bg-base` 铺成实底，会挡住背景图。这里改成透明，外层容器留 45% 底色保证文字可读：

```css
:root:root body[data-dsh-theme="dracula"] .xterm .xterm-viewport { background: transparent !important; }
:root:root body[data-dsh-theme="dracula"] [class*="_screen"]:has(.xterm) { background: color-mix(in srgb, #20212b 45%, transparent) !important; }
```

想要完全透明，把第二行的 `45%` 改成 `0%`。

## 许可

MIT，见 [LICENSE](./LICENSE)。
