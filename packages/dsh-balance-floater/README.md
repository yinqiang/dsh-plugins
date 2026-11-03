# dsh-balance-floater

侧边栏余额 + 街机掉血数字。余额掉了，就从余额上飘出一个红色数字；充值了就飘绿色。

## 效果

- 位置：侧边栏左下角**头像按钮那一行的右侧**。头像来自 `settings.launcher` 槽（`client-ui-settings-account`），它所在的 `triggerRow` 是底部唯一横向排布的行，所以余额作为它的兄弟节点插进去，而不是走 `sidebar.footer.action`（那个槽是单独一块，只能落在上面一行）
- 折叠成 56px 轨道时自动隐藏：那点宽度放不下头像以外的第二个元素
- 数据：`ctx.remote.account.getBalance()`，每 **3 分钟**轮询一次；切回窗口、点击余额都会立即刷新
- 掉血：红色 `-¥0.42` 上浮淡出，随机横向偏移与旋转；单次跌破 ¥1 自动放大成暴击字号
- 回血：余额上涨时绿色 `+¥100.00`
- 状态点：绿=正常，灰=未登录，橙=上一次读取失败（保留旧值）

## 安装

```sh
dsh plugin add dsh-balance-floater
```

或在 DSH 的「插件 → Discover」里搜 `dsh-balance-floater`。安装后重启一次（Loader 行只在启动时读取）。

本地开发：

```sh
node scripts/install.mjs --profile desktop --apply
```

## 调整

| 想改什么 | 改哪里 |
| --- | --- |
| 轮询频率 | `lib/client.js` 的 `POLL_MS` |
| 数字大小 / 颜色 | `lib/client.js` 里 `css` 数组的 `.dsh-bf-float`、`.dsh-bf-hit`、`.dsh-bf-crit` |
| 飘字速度 | `@keyframes dsh-bf-rise` 的 `1150ms` |

## 原理

宿主半 `lib/index.js` 只留一个空 `apply`——它存在的意义是让包成为一个 Loader 行，从而把 `dsh.client` 声明带进浏览器启动图。真正的逻辑全在 `lib/client.js`：注册槽位、轮询余额、用一层 `position: fixed` 的覆盖层画飘字（避开侧栏的 `overflow: hidden`）。

