#!/usr/bin/env node
/**
 * Pack every workspace package into dist/.
 *
 *   dist/<name>-<version>.tgz   the real artifact, what npm publishes
 *   dist/<name>.tgz             a stable alias, so a release asset URL never moves
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(repoRoot, 'packages')
const dist = join(repoRoot, 'dist')
mkdirSync(dist, { recursive: true })

for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(packagesRoot, entry.name)
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  execFileSync('pnpm', ['pack', '--pack-destination', dist], { cwd: dir, stdio: 'inherit' })
  const versioned = join(dist, `${manifest.name}-${manifest.version}.tgz`)
  copyFileSync(versioned, join(dist, `${manifest.name}.tgz`))
  console.log(`packed ${manifest.name}@${manifest.version}`)
}
