#!/usr/bin/env node
/**
 * Repository gates, run in CI and locally.
 *
 * The dsh plugin list only accepts packages that declare a `dsh.bundle`
 * manifest, so every package here is checked for one, for a patch file that
 * parses, and for a client bundle whose id matches its package name.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(repoRoot, 'packages')
const failures = []

for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(packagesRoot, entry.name)
  const where = `packages/${entry.name}`
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch (error) {
    failures.push(`${where}: package.json does not parse (${error.message})`)
    continue
  }

  if (!manifest.name) failures.push(`${where}: missing name`)
  if (manifest.private) failures.push(`${where}: private:true cannot be published`)

  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string') {
    failures.push(`${where}: missing dsh.bundle.patch (dsh.client alone is not installable)`)
  } else {
    const patchPath = join(dir, patch)
    if (!existsSync(patchPath)) failures.push(`${where}: ${patch} is missing`)
    else {
      const text = readFileSync(patchPath, 'utf8')
      const rows = text.split('\n').filter((line) => /^\s*- /.test(line) || line.trim() === '[]')
      if (rows.length === 0) failures.push(`${where}: ${patch} is empty`)
    }
  }

  if (existsSync(join(dir, 'lib', 'client.js'))) {
    const client = readFileSync(join(dir, 'lib', 'client.js'), 'utf8')
    const id = /__ModuleLoader__\.load\(\{[\s\S]*?id:\s*["']([^"']+)["']/.exec(client)?.[1]
    if (id !== manifest.name) failures.push(`${where}: client bundle registers "${id}", package is "${manifest.name}"`)
    if (!client.includes('data-dsh-')) {
      // not a gate, just a nudge that the bundle owns its own scoped CSS
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('all packages pass')
