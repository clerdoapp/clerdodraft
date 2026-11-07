// Counts each contributor's work from the git history into contributors/contributors.json, which the
// About window shows. Usernames come from GitHub when a token is available (GITHUB_TOKEN or GH_TOKEN),
// otherwise from GitHub's private commit addresses; git author names and addresses are never stored.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY ?? 'clerdoapp/clerdodraft';
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const out = 'contributors/contributors.json';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 });

let log;
try {
  log = git('log', '--no-renames', '--format=%x01%H%x02%ae%x02%aI%x02%P%x02%B%x03', '--numstat', 'HEAD');
} catch {
  console.log('No git history here; keeping', out);
  process.exit(0);
}

const commits = log.split('\x01').filter(Boolean).map((chunk) => {
  const [head, stats = ''] = chunk.split('\x03');
  const [sha, email, date, parents, body] = head.split('\x02');
  let added = 0, deleted = 0, binAdded = 0, binDeleted = 0;
  for (const line of stats.trim().split('\n').filter(Boolean)) {
    const [a, d] = line.split('\t');
    if (a === '-' && d === '-') { binAdded += 1; continue; }
    added += Number(a) || 0; deleted += Number(d) || 0;
  }
  return { sha, email, date, merge: parents.trim().split(' ').length > 1, body, added, deleted, binAdded, binDeleted };
});

// Binary files removed show as "-" too; tell them apart by whether the file still exists afterwards.
for (const c of commits) {
  if (!c.binAdded) continue;
  try {
    const gone = git('diff-tree', '--no-commit-id', '-r', '--diff-filter=D', '--name-only', c.sha).trim().split('\n').filter(Boolean);
    const binGone = gone.filter((f) => { try { return git('show', `${c.sha}^:${f}`, '--', '').includes('\0'); } catch { return false; } }).length;
    c.binDeleted = Math.min(binGone, c.binAdded); c.binAdded -= c.binDeleted;
  } catch { /* first commit */ }
}

const logins = new Map();
if (token) {
  for (let page = 1; page < 200; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100&page=${page}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
    if (!r.ok) break;
    const list = await r.json();
    for (const c of list) if (c.author?.login) logins.set(c.sha, c.author.login);
    if (list.length < 100) break;
  }
}
const loginOf = (c) => logins.get(c.sha) ?? /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/.exec(c.email)?.[1] ?? null;

const people = new Set([...readFileSync('contributors/people.toml', 'utf8').matchAll(/^\[people\.([A-Za-z0-9-]+)\]/gm)].map((m) => m[1]));
const byLogin = new Map();
let unattributed = 0;
for (const c of commits) {
  const login = loginOf(c);
  if (!login) { unattributed++; continue; }
  const e = byLogin.get(login) ?? { login, people_entry: people.has(login), github_name: null, prs: 0, commits: 0, lines_added: 0, lines_deleted: 0, binary_added: 0, binary_deleted: 0, first_commit: c.date, last_commit: c.date };
  if (c.merge || /\(#\d+\)\s*$/m.test(c.body.split('\n')[0])) e.prs++;
  if (!c.merge) { e.commits++; e.lines_added += c.added; e.lines_deleted += c.deleted; e.binary_added += c.binAdded; e.binary_deleted += c.binDeleted; }
  if (c.date < e.first_commit) e.first_commit = c.date;
  if (c.date > e.last_commit) e.last_commit = c.date;
  byLogin.set(login, e);
}

// Public profile names, only for people who asked for them in people.toml.
const sync = new Set([...readFileSync('contributors/people.toml', 'utf8').matchAll(/^\[people\.([A-Za-z0-9-]+)\][^[]*?sync_github_name\s*=\s*true/gms)].map((m) => m[1]));
if (token) for (const login of sync) {
  const e = byLogin.get(login);
  if (!e) continue;
  const r = await fetch(`https://api.github.com/users/${login}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.ok) e.github_name = (await r.json()).name ?? null;
}

// AI models credited in Co-Authored-By trailers.
const models = new Map();
for (const c of commits) for (const m of c.body.matchAll(/^Co-Authored-By:\s*(.+?)\s*<([^>]*)>\s*$/gim)) {
  const name = m[1]; const mail = m[2].toLowerCase();
  const company = mail.endsWith('@anthropic.com') ? 'Anthropic' : mail.endsWith('@openai.com') ? 'OpenAI' : mail.endsWith('@google.com') ? 'Google' : null;
  if (!company) continue;
  const v = /^(.*?)\s+(\d+(?:\.\d+)*)$/.exec(name);
  const model = v ? v[1] : name; const version = v ? v[2] : '';
  const id = `${company.toLowerCase()}/${model.toLowerCase().replace(/\s+/g, '-')}/${version}`;
  const e = models.get(id) ?? { id, company, model, version, commits: 0, first_commit: c.date, last_commit: c.date };
  e.commits++;
  if (c.date < e.first_commit) e.first_commit = c.date;
  if (c.date > e.last_commit) e.last_commit = c.date;
  models.set(id, e);
}

const data = {
  schema: 1,
  repo,
  head_date: commits[0]?.date ?? null,
  commits: commits.filter((c) => !c.merge).length,
  unattributed_commits: unattributed,
  contributors: [...byLogin.values()].sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login)),
  models: [...models.values()].sort((a, b) => b.commits - a.commits),
};
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`${out}: ${data.contributors.length} contributors, ${data.models.length} models, ${data.commits} commits`);
