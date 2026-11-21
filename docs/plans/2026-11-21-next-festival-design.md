# 2026-11-21 · dsh-next-festival 设计

## 背景与目标

参考 `packages/dsh-solar-term/` 新增一个节日插件：在对话页左上角显示**所选地区的下一个节日**及倒计时；提供设置页面让用户选择国家／地区。首版覆盖中国大陆、香港、澳门、台湾、美国、英国、新加坡、马来西亚共 8 个地区，包含传统节日与民族节日。

## 已确认的决定

1. 8 个地区一次做齐；依赖藏历、傣历、印度历、月相观测的节日允许用官方年份表或历法估算，但必须在 UI 与 README 中标注「约 / 以官方公告为准」，不编造精确日期。
2. 徽标注册为 `shell.overlay` 的独立 list entry，渲染成窗口右下角浮层；**不占用** `conversation.header.leading`（那是 `dsh-solar-term` 已占用的 single 槽，两个插件共用会互相顶掉）。两个插件显示完全独立、互不影响。
3. 设置区放到**插件自己的详情页**：侧栏 `Plugins` → 已安装 → `dsh-next-festival` → 「节日地区」。不用 `settings.general.item`。

## 依据（已验证）

- `dsh-solar-term`：`lib/client.js` 的 lazy-CJS 形状、`--dsw-alias-*` 主题 token、`data-dsh-*` 作用域样式；Host 半是空 `apply`。它占用的 `conversation.header.leading` 是 single 槽，本插件不碰。
- `dsh-theme-picker`：`ctx.locale.register(NS, DICTIONARIES)`、`useSyncExternalStore` 共享 store、`localStorage` 持久化、设置行自带的 chip 控件与 CSS 前缀。
- `@deepseek-ai/dsh-client-ui-plugin-manager`：
  - `src/client/PluginManagerPage.tsx:822` — `renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name })`，配置区位于 bundle 详情页描述与组件列表之间；
  - `src/client/config-ledger.ts:51` — keyed slot 的 `options.key` 决定该配置区是否出现（`configured = ledger.bundles.has(pkg.name)`）；
  - `src/client/slot-contract.ts:26` — `PluginConfigViewProps` 只有 `view` 与可选 `form`；bundle 级页面不传 `form`，所以配置值由插件自己持久化；
  - `src/client/index.ts:143` — slot 由 Plugins 页面的 `main` 注册延迟声明，`ctx.slots.inject` 会等待它出现。
- `Intl` 实测（Node 22，本仓库 `node -e`）：`u-ca-chinese` 能给出农历月／日，闰月带 `bis` 后缀可跳过；`u-ca-islamic-umalqura` 能给出伊斯兰历月／日；`chinese` 历在 1900–2100 的采样日期上均可用。

## 非目标

- 不做跨设备／profile 配置同步，不写 Host `Config` schema；设置值存浏览器 `localStorage`，与 `dsh-theme-picker` 一致。
- 不做节日提醒、日历视图、多地区并列显示，不联网拉日期，不引入任何依赖。
- 不追求藏历／傣历／泰米尔历的完整历法实现；缺可靠日期的节期用年份表，超范围回落到估算并标注。

## 架构

单包 `packages/dsh-next-festival/`，无 Host 行为，全部逻辑在 `lib/client.js` 一个 lazy-CJS 工厂内：

```
package.json            dsh.bundle.patch + dsh.client（exports ".", "./client", "./locale/*.json", "./icon", "./package.json"）
dsh.bundle.patch.yml    - insert: [{ id: next-festival, name: dsh-next-festival }]
lib/index.js            export function apply() {}
lib/client.js           数据 + 算法 + 两个 slot 注册 + 样式
locale/{en,zh}.json     meta.title / meta.description
icon.svg                原创图标
README.md / README.zh.md
```

`dsh.client.inject` 为空（与 `dsh-theme-picker` 一致），两个 slot 都靠 `ctx.slots.inject` 等待声明：`shell.overlay` 由 `dsh-client-ui-layout` 的 AppFrame 声明，`plugins.bundle.config` 由 Plugins 页面延迟声明。不列 inject 也避免某个 UI 包缺失时整个插件不激活。

## 节日数据

8 个地区 `cn / hk / mo / tw / us / gb / sg / my`，每个一条记录：id、当地名称、简体名称、英文名、类别（法定／传统／民族／宗教）、规则、是否近似。规则类型：

| 类型 | 例子 | 求日期方式 |
| --- | --- | --- |
| `fixed` | 元旦、国庆、7/1、12/20、10/10、7/4、11/5 | 直接 |
| `lunar` | 春节、元宵、端午、七夕、中元、中秋、重阳、腊八、除夕、佛诞、天后诞、火把节、三月三 | 用 `Intl` chinese 历逐日反查，跳过闰月 |
| `weekday` | 感恩节、母亲节、美国／英国银行假日、MLK Day | 第 N 个星期几／最后一个星期几 |
| `easter` | Good Friday、Easter Monday | Meeus/Jones/Butcher 复活节算法 + 偏移 |
| `islamic` | 开斋节、古尔邦节、Hari Raya Haji | `Intl` islamic-umalqura 逐日反查 |
| `solar` | 清明、冬至 | 低精度太阳黄经求解（几何黄经 + 牛顿迭代） |
| `table` | 藏历新年、雪顿节、屠妖节、卫塞节、大宝森节、那达慕、原住民丰年祭等 | 官方公告 2026/2027 + 第三方历法推算 2028–2030 的 `年份 → YYYY-MM-DD` 表；超范围回落到 fallback 规则或隐藏 |

港澳台节日名采用当地惯用写法（繁体），简体中文界面显示当地写法，英文界面显示英文名。

## 计算与倒计时

