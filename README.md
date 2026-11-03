# dsh-plugins

一组 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。每个包都声明 `dsh.bundle`，所以可以用官方的 `dsh plugin add` 装，也能进插件市场索引。

## 插件

| 包 | 作用 | 类别 |
| --- | --- | --- |
| [`dsh-balance-floater`](./packages/dsh-balance-floater) | 侧边栏余额条，余额一掉就飘出街机风格的伤害数字 | UI |
| [`dsh-theme-manager`](./packages/dsh-theme-manager) | 装多个主题包、随时切换、首帧不闪 | 主题 |
| [`dsh-theme-dracula`](./packages/dsh-theme-dracula) | 给主题管理器用的 Dracula 配色包 | 主题 |

## 安装

```sh
dsh plugin add dsh-balance-floater
dsh plugin add dsh-theme-manager
dsh plugin add dsh-theme-dracula
```

装完重启一次 DSH（Loader 行只在启动时读取）。

也可以从市场装：**设置 → 插件 → Discover → Index sources** 里添加索引源，然后搜索包名。或者直接用发布产物：

```sh
dsh plugin add https://github.com/yinqiang/dsh-plugins/releases/latest/download/dsh-theme-manager.tgz
```

### 本地开发

```sh
git clone https://github.com/yinqiang/dsh-plugins
cd dsh-plugins
node scripts/install.mjs --profile desktop          # 打印计划
node scripts/install.mjs --profile desktop --apply  # 建软链 + 登记到 dsh.profile.bundles
```

脚本只做两件事：在 `~/.dsh/profiles/<profile>/node_modules/` 下建软链，把包名追加进该 profile 的 `dsh.profile.bundles`。它不会改 `dependencies`，也不会碰 `pnpm-lock.yaml`。

> 如果你之前手写过 `cordis.patch.yml` 的 `insert` 行来装这些插件，**先删掉那几行**。同一个包从两个 Loader 来源加载会被 client-modules 拒绝。

## 为什么是 bundle

DSH 的插件清单只认 `package.json` 里的 **`dsh.bundle`** 声明。只写 `dsh.client` 的包能被浏览器加载，但装不上、也不会出现在插件页。

所以每个包都带一份 `dsh.bundle.patch.yml`，里面是它要插入的 Loader 行：

```yaml
# packages/dsh-theme-manager/dsh.bundle.patch.yml
- insert:
    - id: theme-manager
      name: dsh-theme-manager
```

包名出现在 `dsh.profile.bundles` 里 → 启动时这份 patch 被应用 → 行插进 Loader。整个过程不需要用户手改任何 YAML。

`dsh-theme-dracula` 是个纯数据包，patch 是空数组 `[]`——它不改 Loader，只是让 `dsh plugin add` 能把它装进 `node_modules` 让管理器读到。

## 目录

```
packages/
  dsh-balance-floater/
    package.json          dsh.bundle + dsh.client
    dsh.bundle.patch.yml  插入 Loader 行
    lib/index.js          宿主半（空 apply，给 Loader 一个入口）
    lib/client.js         手写 client bundle，无构建步骤
  dsh-theme-manager/
  dsh-theme-dracula/
    theme/theme.css       作用域写死的调色板
scripts/
  install.mjs             本地软链安装
  pack.mjs                打包成 dist/*.tgz
  check.mjs               CI 门禁：dsh.bundle、patch、bundle id 与包名一致
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
| `url` | `https://github.com/yinqiang/dsh-plugins/tree/main/packages/dsh-theme-manager` |
| `name` | `yinqiang/dsh-plugins#dsh-theme-manager` |
| 文件名 | `yinqiang__dsh-plugins--packages-dsh-theme-manager.yml` |

三道门槛：

1. `package.json` 声明 **`dsh.bundle`**，PR 会自动检查——只写 `dsh.client` 是最常见的被拒原因；
2. 仓库至少存在 1 天，且带 `dsh-plugin` topic；
3. 索引只收录**已发 npm 且有明确版本**的包，没发的仍能装但不会出现在市场里。

`catalog/` 里已经放好三个条目，复制到 `data/plugins/` 就能提 PR。

## 许可

MIT。`dsh-theme-dracula` 的调色板沿用 [PuerJJJ/dsh-theme-dracula](https://github.com/PuerJJJ/dsh-theme-dracula) 的 MIT 许可与署名。
