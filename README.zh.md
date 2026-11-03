# dsh-plugins

[English](./README.md) | 中文

一组 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，放在一个 pnpm workspace 里。

每个包都声明 `dsh.bundle`，所以可以用官方的 `dsh plugin add` 装，也能进插件市场索引。

## 插件

| 包 | 作用 | 类别 |
| --- | --- | --- |
| [`dsh-balance-floater`](./packages/dsh-balance-floater) | 余额贴在左下角头像按钮右侧，余额一掉就飘出街机风格的伤害数字 | UI |
| [`dsh-theme-picker`](./packages/dsh-theme-picker) | 装多个主题包、随时切换、首帧不闪 | 主题 |
| [`dsh-theme-dracula-pack`](./packages/dsh-theme-dracula-pack) | 给主题管理器用的 Dracula 配色包 | 主题 |
| [`dsh-solar-term`](./packages/dsh-solar-term) | 对话页左上角的节气牌：当前节气、交节日期、距下一个节气还有几天 | UI |

## 包名说明

`dsh-theme-picker` 不叫 `dsh-theme-manager`，是因为那个名字在 npm 上已被别人的同类插件占用；`dsh-theme-dracula-pack` 加 `-pack` 后缀是为了和上游 [PuerJJJ/dsh-theme-dracula](https://github.com/PuerJJJ/dsh-theme-dracula)（一个独立插件）区分开。装之前看清楚全名。

## 安装

```sh
dsh plugin add dsh-balance-floater
dsh plugin add dsh-theme-picker
dsh plugin add dsh-theme-dracula-pack
dsh plugin add dsh-solar-term
```

装完重启一次 DSH（Loader 行只在启动时读取）。主题包要配 `dsh-theme-picker` 才有用，两个一起装。

### 从市场装

**设置 → 插件 → Discover → Index sources** 里添加索引源，然后搜索包名。

### 不发布到 npm 也能装

npm 只是让插件市场索引能搜到你。真正安装只需要一个 `.tgz`，GitHub Release 的资产直链就是完整入口：

```sh
dsh plugin add https://github.com/yinqiang/dsh-plugins/releases/latest/download/dsh-theme-picker.tgz
```

打一个 tag 就会生成这些资产（`NPM_TOKEN` 为空时自动跳过 npm 那一步，其余照常）：

```sh
git tag v0.1.0
git push origin v0.1.0
```

## 本地开发

```sh
git clone https://github.com/yinqiang/dsh-plugins
cd dsh-plugins
node scripts/install.mjs --profile desktop          # 打印计划，什么都不改
node scripts/install.mjs --profile desktop --apply  # 建软链 + 登记 bundles + 记录依赖
```

脚本做三件事，第三件最容易漏：

1. 在 `~/.dsh/profiles/<profile>/node_modules/` 下建软链（Windows 用 junction，其他平台是目录软链），改完代码下次启动就生效；
2. 把包名追加进该 profile 的 `dsh.profile.bundles`，启动时应用它的 `dsh.bundle.patch.yml`；
3. 在 profile 的 `dependencies` 里记一条 `link:<仓库路径>`——**「插件 → 已安装」列表只读这个字段**。只登记 bundles 的包能正常加载、照常工作，但面板里永远看不到它，机理见 [AGENTS.md](./AGENTS.md#the-install-contract)。

它不会跑 pnpm，也不会碰 `pnpm-lock.yaml`。

> 如果你之前手写过 `cordis.patch.yml` 的 `insert` 行来装这些插件，**先删掉那几行**。同一个包从两个 Loader 来源加载会被 client-modules 拒绝。

## 为什么是 bundle

DSH 的插件清单只认 `package.json` 里的 **`dsh.bundle`** 声明。只写 `dsh.client` 的包能被浏览器加载，但装不上、也不会出现在插件页。

所以每个包都带一份 `dsh.bundle.patch.yml`，里面是它要插入的 Loader 行：

```yaml
# packages/dsh-theme-picker/dsh.bundle.patch.yml
- insert:
    - id: theme-manager
      name: dsh-theme-picker
```

包名出现在 `dsh.profile.bundles` 里 → 启动时这份 patch 被应用 → 行插进 Loader。整个过程不需要用户手改任何 YAML。

`dsh-theme-dracula-pack` 是个纯数据包，patch 是空数组 `[]`——它不改 Loader，只是让 `dsh plugin add` 能把它装进 `node_modules` 让管理器读到。

## 目录

```
packages/
  dsh-balance-floater/
    package.json          dsh.bundle + dsh.client
    dsh.bundle.patch.yml  插入 Loader 行
    lib/index.js          宿主半（空 apply，给 Loader 一个入口）
    lib/client.js         手写 client bundle，无构建步骤
  dsh-theme-picker/
  dsh-theme-dracula-pack/
    theme/theme.css       作用域写死的调色板
  dsh-solar-term/
    locale/*.json         界面文案
scripts/
  install.mjs             本地软链安装（链接 + bundles + 依赖）
  pack.mjs                打包成 dist/*.tgz
  check.mjs               CI 门禁：dsh.bundle、patch、bundle id 与包名一致
  awesome-lib.mjs         上架逻辑（校验 + 建 PR），可被宿主进程直接 import
  awesome-pr.mjs          上架 CLI
catalog/
  *.yml                   提交到 awesome-dsh-plugin 的条目草稿
.github/workflows/
  check.yml               PR 校验
  release.yml             tag 触发：打包 + 发 npm + 挂 release 资产
```

## 发布

```sh
git tag v0.1.0
git push origin v0.1.0
```

`release.yml` 会为每个包生成 `dist/<name>-<version>.tgz` 和固定别名的 `dist/<name>.tgz`，挂到 GitHub Release；配置了 `NPM_TOKEN` secret 就同时发 npm。

版本号各自写在包自己的 `package.json` 里，一次 tag 可以只发其中一个包的补丁版本——npm 会跳过已经存在的版本。

## 上架插件市场

[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 是官方索引，按**插件**收录。monorepo 的子包有专门写法（来自它的 contributing.md）：

| 字段 | monorepo 子包怎么写 |
| --- | --- |
| `url` | `https://github.com/yinqiang/dsh-plugins/tree/main/packages/dsh-theme-picker` |
| `name` | `yinqiang/dsh-plugins#dsh-theme-picker` |
| 文件名 | `yinqiang__dsh-plugins--packages-dsh-theme-picker.yml` |

三道门槛：

1. `package.json` 声明 **`dsh.bundle`**，PR 会自动检查——只写 `dsh.client` 是最常见的被拒原因；
2. 仓库至少存在 1 天，且带 `dsh-plugin` topic；
3. 索引只收录**已发 npm 且有明确版本**的包，没发的仍能装但不会出现在市场里。

`catalog/` 里已经放好三个包的条目。提交是一个命令：

```sh
node scripts/awesome-pr.mjs            # 四道门禁逐个核对，不动任何东西
node scripts/awesome-pr.mjs --submit   # fork → 开分支 → 加文件 → 开一个 PR
```

门禁分别是：仓库满 24 小时、带 `dsh-plugin` topic、`main` 上每个子包都声明了 `dsh.bundle`（并指向真实存在的 patch 文件）、`data/plugins/` 里还没有同名文件。任何一道不过就退出，不会留下半个 PR。

`--submit` 需要一个 GitHub token（classic 的 `public_repo`，或 fine-grained 的 Contents + Pull requests 写权限）：

```sh
GITHUB_TOKEN=ghp_xxx node scripts/awesome-pr.mjs --submit
```

> ⚠️ 在 DSH 沙箱里跑不通：子进程的出站 TLS 会被安全策略重置（宿主进程正常），所以请在普通终端里执行。拿不到 token 时 `scripts/awesome-lib.mjs` 可以被宿主的 node 进程直接 import 调用，绕开子进程。

## 排查

**插件能用，但「插件 → 已安装」是空的。** profile 的 `dsh.profile.bundles` 里有这个包，`dependencies` 里却没有对应条目，而面板只认后者。在 `~/.dsh/profiles/<profile>/package.json` 里补一条 `"<包名>": "link:<包路径>"`，或者用 `dsh plugin add` 重装。**设置 → 内置插件**里应该仍能看到它，这也正好确认了判断。

**同一个包被加载两次，或 client module 报错。** `cordis.patch.yml` 里残留的 `insert` 行指向了同样注册成 bundle 的包。删掉那行。

## 许可

MIT。`dsh-theme-dracula-pack` 的调色板沿用 [PuerJJJ/dsh-theme-dracula-pack](https://github.com/PuerJJJ/dsh-theme-dracula-pack) 的 MIT 许可与署名。
