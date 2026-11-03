# dsh-plugins

English | [中文](./README.zh.md)

A collection of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins, kept in one pnpm workspace.

Every package declares `dsh.bundle` — the manifest field the Harness plugin list accepts. That single field is what makes a package installable with `dsh plugin add`, gives it its own Loader rows at start-up, and qualifies it for the plugin marketplace.

## Plugins

| Package | What it does | Kind |
| --- | --- | --- |
| [`dsh-balance-floater`](./packages/dsh-balance-floater) | Puts the account balance beside the sidebar account button, and pops arcade damage numbers whenever it drops | UI |
| [`dsh-theme-picker`](./packages/dsh-theme-picker) | Installs any number of theme packs and switches between them instantly, with no reload and no first-paint flash | Theme |
| [`dsh-theme-dracula-pack`](./packages/dsh-theme-dracula-pack) | A Dracula palette pack for the theme picker | Theme |
| [`dsh-solar-term`](./packages/dsh-solar-term) | A solar-term badge at the top-left of the conversation: the current term, its exact moment, and the days until the next one | UI |

## Package names

`dsh-theme-picker` is not called `dsh-theme-manager` because that name is already taken on npm by an unrelated plugin of the same kind. `dsh-theme-dracula-pack` carries the `-pack` suffix to stay distinguishable from the upstream [PuerJJJ/dsh-theme-dracula](https://github.com/PuerJJJ/dsh-theme-dracula) plugin, which is a plugin of its own. Read the full name before installing.

## Install

```sh
dsh plugin add dsh-balance-floater
dsh plugin add dsh-theme-picker
dsh plugin add dsh-theme-dracula-pack
dsh plugin add dsh-solar-term
```

Restart DSH once afterwards — Loader rows are read at start-up only.

A theme pack needs the picker to be useful: install `dsh-theme-picker` together with `dsh-theme-dracula-pack`.

### From the marketplace

Add an index source under **Settings → Plugins → Discover → Index sources**, then search for the package name.

### Without npm: GitHub Releases

npm only matters for the marketplace index. Installing needs nothing but a `.tgz`, and a release asset URL is a complete entry point:

```sh
dsh plugin add https://github.com/yinqiang/dsh-plugins/releases/latest/download/dsh-theme-picker.tgz
```

Pushing a tag builds those assets (the npm step is skipped automatically when `NPM_TOKEN` is empty):

```sh
git tag v0.1.0
git push origin v0.1.0
```

## Local development

```sh
git clone https://github.com/yinqiang/dsh-plugins
cd dsh-plugins
node scripts/install.mjs --profile desktop           # print the plan; change nothing
node scripts/install.mjs --profile desktop --apply   # link, register, record the dependency
```

The script does three things, and the third one is easy to miss:

1. links each package into `~/.dsh/profiles/<profile>/node_modules/` (a junction on Windows, a directory symlink elsewhere), so edits reach DSH on the next start;
2. appends the package name to that profile's `dsh.profile.bundles`, so its `dsh.bundle.patch.yml` is applied at start-up;
3. records `link:<repo path>` in the profile's `dependencies`, because that is the field the **Plugins → Installed** list reads. A package registered only as a bundle loads perfectly and never appears there — the full story is in [AGENTS.md](./AGENTS.md#the-install-contract).

It never runs pnpm and never touches `pnpm-lock.yaml`.

> If you installed these packages earlier by hand-writing `insert` rows in the profile's `cordis.patch.yml`, delete those rows first: one package loaded from two Loader sources is refused by the client module system.

## Why every package is a bundle

DSH's plugin list only accepts a package whose `package.json` declares **`dsh.bundle`**. A package with `dsh.client` alone can still be loaded by the browser, but it cannot be installed and never shows up on the plugin page.

So every package here ships a `dsh.bundle.patch.yml` holding the Loader rows it inserts:

```yaml
# packages/dsh-theme-picker/dsh.bundle.patch.yml
- insert:
    - id: theme-manager
      name: dsh-theme-picker
```

The package name in `dsh.profile.bundles` makes that patch apply at start-up, which inserts the row. Nobody edits YAML by hand.

`dsh-theme-dracula-pack` is pure data: its patch is an empty array (`[]`). It contributes no Loader rows; the bundle declaration exists so `dsh plugin add` can put it into `node_modules` where the picker finds it.

## Layout

```
packages/
  dsh-balance-floater/
    package.json          dsh.bundle + dsh.client
    dsh.bundle.patch.yml  the Loader rows this package inserts
    lib/index.js          host half (an empty apply; it exists to be a Loader row)
    lib/client.js         hand-written client bundle, no build step
  dsh-theme-picker/
  dsh-theme-dracula-pack/
    theme/theme.css       palette, scoped by the file itself
  dsh-solar-term/
    locale/*.json         user-facing strings
scripts/
  install.mjs             local link install (link + bundles + dependencies)
  pack.mjs                pack every package into dist/*.tgz
  check.mjs               the CI gate: dsh.bundle, a parseable patch, client id == package name
  awesome-lib.mjs         marketplace submission logic, importable by a host process
  awesome-pr.mjs          the submission CLI
catalog/
  *.yml                   entry drafts for awesome-dsh-plugin
.github/workflows/
  check.yml               pull-request gate
  release.yml             tag trigger: pack, publish to npm, attach release assets
```

## Release

```sh
git tag v0.1.0
git push origin v0.1.0
```

`release.yml` packs `dist/<name>-<version>.tgz` plus a stable `dist/<name>.tgz` alias for each package, attaches both to the GitHub Release, and publishes to npm when the `NPM_TOKEN` secret exists.

Versions live in each package's own `package.json`, so one tag can ship a patch release of a single package — npm skips versions that already exist.

## Listing in the plugin marketplace

[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) is the official index. It indexes *plugins*, and a monorepo subpackage has its own spelling (from its contributing guide):

| Field | A monorepo subpackage |
| --- | --- |
| `url` | `https://github.com/yinqiang/dsh-plugins/tree/main/packages/dsh-theme-picker` |
| `name` | `yinqiang/dsh-plugins#dsh-theme-picker` |
| File name | `yinqiang__dsh-plugins--packages-dsh-theme-picker.yml` |

Three gates apply:

1. `package.json` declares **`dsh.bundle`** — checked automatically on the PR, and declaring `dsh.client` only is the most common reason a submission is rejected;
2. the repository is at least one day old and carries the `dsh-plugin` topic;
3. the index only lists packages that are **published to npm with a concrete version**. Unpublished ones stay installable, they just do not appear in the marketplace.

`catalog/` holds drafts for three packages. Submitting is one command:

```sh
node scripts/awesome-pr.mjs            # check all four gates, change nothing
node scripts/awesome-pr.mjs --submit   # fork, branch, add the files, open one PR
```

The gates: the repository is older than 24 hours, it carries the `dsh-plugin` topic, every subpackage on `main` declares `dsh.bundle` pointing at a patch file that exists, and `data/plugins/` has no file of the same name yet. Any failure exits without leaving half a PR behind.

`--submit` needs a GitHub token (classic `public_repo`, or fine-grained Contents + Pull requests write):

```sh
GITHUB_TOKEN=ghp_xxx node scripts/awesome-pr.mjs --submit
```

> ⚠️ This does not work inside the DSH sandbox: outbound TLS from a child process is reset by the security policy. Run it in a normal terminal. Without a token, a host node process can import `scripts/awesome-lib.mjs` directly and call the same functions.

## Troubleshooting

**The plugin works, but Plugins → Installed is empty.** The profile lists the package in `dsh.profile.bundles` but has no matching entry in `dependencies`, and the panel derives "installed" from the latter. Add `"<name>": "link:<path-to-package>"` to `~/.dsh/profiles/<profile>/package.json`, or reinstall through `dsh plugin add`. **Settings → Built-in plugins** should still show the running plugin, which confirms the diagnosis.

**One package loads twice, or the client module system refuses it.** A leftover `insert` row in `cordis.patch.yml` names the same package that is also registered as a bundle. Remove the row.

## License

MIT. The `dsh-theme-dracula-pack` palette keeps the MIT license and attribution of [PuerJJJ/dsh-theme-dracula-pack](https://github.com/PuerJJJ/dsh-theme-dracula-pack).
