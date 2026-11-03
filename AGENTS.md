# AGENTS.md

Working notes for anyone — human or agent — changing this repository.

## What this is

A pnpm workspace of DeepSeek Harness plugins. Every folder under `packages/` is a real npm package with its own name and version. There is no build step: a package ships exactly what sits in the folder, and DSH imports it as ESM.

Toolchain: Node 22, pnpm 9 (pinned by `packageManager` in the root `package.json`). There are no runtime dependencies anywhere — the host half uses `node:` builtins, the client half uses plain DOM.

## The install contract

A plugin reaches a running profile through **two** registrations, and both are required. This is the convention that keeps biting: the first one alone loads the plugin, and the second one is the only reason the UI admits it exists.

| Registration | Lives in | What it buys |
| --- | --- | --- |
| `dsh.profile.bundles` | the profile's `package.json` | the bundle's `dsh.bundle.patch.yml` is applied at start-up, so its Loader rows exist |
| `dependencies` | the same `package.json` | the **Plugins → Installed** list counts the package as installed |

`dsh plugin add <spec>` writes both: it runs `pnpm add` in the profile and then registers the bundle. `scripts/install.mjs` writes both too — keep it that way when you touch the script.

Registering only the bundle name is the trap. The plugin mounts, renders and behaves, and the Plugins panel stays empty, because the panel filters its list down to packages that are in `dependencies`, are official or optional bundles, or carry an error. A healthy third-party bundle named only in `bundles` matches none of those three and is dropped without a word. **Settings → Built-in plugins** still lists it, since that panel reads the Loader rather than the profile.

Before claiming a plugin is installed, read `~/.dsh/profiles/<profile>/package.json` and check both fields. A `dependencies` entry is either a registry spec or `link:<absolute path>` (forward slashes, Windows included).

## Package anatomy

```
packages/<name>/
  package.json           identity, exports, files, dsh.* declarations
  dsh.bundle.patch.yml   the Loader rows this bundle inserts (may be [])
  lib/index.js           host half — exports apply(ctx, config)
  lib/client.js          browser half — hand-written bundle, no build
  README.md              user-facing, English
  README.zh.md           the same document in Chinese
```

Rules the Loader and the CI rely on:

- `exports` maps `"."` to the host half, `"./client"` to the client half, and `"./package.json"` to the manifest. The client is resolved through that mapping.
- `files` must include `lib`, the patch file and both READMEs. A published package that forgets the patch installs and mounts nothing.
- `dsh.bundle.patch` is one path or an ordered list of paths. The file must parse and must contain at least one row — or the literal `[]` for a data-only package such as `dsh-theme-dracula-pack`.
- `dsh.client` declares `platform: "web"`, `inject` for the client plugins the bundle reads from, and `external` for modules handed in from outside.
- `dsh.marketplace` is display metadata for the marketplace; `profiles` names the profiles the plugin is offered for.
- The client bundle registers itself as `window.__ModuleLoader__.load({ id, factory })` with an `id` identical to the package name — `scripts/check.mjs` fails otherwise. Loading the file must have no side effect: the stylesheet and every listener are created inside the factory. Copy the lazy-CJS shape from an existing bundle instead of inventing one.
- Keep CSS in the bundle's own style array and scope it with a `data-dsh-*` attribute. There is no CSS build step and no global stylesheet to append to.
- Strings the Harness localizes live in `locale/<lang>.json` under `meta.title` and `meta.description` (see `dsh-solar-term`).

## Gates

`node scripts/check.mjs` is what CI runs on every push and pull request. It fails when a package has no name, is `private: true`, declares no `dsh.bundle.patch`, names a patch file that is missing or has no rows, or ships a client bundle whose module id differs from the package name. Run it before opening a PR. There is no test suite.

## Local development loop

```sh
node scripts/install.mjs --profile desktop           # dry run: prints link/bundles/deps per package
node scripts/install.mjs --profile desktop --apply   # link + register + record the dependency
```

The install is a link, not a copy: on Windows a junction, elsewhere a directory symlink. That means an edit to `packages/*/lib/client.js` reaches the running DSH on the next page load, since client bundles are served from disk — no rebuild, no restart. Host-half edits (`lib/index.js`) apply on the next DSH start.

Two things to remember while iterating:

- The Desktop app owns the `desktop` profile while it runs; writing that profile from a CLI in parallel can collide with it. Quit the app before a CLI install, or use the in-app plugin panel.
- If a plugin was previously mounted through a hand-written `insert` row in `cordis.patch.yml`, remove that row before registering it as a bundle: one package from two Loader sources is refused by the client module system.

## Versions and releases

- Bump only the packages you actually changed. One tag ships whatever is new; the npm publish step skips versions already on the registry, so unrelated packages are a no-op.
- Tags are `v<semver>` and trigger `.github/workflows/release.yml`, which runs `scripts/pack.mjs`, publishes to npm when `NPM_TOKEN` is set, and attaches `dist/<name>-<version>.tgz` plus the stable `dist/<name>.tgz` alias to the release.
- The heading in each package's `README.md` and the `version` in its `package.json` are the only places a version is written down; there is no changelog file.

## Marketplace submissions

`catalog/*.yml` holds ready-to-submit entries in the monorepo form `yinqiang/dsh-plugins#<package>` with the `url` pointing at the package folder. `scripts/awesome-pr.mjs` re-checks every gate before opening anything, and `scripts/awesome-lib.mjs` holds the logic so a host process can import it without spawning a child.

An entry is only useful once the package exists on npm with a concrete version; the index does not list GitHub-only packages, though they stay installable by tarball URL.

## Environment gotchas

- Outbound TLS from a child process is reset inside the DSH sandbox, so `scripts/awesome-pr.mjs --submit` belongs in a normal terminal. A host node process can import `awesome-lib.mjs` and bypass the child-process hop.
- Windows: write `link:` specs with forward slashes (`link:Q:/path/to/package`); they are resolved by Node, not by a shell.
- Never move a user's profile state around as part of a test. `~/.dsh` holds real sessions and credentials.

## Documentation

`README.md` (root) is the map of the repository, each package has its own `README.md` for users, and this file carries the conventions.

Every README has a Chinese mirror, `README.zh.md`. The English file opens with `English | [中文](./README.zh.md)`, the mirror opens with `[English](./README.md) | 中文`. English is the source of truth: write the change in `README.md` first, mirror it in `README.zh.md` in the same commit, and keep the heading structure parallel so the two files stay diffable.

If you change how installation, packaging or release works, update every layer in the same change: the fact tends to be stated once in the root README, once in the affected package README, and once here.
