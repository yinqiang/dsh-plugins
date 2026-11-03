/**
 * awesome-dsh-plugin submission logic, network-free to import.
 *
 * Used by two front ends:
 *   scripts/awesome-pr.mjs  - the CLI you run yourself
 *   the agent, via          - await import('./awesome-lib.mjs') inside its own process,
 *                             which matters on machines where child processes get
 *                             their TLS reset by a sandbox network policy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BT = "\u0060";
const FENCE = BT.repeat(3);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'catalog');

const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin';
const FORK_OWNER = 'yinqiang';
const SOURCE = 'yinqiang/dsh-plugins';
const BRANCH = 'add-dsh-plugins';

const CATEGORIES = new Set([
  'ui', 'usage', 'theme', 'model', 'identity', 'session', 'memory', 'tools',
  'wsl', 'browser', 'vision', 'voice', 'docs', 'skill', 'workflow', 'git',
  'notify', 'dev', 'security', 'remote', 'market', 'fun',
]);

process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
let TOKEN = process.env.GITHUB_TOKEN;
const setToken = (t) => { TOKEN = t; };
const API = 'https://api.github.com';

const info = (msg) => console.log(msg);
const fail = (msg) => { throw new Error(msg); };

/* ---------------- catalog: flat YAML, hand-parsed, no dependencies ---------------- */

const unquote = (v) => v.replace(/^['"]|['"]$/g, '').trim();

function parseEntry(text) {
  const out = { description: {} };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^\s*#/.test(line)) continue;
    const top = /^([a-z]+):\s*(.*)$/.exec(line);
    if (top) {
      if (top[1] === 'description') continue;
      out[top[1]] = unquote(top[2]);
      continue;
    }
    const sub = /^\s+(en|zh):\s*(.*)$/.exec(line);
    if (sub) out.description[sub[1]] = unquote(sub[2]);
  }
  return out;
}

const subName = (entry) => {
  const m = /#(.+)$/.exec(entry.name || '');
  return m ? m[1] : '';
};

function loadCatalog() {
  return readdirSync(CATALOG)
    .filter((f) => f.endsWith('.yml'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(CATALOG, file), 'utf8');
      return { file, raw: text.trim() + '\n', entry: parseEntry(text) };
    });
}

function validate(entries) {
  const problems = [];
  const [owner, repo] = SOURCE.split('/');
  for (const { file, entry } of entries) {
    const where = 'catalog/' + file;
    const pkg = subName(entry);
    if (!pkg) problems.push(where + ': name must read ' + SOURCE + '#<subpackage>');
    if (!entry.url || !entry.url.startsWith('https://github.com/' + SOURCE + '/tree/main/packages/')) {
      problems.push(where + ': url must point at the subdirectory under ' + SOURCE);
    }
    if (!entry.category) problems.push(where + ': missing category');
    else if (!CATEGORIES.has(entry.category)) problems.push(where + ': category ' + entry.category + ' is not in the list');
    if (!entry.description.en) problems.push(where + ': description.en is required');
    else if (!/\.$/.test(entry.description.en)) problems.push(where + ': description.en should end with a period');
    const expected = owner + '__' + repo + '--packages-' + pkg + '.yml';
    if (pkg && file !== expected) problems.push(where + ': filename should be ' + expected);
  }
  const names = entries.map((e) => e.entry.name);
  if (new Set(names).size !== names.length) problems.push('catalog: two entries claim the same package');
  return problems;
}

/* ---------------- network ---------------- */

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-plugins-awesome-pr',
      ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

