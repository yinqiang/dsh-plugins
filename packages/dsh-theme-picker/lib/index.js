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
 *
 * Background presets are resolved here rather than in the browser, because
 * cn.bing.com and wallhaven.cc send no CORS headers. A resolved URL is cached
 * with the local day it belongs to and served two ways: embedded in the
 * first-paint script, and over `SOURCE_ENDPOINT` so a page that is already open
 * can refresh itself without a reload.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** localStorage key holding the active theme id. */
export const STORAGE_KEY = 'dsh-theme:active'
/** Body attribute every pack's stylesheet keys off. */
export const ATTRIBUTE = 'data-dsh-theme'
/** Route a running page calls to refresh a preset without a reload. */
export const SOURCE_ENDPOINT = '/plugins/theme-picker/source'
/** How long a scan result stays valid, in milliseconds. */
const CACHE_MS = 2000
/** How long a resolved preset stays usable before it is fetched again. */
const SOURCE_TTL_MS = 60 * 60 * 1000
/** How long a failed fetch waits before the next attempt. */
const SOURCE_RETRY_MS = 5 * 60 * 1000

/** Directory of this module, used to locate the owning node_modules root. */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Last resolved catalogue. */
let cache = { root: null, at: 0, packs: [] }

/** Harness home, honouring `DSH_HOME` the way the harness itself does. */
const DSH_HOME = process.env.DSH_HOME !== undefined && process.env.DSH_HOME.trim() !== ''
  ? process.env.DSH_HOME.trim()
  : join(homedir(), '.dsh')

/** Preset cache, so a restart paints something before the network answers. */
const SOURCES_FILE = join(DSH_HOME, '.dsh-theme-picker-sources.json')
/** Diagnostics for the two preset sources. */
const DEBUG_FILE = join(DSH_HOME, '.dsh-theme-picker-debug.log')

/**
 * Resolved presets. `bing.day` is the local calendar day its URL belongs to:
 * Bing rotates the picture at local midnight, so a day mismatch is exactly
 * "tomorrow shows a different picture".
 */
let sourceState = { bing: { url: null, at: 0, day: null }, wallhaven: { url: null, at: 0 } }
/** At most one non-forced fetch per source; a click always starts its own. */
const inFlight = { bing: null, wallhaven: null }

/**
 * Read the preset cache. The first version of this file wrote bare URL strings
 * under the same keys, so both shapes are accepted.
 */
function loadSourceCache() {
  let saved
  try {
    saved = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'))
  } catch (error) {
    /* first launch: nothing cached yet, the boot fetch below fills it */
    return
  }
  const bing = typeof saved?.bing === 'string' ? { url: saved.bing } : saved?.bing
  if (bing !== undefined && typeof bing.url === 'string' && bing.url !== '') {
    sourceState.bing = {
      url: bing.url,
      at: Number.isFinite(bing.at) ? bing.at : 0,
      day: typeof bing.day === 'string' ? bing.day : null,
    }
  }
  const wallhaven = typeof saved?.wallhaven === 'string' ? { url: saved.wallhaven } : saved?.wallhaven
  if (wallhaven !== undefined && typeof wallhaven.url === 'string' && wallhaven.url !== '') {
    sourceState.wallhaven = { url: wallhaven.url, at: Number.isFinite(wallhaven.at) ? wallhaven.at : 0 }
  }
}

/** Persist the preset cache; a read-only home keeps it in memory only. */
function saveSources() {
  try {
    writeFileSync(SOURCES_FILE, JSON.stringify({ bing: sourceState.bing, wallhaven: sourceState.wallhaven }, null, 2))
  } catch (error) {
    /* read-only home: the cache stays in memory */
  }
}

function debugLog(message) {
  try {
    appendFileSync(DEBUG_FILE, new Date().toISOString() + ' ' + message + '\n')
  } catch (error) {
    /* logging is best effort */
  }
}

/**
 * Local calendar day of one instant, as `YYYY-MM-DD`.
 * @param now - instant to label; defaults to the current time.
 * @returns the day in the machine's time zone.
 */
function localDay(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return String(now.getFullYear()) + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
}

/**
 * Whether the cached Bing picture is from another day, too old, or missing.
 * @param now - current epoch milliseconds.
 * @returns true when the picture has to be fetched again.
 */
function bingIsStale(now = Date.now()) {
  const entry = sourceState.bing
  if (entry.url === null) return true
  if (entry.day !== localDay()) return true
  return now - entry.at >= SOURCE_TTL_MS
}

/**
 * Fetch one JSON document, bypassing every cache on the way.
 * @param url - absolute URL.
 * @returns the parsed body.
 * @throws when the response is not a success or does not hold JSON.
 */
async function requestJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
  if (!response.ok) throw new Error('HTTP ' + String(response.status))
  return response.json()
}

/** Fetch today's Bing picture and remember the local day it belongs to. */
async function fetchBingSource() {
  const endpoint = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN&_=' + String(Date.now())
  const payload = await requestJson(endpoint)
  const image = payload?.images?.[0]
  if (image === undefined || typeof image.url !== 'string' || image.url === '') throw new Error('payload has no image')
  const url = image.url.startsWith('http') ? image.url : 'https://cn.bing.com' + image.url
  sourceState.bing = { url, at: Date.now(), day: localDay() }
  saveSources()
  debugLog('bing ok ' + url)
  return url
}

/**
 * Fetch a random wallpaper. A fresh seed plus a cache-buster is what makes two
 * consecutive calls return two different pictures; the previous URL is
 * rejected outright, so a click always changes the background.
 */
