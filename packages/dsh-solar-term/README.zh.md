# dsh-solar-term

[English](./README.md) | 中文

对话页左上角的节气牌：当前是哪个节气、几点交节，以及距下一个节气还差几天。

## 效果

```
┃ 霜降   10月23日
┃ 立冬 还有 4 天
```

- 位置：`conversation.header.leading` 槽，主面板左上角、侧栏右侧那条头部空位，开会话和没开会话时都在。
- 第一行是当前节气与交节日期，左侧竖条的颜色按季节换：春青、夏金、秋赭、冬黛。
- 第二行是下一个节气与倒计时；交节当天显示「立冬 就是今天」。
- 悬停看精确到分钟的交节时刻和本机时区。
- 每 30 秒对一次表，切回窗口时立即刷新，零点过后自动翻到新的节气。

## 算法

节气就是太阳视黄经每走 15° 的时刻。`lib/client.js` 里内置 VSOP87D 地球黄经截断级数（Meeus 表 32.a），换算成太阳视黄经，再对 15° 的整数倍做牛顿迭代求时刻，最后扣掉 ΔT（TT − UT，2020 年代约 69 秒）。

和紫金山天文台公布的 2026 年时刻对照，24 个节气全部落在同一分钟；2025 年立春 22:10、春分 17:01、冬至 23:03 也对得上。

## 安装

```sh
dsh plugin add dsh-solar-term
```

装完如果没出现，重启一次 DSH（Loader 行只在启动时读）。

本地开发，在仓库根目录：

```sh
node scripts/install.mjs --profile desktop --apply
```

## 调整

| 想改什么 | 改哪里 |
| --- | --- |
| 尺寸、圆角、背景浓度 | `lib/client.js` 里 `css` 数组的 `.dsh-st` |
| 节气名 / 日期字号 | `.dsh-st-name`、`.dsh-st-date` |
| 四季竖条配色 | `SEASON_COLORS` |
| 刷新频率 | 组件里 `setInterval(tick, 30000)` |
| 英文节气名 | `TERMS` 表里的 `en` 字段 |

改完把 `lib/client.js` 覆盖回 `~/.dsh/profiles/node_modules/dsh-solar-term/lib/`，刷新页面即可（客户端插件走 HMR，不用重启 Host）。

## 原理

宿主半 `lib/index.js` 只留一个空 `apply`——它存在的意义是让包成为一条 Loader 行，从而把 `dsh.client` 声明带进浏览器启动图。真正的逻辑全在 `lib/client.js`：算节气、注册槽位、渲染那块牌子。天文计算不依赖网络，也没有第三方依赖。
