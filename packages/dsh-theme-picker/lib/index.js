/**
 * Theme manager — host half.
 *
 * Owns the palette registry and the pre-paint injection. Every installed
 * theme pack is one `<style>` scoped to `body[data-dsh-theme="<id>"]`, and one
 * boot script restores the chosen id before the first paint, so switching
 * themes is a single DOM attribute flip with no reload and no flash.
 *
 * A theme pack is any package under the profile's `node_modules` whose
 * package.json declares:
 *
 *   "dsh": {
 *     "theme": {
 *       "id": "dracula",
 *       "name": "Dracula",
 *       "colorScheme": "dark",
 *       "css": "./theme/theme.css",
 *       "swatches": ["#20212b", "#bd93f9"]
 *     }
 *   }
 *
 * The CSS file owns its own scoping; the manager only concatenates and injects
 * it, and publishes the catalogue to the browser through the boot script.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** localStorage key holding the active theme id. */
export const STORAGE_KEY = 'dsh-theme:active'
/** Body attribute every pack's stylesheet keys off. */
export const ATTRIBUTE = 'data-dsh-theme'
/** How long a scan result stays valid, in milliseconds. */
const CACHE_MS = 2000

/** Directory of this module, used to locate the owning node_modules root. */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Last resolved catalogue. */
let cache = { root: null, at: 0, packs: [] }

/**
 * Walk up from this module until a node_modules directory shows up.
 *
 * @returns the profile's module root, or null when the package is not installed
 *   under node_modules.
 */
function findModulesRoot() {
  let dir = HERE
  for (let step = 0; step < 10; step += 1) {
    if (dir.endsWith(`${sep}node_modules`) || dir === 'node_modules') return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * Read one package as a theme pack.
 *
 * @param pkgDir - absolute package directory.
 * @param manifest - parsed package.json.
 * @returns the pack, or null when the package declares no usable theme.
 */
function readPack(pkgDir, manifest) {
  const theme = manifest.dsh && manifest.dsh.theme
  if (!theme || typeof theme !== 'object' || typeof theme.id !== 'string' || theme.id === '') return null
  const cssPath = resolve(pkgDir, typeof theme.css === 'string' && theme.css !== '' ? theme.css : './theme/theme.css')
  if (!cssPath.startsWith(pkgDir + sep)) return null
  let css
  try {
    css = readFileSync(cssPath, 'utf8')
  } catch {
    return null
  }
  return {
    id: theme.id,
    name: typeof theme.name === 'string' && theme.name !== '' ? theme.name : theme.id,
    description: typeof theme.description === 'string' ? theme.description : '',
    colorScheme: theme.colorScheme === 'light' ? 'light' : 'dark',
    swatches: Array.isArray(theme.swatches)
      ? theme.swatches.filter((color) => typeof color === 'string').slice(0, 8)
      : [],
    css,
  }
}

/**
 * List every package directory under one node_modules root.
 *
 * @param modulesRoot - absolute node_modules path.
 * @returns package directories, including scoped ones.
 */
function packageDirs(modulesRoot) {
  const dirs = []
  let entries
  try {
    entries = readdirSync(modulesRoot, { withFileTypes: true })
  } catch {
    return dirs
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('.')) continue
    const full = join(modulesRoot, entry.name)
    if (!entry.name.startsWith('@')) {
      dirs.push(full)
      continue
    }
    let scoped
    try {
      scoped = readdirSync(full, { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of scoped) {
      if (child.isDirectory() || child.isSymbolicLink()) dirs.push(join(full, child.name))
    }
  }
  return dirs
}

/**
 * Scan the module root for theme packs.
 *
 * @param modulesRoot - absolute node_modules path.
 * @returns packs ordered by display name.
 */
function scan(modulesRoot) {
  const packs = []
  const seen = new Set()
  for (const pkgDir of packageDirs(modulesRoot)) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    const pack = readPack(pkgDir, manifest)
    if (pack === null || seen.has(pack.id)) continue
    seen.add(pack.id)
    packs.push(pack)
  }
  return packs.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Current catalogue, rescanned at most every CACHE_MS so a freshly dropped pack
 * shows up on the next page load without a host restart.
 *
 * @returns installed theme packs.
 */
function loadPacks(config) {
  const modulesRoot = findModulesRoot()
  const now = Date.now()
  if (modulesRoot !== null && cache.root === modulesRoot && now - cache.at < CACHE_MS) return cache.packs
  const packs = modulesRoot === null ? [] : scan(modulesRoot)
  const extra = config && Array.isArray(config.inline) ? config.inline : []
  for (const entry of extra) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.css !== 'string') continue
    if (packs.some((pack) => pack.id === entry.id)) continue
    packs.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      description: typeof entry.description === 'string' ? entry.description : '',
      colorScheme: entry.colorScheme === 'light' ? 'light' : 'dark',
      swatches: Array.isArray(entry.swatches) ? entry.swatches.filter((c) => typeof c === 'string') : [],
      css: entry.css,
    })
  }
  if (modulesRoot !== null) cache = { root: modulesRoot, at: now, packs }
  return packs
}

/**
 * Boot script: restore the active theme before the first paint and publish the
 * catalogue for the client half.
 *
 * @param packs - installed theme packs.
 * @returns an inline script body.
 */
function bootScript(packs) {
  const catalog = packs.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    colorScheme: pack.colorScheme,
    swatches: pack.swatches,
  }))
  const json = JSON.stringify(catalog).replace(/</g, '\\u003c')
  return `(function () {
  var KEY = ${JSON.stringify(STORAGE_KEY)};
  var ATTR = ${JSON.stringify(ATTRIBUTE)};
  var THEMES = ${json};
  var active = null;
  try {
    active = window.localStorage.getItem(KEY);
  } catch (error) {
    /* storage unavailable: fall back to the shipped palette */
  }
  var known = false;
  for (var index = 0; index < THEMES.length; index += 1) {
    if (THEMES[index].id === active) known = true;
  }
  if (!known) active = null;
  globalThis.__DSH_THEME_MANAGER__ = { themes: THEMES, active: active };
  var body = document.body;
  if (!body) return;
  if (active === null) body.removeAttribute(ATTR);
  else body.setAttribute(ATTR, active);
})();`
}

export const name = 'theme-manager'

/**
 * Inject every pack plus the boot script on each page render.
 *
 * @param ctx - plugin context.
 * @param config - optional inline packs.
 */
export function apply(ctx, config) {
  ctx.on('webserver/index-inject', (table) => {
    const packs = loadPacks(config)
    for (const pack of packs) table.push({ kind: 'style', text: pack.css })
    table.push({ kind: 'script', placement: 'body', text: bootScript(packs) })
  })
}
