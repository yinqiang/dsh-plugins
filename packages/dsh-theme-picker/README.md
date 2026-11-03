# dsh-theme-picker

> 为什么叫 picker 而不是 manager：`dsh-theme-manager` 这个名字在 npm 上已被 [runcat-tommy](https://github.com/runcat-tommy/dsh-theme-manager) 的同类插件占用（58 个内置主题）。这里换一个不冲突的名字，装的时候别装错。

一个开关管所有主题：装多个主题包也不会互相打架，随时切换、立即生效、首帧不闪。

## 安装

```sh
dsh plugin add dsh-theme-picker
dsh plugin add dsh-theme-dracula-pack   # 再装至少一个主题包
```

重启一次，然后 **设置 → 通用 → 主题**。

## 怎么工作

- **宿主半** 扫 `node_modules` 里所有声明了 `dsh.theme` 的包，把每个包的 CSS 作为独立 `<style>` 注入页面（各自 scoped 到 `body[data-dsh-theme="<id>"]`），再把目录和当前选择写进一段首帧脚本。
- **客户端半** 在「设置 → 通用」注册一行主题选择，点一下改 `<body data-dsh-theme>` 并写 localStorage。

所有主题的样式一开始就在页面里，切换只是改一个属性——没有重新加载、没有网络请求、没有闪烁。

顺带处理了一个坑：Windows 上标题栏那三个窗口按钮由 Electron `titleBarOverlay` 绘制，桌面壳的取色探针只监听 `data-ds-dark-theme` 和 `style`，切换主题后不会自己重测。这里在切换后写一个一次性内联属性把它唤醒，标题栏才会跟着变色。

## 装一个主题包

在 `~/.dsh/profiles/node_modules/`（或任何能按包名解析到的位置）放一个包：

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
      "swatches": ["#002b36", "#b58900", "#268bd2"]
    }
  }
}
```

CSS 自己负责 scope，选择器写成 `:root:root body[data-dsh-theme="solarized"]`（重复 `root` 是为了把特异度提到 (0,3,1)，压过内置调色板）。

放进去后刷新页面即可，管理器每 2 秒最多重扫一次目录，不用重启 Host。

## 自带主题

| id | 名称 | 来源 |
| --- | --- | --- |
| `dracula` | Dracula | `dsh-theme-dracula-pack`，配色移植自 PuerJJJ/dsh-theme-dracula-pack（MIT） |

## 注意

- 不要同时安装上游 `dsh-theme-dracula-pack` 插件本体：它自带 `data-dsh-dracula` 属性和独立开关，会和这里的 `data-dsh-theme` 叠色。
- 选择存在 localStorage 的 `dsh-theme:active`；清掉它就回到 DSH 原生配色。
