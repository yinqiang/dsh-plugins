#!/usr/bin/env node
/**
 * Link every package in this repo into a dsh profile.
 *
 *   node scripts/install.mjs --profile desktop            # dry run, prints the plan
 *   node scripts/install.mjs --profile desktop --apply    # link + register bundles
 *   node scripts/install.mjs --profile desktop --uninstall --apply
 *
 * The plugin is symlinked instead of copied, so edits here reach dsh on the next
 * start. Registration is only the package name in `dsh.profile.bundles`: every
 * package ships its own `dsh.bundle.patch.yml`, which inserts the Loader rows.
 *
 * Writes land under $DSH_HOME (default ~/.dsh), outside any session workspace.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(repoRoot, 'packages')

const flag = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const profileName = flag('--profile', 'desktop')
const apply = process.argv.includes('--apply')
const uninstall = process.argv.includes('--uninstall')
const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', profileName)
const manifestPath = join(profileDir, 'package.json')
const modulesDir = join(profileDir, 'node_modules')

if (!existsSync(manifestPath)) {
  console.error(`no profile manifest at ${manifestPath}`)
  process.exit(1)
}

const packages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = join(packagesRoot, entry.name)
    return { dir, name: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name }
  })
  .filter((pack) => typeof pack.name === 'string' && pack.name.length > 0)
  .sort((left, right) => left.name.localeCompare(right.name))

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles ?? []

console.log(`profile  ${profileDir}`)
console.log(`bundles  ${bundles.join(', ')}`)

/* A hand-written insert row and a registered bundle both load the same package,
   and the client module system refuses one package from two Loader sources. */
const patchPath = join(profileDir, 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8')
  const stale = packages.filter((pack) => patch.includes(pack.name))
  if (stale.length > 0) {
    console.warn(`\nwarning: cordis.patch.yml still names ${stale.map((p) => p.name).join(', ')} in an insert row.`)
    console.warn('         remove those rows first, or the package loads from two Loader sources.')
  }
}

for (const pack of packages) {
  const linkPath = join(modulesDir, pack.name)
  const present = existsSync(linkPath)
  const linked = present && lstatSync(linkPath).isSymbolicLink()
  const listed = bundles.includes(pack.name)
  console.log(
    `\n${pack.name}\n  link     ${present ? (linked ? 'symlink' : 'directory (not ours)') : 'missing'}` +
      `\n  bundles  ${listed ? 'registered' : 'not registered'}`,
  )
}

if (!apply) {
  console.log(`\ndry run: pass --apply to ${uninstall ? 'unlink and unregister' : 'link and register'}`)
  process.exit(0)
}

mkdirSync(modulesDir, { recursive: true })
copyFileSync(manifestPath, `${manifestPath}.bak-plugins`)

if (uninstall) {
  for (const pack of packages) {
    const linkPath = join(modulesDir, pack.name)
    if (existsSync(linkPath) && lstatSync(linkPath).isSymbolicLink()) {
      unlinkSync(linkPath)
      console.log(`unlinked ${pack.name}`)
    }
  }
} else {
  for (const pack of packages) {
    const linkPath = join(modulesDir, pack.name)
    if (existsSync(linkPath) && lstatSync(linkPath).isSymbolicLink()) unlinkSync(linkPath)
    symlinkSync(pack.dir, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`linked   ${pack.name}`)
  }
}

const next = new Set(bundles)
for (const pack of packages) {
  if (uninstall) next.delete(pack.name)
  else next.add(pack.name)
}
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
manifest.dsh.profile.bundles = [...bundles.filter((name) => next.has(name)), ...[...next].filter((name) => !bundles.includes(name))]
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`\nbundles  ${manifest.dsh.profile.bundles.join(', ')}`)
console.log('restart dsh to apply.')
