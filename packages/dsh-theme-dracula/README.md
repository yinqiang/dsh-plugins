# dsh-theme-dracula

[dsh-theme-manager](../dsh-theme-manager) 的 Dracula 配色包。

> 配色、token 覆盖与首帧注入方案来自 [PuerJJJ/dsh-theme-dracula](https://github.com/PuerJJJ/dsh-theme-dracula)（MIT）。
> 这里只做了一件事：把作用域从 `body[data-dsh-dracula]` 换成 `body[data-dsh-theme="dracula"]`，让管理器统一调度。颜色一个没改。

## 安装

```sh
dsh plugin add dsh-theme-dracula
```

需要同时安装 `dsh-theme-manager`，否则它只是躺在 node_modules 里的数据，没有入口。

## 覆盖范围

| 层 | 数量 | 例子 |
| --- | --- | --- |
| `--dsw-alias-*` | 101 | 背景、文字、边框、按钮、状态色 |
| `--dsw-specific-*` | 11 | 侧栏、输入框、气泡、菜单 |
| `--shiki-token-*` | 11 | 代码高亮 |
| 其他 | 2 | think 渐变、文字选区 |

页面底色 `#20212b`，侧栏与代码块 `#282a36`，卡片 `#2e3040`，选中 `#44475a`，强调 `#bd93f9`。

## 许可

MIT，见 [LICENSE](./LICENSE)。
