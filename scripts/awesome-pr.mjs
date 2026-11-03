#!/usr/bin/env node
/**
 * Submit this monorepo's plugins to awesome-dsh-plugin.
 *
 *   node scripts/awesome-pr.mjs             # verify every gate, print the plan, touch nothing
 *   node scripts/awesome-pr.mjs --submit    # fork, branch, add the files, open one PR
 *   node scripts/awesome-pr.mjs --selftest  # offline: the catalog parses and agrees with the rules
 *
 * --submit needs a GitHub token (classic: public_repo; fine-grained: Contents + Pull requests: write):
 *   GITHUB_TOKEN=ghp_... node scripts/awesome-pr.mjs --submit
 *
 * This machine's sandbox resets outbound TLS for child processes, so run it in your own terminal.
 */
import { loadCatalog, validate, checkGates, submit } from './awesome-lib.mjs';

const ARGV = new Set(process.argv.slice(2));
const SELFTEST = ARGV.has('--selftest');
const SUBMIT = ARGV.has('--submit');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const entries = loadCatalog();
const problems = validate(entries);

if (SELFTEST) {
  console.log('catalog: ' + entries.length + ' entries');
  for (const { file, entry } of entries) console.log('  ' + file + '  ->  ' + entry.name + ' [' + entry.category + ']');
  if (problems.length) {
    console.log('\nproblems:');
    for (const p of problems) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('\nok - the catalog parses and agrees with the naming rules');
  process.exit(0);
}

console.log('awesome-dsh-plugin submission - ' + entries.length + ' entries\n');
if (problems.length) {
  console.log('catalog problems:');
  for (const p of problems) console.log('  x ' + p);
  process.exit(1);
}

try {
  if (!TOKEN) {
    console.log('note: no GITHUB_TOKEN, so GitHub rate-limits this to a few requests. Fine for a dry run.');
  }
  await checkGates(entries, (line) => console.log(line));
  if (SUBMIT) await submit(entries);
  else console.log('\nok - every gate passes. Re-run with --submit to open the PR.');
} catch (e) {
  const msg = e && e.message ? e.message : String(e);
  if (/fetch failed|ECONNRESET|ENOTFOUND/.test(msg)) {
    console.error('\n x cannot reach github.com from a child process: ' + msg);
    console.error('   A sandbox network policy resets outbound TLS here. Run this from your own terminal.');
  } else {
    console.error('\n x ' + msg);
  }
  process.exit(1);
}