1. 用所选地区的 IANA 时区（`Intl.DateTimeFormat` 输出 `en-CA`）取「当地今天」`YYYY-MM-DD`。
2. 把今年与明年的规则展开成 `{date, festival, approximate}` 列表，按日期排序，取第一条 `date >= today`；天数差用 UTC 日期数相减，避免时区偏移误差。
3. 按年缓存展开结果；组件每 30 秒刷新一次，并在 `visibilitychange` 时立刻刷新，跨过零点自动换到下一个节日。
4. 同一天多个节日时按类别优先级（法定 > 传统 > 民族 > 宗教）排序，hover 里列出其余同日节日。

## UI

- **徽标**：`shell.overlay` 的独立 list entry，右下角固定浮层（`position:fixed`），主行节日名 + 日期（近似时「约」贴在日期旁），次行地区名 +「还有 N 天 / 就是今天」；左侧竖条按类别着色；`tabIndex`/`role`/`aria-label` 让地区、类别、当地日历日、后续节日与近似说明对键盘和读屏可达，hover 再给出同样信息。CSS 全部在 bundle 的 `css` 数组里，类名前缀 `.dsh-nf-`，容器带 `data-dsh-next-festival`，颜色只用 `--dsw-alias-*` token。
- **设置区**：`plugins.bundle.config`，`key: 'dsh-next-festival'`，`locale: NS`。标题「节日地区 / Festival region」+ 说明 + 8 个 chip（大中华／其它两组）+ 当前值；暂存 draft + 「保存」按钮，未保存时显示提示，保存后用独立状态行反馈并定时清除；跨标签页变更通过 `externalAt` 提示而不静默覆盖草稿；离开页面丢弃未保存的选择，符合 Plugins 页面「只有保存才写入」的惯例。
- **共享状态**：模块级 store（`subscribe` / `getSnapshot` / `setRegion`），写入 `localStorage: 'dsh-next-festival:region'`；设置区与徽标都通过 `useSyncExternalStore` 订阅，保存后即时联动；监听 `storage` 事件同步其它标签页。默认 `cn`。

## 误差与降级

- 近似节日在徽标与 hover 中带「约」标记；`table` 的 2026/2027 是官方公告，2028–2030 是第三方历法推算，全部按近似处理并提示以官方公告为准。超范围且有 fallback 规则时回落到估算；没有 fallback 的节日直接隐藏，不编造日期。
- 伊斯兰历按 Umm al-Qura 民用历估算；已公布的 2026/2027 观月日期（开斋节、哈芝节）通过 `festival.years` 覆盖算法结果。
- 只显示节日本身日期，不计算补假／调休／observed date（美国联邦观测日、英国银行假日补假、港澳台补假、马来西亚开斋节第二天）；香港節禮日按官方年份表处理是唯一例外。除夕按「春节前一日」计算，不是腊月三十。
- 浏览器缺 `chinese`／`islamic-umalqura` 历：跳过相应节日，只显示公历类；README 说明该限制。
- `localStorage` 不可用时回落到内存状态，设置区提示「本次会话有效」。

## 数据来源（年份表）

由数据核对子代理查得，本仓库未逐条二次核验；2026 与多数 2027 为官方公告，其余年份为第三方推算：

- 藏历新年 2026-02-18、雪顿节 2026-08-12：[西藏文旅厅](https://wlt.xizang.gov.cn/xccx/lytg/202602/t20260210_524352.html)、[中国西藏网](http://m.tibet.cn/cn/news/zx/202608/t20260814_8032110.html)
- 香港節禮日 2026-12-26 / 2027-12-27：[香港政府假期表](https://www.gov.hk/en/about/abouthk/holiday/2026.htm)
- 马来西亚 JPA / 首相署（Thaipusam、Vesak、Deepavali、Hari Raya）：[JPA 2026](https://dmedia.penerangan.gov.my/upload/sm/08012026.614533537.pdf)、[HKA 2027](https://www.kabinet.gov.my/storage/2026/08/HKA_2027.pdf)
- 新加坡 MOM 公假表（Vesak、Deepavali、Hari Raya）：[MOM](https://www.mom.gov.sg/maintenance/employment-practices/public-holidays)
- 台湾行政院公报（原住民族祭典区间）：[Gazette](https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg032125/ch02/type1/gov13/num1/Eg.pdf)
- 2028–2030 估算来源：gjlysy.com、nongli.info、udaya.app、holidayfyi、holidayapi（均标「约」）
- 节气时刻核对：[Star Walk 至日表](https://starwalk.space/zh-Hans/news/what-is-a-solstice)、[科普中国](https://www.kepuchina.cn/article/articleinfo?business_type=100&classify=0&ar_id=689564)

## 验证

- `node scripts/check.mjs` 全绿；`node --check` 通过；`npm pack --dry-run` 列出 9 个文件；`node scripts/awesome-pr.mjs --selftest` 认出 5 个 catalog 条目；`git diff --check` 无问题。
- 离线自检 26 条断言全过，含 2026-02-17 春节、2026-09-25 中秋、2026-04-05 复活节、2026-11-26 感恩节、2026-12-22 冬至、2027-02-06 除夕、官方观月日期覆盖、2028 推算回退、两个 slot 组件渲染。
- 自检方式：Node 里用 stub 捕获 `window.__ModuleLoader__.load` 的 factory，注入 React 桩执行，调用工厂导出的纯计算函数；不改动 DSH profile、不写用户状态。
- 未安装到运行中的 profile，页面实际渲染未验证（Desktop 运行时占用 profile，按 AGENTS.md 不并行写）。

## 交付清单

新包全部文件 + `catalog/` 条目 + 根 `README.md`／`README.zh.md` 的插件表、安装示例、Layout 树同步更新。不自动 `git commit`（未经用户要求）。