async function fetchWallhavenSource() {
  const previous = sourceState.wallhaven.url
  let chosen = previous
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seed = Math.random().toString(36).slice(2, 10)
    const endpoint = 'https://wallhaven.cc/api/v1/search?sorting=random&purity=100&atleast=1920x1080&categories=100&seed=' + seed + '&_=' + String(Date.now())
    const payload = await requestJson(endpoint)
    const item = payload?.data?.[0]
    if (item === undefined || typeof item.path !== 'string' || item.path === '') throw new Error('payload has no wallpaper')
    chosen = item.path
    if (item.path !== previous) break
  }
  sourceState.wallhaven = { url: chosen, at: Date.now() }
  saveSources()
  debugLog('wallhaven ok ' + chosen)
  return chosen
}

/**
 * Current URL of one preset, fetching when it is missing or out of date.
 * @param kind - `bing` or `wallhaven`.
 * @param force - fetch even when the cached value is still fresh; a click passes true.
 * @returns the resolved image URL.
 */
async function resolveSource(kind, force) {
  if (kind === 'bing' && force !== true && !bingIsStale()) return sourceState.bing.url
  if (kind === 'wallhaven' && force !== true && sourceState.wallhaven.url !== null) return sourceState.wallhaven.url
  if (force !== true && inFlight[kind] !== null) return inFlight[kind]
  const run = (kind === 'bing' ? fetchBingSource() : fetchWallhavenSource()).catch((error) => {
    debugLog(kind + ' fail: ' + String(error?.message ?? error))
    throw error
  }).finally(() => {
    if (inFlight[kind] === run) inFlight[kind] = null
  })
  if (force !== true) inFlight[kind] = run
  return run
}

/**
 * Answer one preset request as JSON. Deliberately uncached: the page polls this
 * to pick up a picture that changed while it stayed open.
 * @param res - response owning the body.
 * @param status - HTTP status.
 * @param body - JSON-serializable payload.
 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'content-length': String(Buffer.byteLength(text)),
  })
  res.end(text)
}

/**
 * Serve `GET /plugins/theme-picker/source?kind=<bing|wallhaven>&force=1`.
 * @param req - incoming request.
 * @param res - response owning the body.
 */
async function handleSourceRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const asked = new URL(req.url ?? SOURCE_ENDPOINT, 'http://localhost')
  const kind = asked.searchParams.get('kind') === 'wallhaven' ? 'wallhaven' : 'bing'
  const force = asked.searchParams.get('force') === '1'
  try {
    const url = await resolveSource(kind, force)
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' })
      res.end()
      return
    }
    const body = kind === 'bing'
      ? { kind, url, day: sourceState.bing.day, at: sourceState.bing.at }
      : { kind, url, at: sourceState.wallhaven.at }
    sendJson(res, 200, body)
  } catch (error) {
    sendJson(res, 502, { kind, error: String(error?.message ?? error) })
  }
}

loadSourceCache()

/**
 * Resolve the presets before the first page is served, so the boot script
 * carries real URLs. Top-level await finishes at import time, before apply()
 * and before the web server answers a request. Capped so a dead network cannot
 * hold up startup.
 */
try {
  await Promise.race([
    Promise.all([resolveSource('bing', false), resolveSource('wallhaven', false)]),
    new Promise((done) => setTimeout(done, 3000)),
  ])
  debugLog('resolved at load: bing=' + sourceState.bing.url + ' wallhaven=' + sourceState.wallhaven.url)
} catch (error) {
  debugLog('resolve at load threw: ' + String(error?.message ?? error))
}

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

/** Keep only the font roles a pack actually declares.
 * @param fonts - the pack's `dsh.theme.fonts` object.
 * @returns a role -> family-list map, possibly empty.
 */
function readFonts(fonts) {
  const out = {}
  if (!fonts || typeof fonts !== 'object') return out
  for (const role of ['text', 'code', 'terminal']) {
    const value = fonts[role]
    if (typeof value === 'string' && value.trim() !== '') out[role] = value.trim()
  }
  return out
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
    fonts: readFonts(theme.fonts),
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
    fonts: pack.fonts,
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
  var SOURCES = ${JSON.stringify({ bing: sourceState.bing.url, wallhaven: sourceState.wallhaven.url })};
  globalThis.__DSH_THEME_MANAGER__ = {
    themes: THEMES,
    active: active,
    sources: SOURCES,
    sourceEndpoint: ${JSON.stringify(SOURCE_ENDPOINT)},
    sourcesAt: ${JSON.stringify(Date.now())}
  };
  var body = document.body;
  if (!body) return;
  if (active === null) body.removeAttribute(ATTR);
  else body.setAttribute(ATTR, active);
})();`
}

export const name = 'theme-manager'

/**
 * Register the browser half, the pre-paint hook, and the preset endpoint.
 *
 * @param ctx - plugin context.
 * @param config - optional inline packs.
 */
export function apply(ctx, config) {
  ctx.inject(['webServer'], (web) => {
    web.effect(() => web.webServer.register({
      kind: 'exact',
      path: SOURCE_ENDPOINT,
      handler: (req, res) => {
        void handleSourceRequest(req, res)
      },
    }), 'theme-manager: background source endpoint')
  })

  ctx.on('webserver/index-inject', (table) => {
    /* Keep tomorrow's picture warm so the next render embeds a current URL.
       A page that stays open does not depend on this: it polls the endpoint. */
    void resolveSource('bing', false).catch(() => {})
    const packs = loadPacks(config)
    for (const pack of packs) table.push({ kind: 'style', text: pack.css })
    table.push({ kind: 'script', placement: 'body', text: bootScript(packs) })
  })
}