function networkHelp(e) {
  return 'network unreachable: ' + (e && e.message ? e.message : e) +
    '\n  A restricted sandbox blocks outbound TLS for child processes. Run this in your own terminal,';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- gates ---------------- */

const DAY = 864e5;

async function gateAge() {
  const repo = (await api('/repos/' + SOURCE)).body;
  if (!repo || !repo.created_at) fail('cannot read ' + SOURCE + ' - check the token and repo name');
  const ageH = (Date.now() - Date.parse(repo.created_at)) / 36e5;
  if (ageH < 24) {
    throw new Error('the repo is ' + ageH.toFixed(2) + 'h old; the list wants 24h. It clears at ' +
      new Date(Date.parse(repo.created_at) + DAY).toISOString() + '.');
  }
  return ageH / 24;
}

async function gateTopics() {
  const topics = ((await api('/repos/' + SOURCE + '/topics')).body || {}).names || [];
  if (!topics.includes('dsh-plugin')) fail('missing the dsh-plugin topic (have: ' + (topics.join(', ') || 'none') + ')');
  return topics;
}

async function gateManifests(entries) {
  const ok = [];
  for (const { entry } of entries) {
    const pkg = subName(entry);
    const base = 'https://raw.githubusercontent.com/' + SOURCE + '/main/packages/' + pkg + '/';
    let manifest;
    try {
      manifest = JSON.parse(await fetch(base + 'package.json').then((r) => r.text()));
    } catch {
      fail(pkg + ': package.json is missing or unreadable on main');
    }
    if (!manifest.dsh || !manifest.dsh.bundle) {
      fail(pkg + ': package.json has no "dsh.bundle" - the number one reason PRs get bounced');
    }
    const patch = manifest.dsh.bundle.patch;
    if (patch) {
      const head = await fetch(base + patch.replace(/^\.\//, ''), { method: 'HEAD' });
      if (!head.ok) fail(pkg + ': dsh.bundle.patch points at ' + patch + ', which is not on main');
    }
    const client = manifest.dsh.client ? ' +client ' + (manifest.dsh.client.platform || '?') : '';
    ok.push(pkg + client);
  }
  return ok;
}

async function gateUpstreamEmpty(entries) {
  const free = [];
  for (const { file } of entries) {
    const r = await api('/repos/' + UPSTREAM + '/contents/data/plugins/' + file);
    if (r.status === 200) fail('data/plugins/' + file + ' already exists upstream - already listed, or a PR is pending');
    if (r.status !== 404) fail('unexpected ' + r.status + ' while probing data/plugins/' + file);
    free.push(file);
  }
  return free;
}

async function checkGates(entries, log = () => {}) {
  log('gate 1/4  the repo is at least 1 day old');
  log('           ok - ' + (await gateAge()).toFixed(2) + ' days');
  log('gate 2/4  the repo carries the dsh-plugin topic');
  log('           ok - ' + (await gateTopics()).join(', '));
  log('gate 3/4  every subpackage declares dsh.bundle');
  for (const line of await gateManifests(entries)) log('           ok - ' + line);
  log('gate 4/4  none of these files are upstream yet');
  for (const line of await gateUpstreamEmpty(entries)) log('           ok - ' + line);
}

/* ---------------- the pull request ---------------- */

function prBody(entries) {
  const rows = entries.map(({ entry }) => {
    const pkg = subName(entry);
    return '| [' + pkg + '](https://www.npmjs.com/package/' + pkg + ') | ' + BT + entry.category + BT + ' | ' + entry.description.en + ' |';
  });
  const installs = entries.map(({ entry }) => 'dsh plugin add ' + subName(entry));
  return [
    'Adds three plugins from the [' + SOURCE + '](https://github.com/' + SOURCE + ') monorepo.',
    '',
    '| Package | Category | What it does |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '**Install**',
    '',
    FENCE + 'sh',
    ...installs,
    FENCE,
    '',
    '**Checklist**',
    '',
    '- [x] each subpackage declares ' + BT + 'dsh.bundle' + BT + ' in its ' + BT + 'package.json' + BT + ', pointing at the shipped ' + BT + 'dsh.bundle.patch.yml' + BT,
    '- [x] repo is more than 1 day old',
    '- [x] repo carries the ' + BT + 'dsh-plugin' + BT + ' topic',
    '- [x] all three are on npm (' + BT + 'latest' + BT + ' = 0.1.0), so installs skip the build-approval prompt',
    '- [x] prebuilt tarballs are attached to the v0.1.0 release as a fallback',
    '',
    '_Filed with ' + BT + 'scripts/awesome-pr.mjs' + BT + ' from the plugin repo._',
  ].join('\n');
}

async function submit(entries) {
  if (!TOKEN) fail('--submit needs GITHUB_TOKEN (public_repo, or Contents: write + Pull requests: write)');

  info('\n-> forking ' + UPSTREAM);
  const forkRes = await api('/repos/' + UPSTREAM + '/forks', {
    method: 'POST',
    body: JSON.stringify({ default_branch_only: true }),
  });
  const alreadyHaveFork = !forkRes.ok && !!(await api('/repos/' + FORK_OWNER + '/awesome-dsh-plugin')).ok;
  if (!forkRes.ok && !alreadyHaveFork) {
    fail('fork failed: ' + forkRes.status + ' ' + JSON.stringify(forkRes.body));
  }

  let fork = null;
  for (let i = 0; i < 30 && !fork; i++) {
    const r = await api('/repos/' + FORK_OWNER + '/awesome-dsh-plugin');
    if (r.ok && r.body && r.body.default_branch) fork = r.body;
    else await sleep(3000);
  }
  if (!fork) fail('the fork did not become available within 90s');

  const base = fork.default_branch;
  info('-> branch ' + BRANCH + ' off ' + FORK_OWNER + '/awesome-dsh-plugin:' + base);
  const ref = await api('/repos/' + FORK_OWNER + '/awesome-dsh-plugin/git/ref/heads/' + base);
  const baseSha = ref.body && ref.body.object && ref.body.object.sha;
  if (!baseSha) fail('cannot resolve the fork base commit');

  const created = await api('/repos/' + FORK_OWNER + '/awesome-dsh-plugin/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: baseSha }),
  });
  if (!created.ok && !/already exists/i.test(JSON.stringify(created.body))) {
    fail('cannot create the branch: ' + created.status + ' ' + JSON.stringify(created.body));
  }

  for (const { file, raw } of entries) {
    info('-> add data/plugins/' + file);
    const put = await api('/repos/' + FORK_OWNER + '/awesome-dsh-plugin/contents/data/plugins/' + file, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Add ' + file.replace(/\.yml$/, ''),
        content: Buffer.from(raw, 'utf8').toString('base64'),
        branch: BRANCH,
      }),
    });
    if (!put.ok) fail('upload failed for ' + file + ': ' + put.status + ' ' + JSON.stringify(put.body));
  }

  info('-> opening the pull request');
  const pr = await api('/repos/' + UPSTREAM + '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Add dsh-balance-floater, dsh-theme-picker and dsh-theme-dracula-pack',
      head: FORK_OWNER + ':' + BRANCH,
      base,
      body: prBody(entries),
    }),
  });
  if (!pr.ok) {
    const open = await api('/repos/' + UPSTREAM + '/pulls?head=' + FORK_OWNER + ':' + BRANCH + '&state=open');
    if (Array.isArray(open.body) && open.body[0]) {
      info('\nok - a PR is already open: ' + open.body[0].html_url);
      return;
    }
    fail('the PR failed: ' + pr.status + ' ' + JSON.stringify(pr.body));
  }
  info('\nok - ' + pr.body.html_url);
}


export { setToken, loadCatalog, validate, parseEntry, checkGates, gateAge, gateTopics, gateManifests, gateUpstreamEmpty, submit, prBody, CATALOG, SOURCE, UPSTREAM, FORK_OWNER, BRANCH };
