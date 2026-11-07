import { useMemo, useState } from 'react';
import type { EditorStore } from '../editor/store';
import credits from '../../contributors/contributors.json';
import peopleToml from '../../contributors/people.toml?raw';
import icon from '../../assets/app-icon/clerdodraft-1024.png';
import { parsePeople } from '../features/credits';

interface Contributor { login: string; github_name: string | null; prs: number; commits: number; lines_added: number; lines_deleted: number; binary_added: number; binary_deleted: number; first_commit: string; last_commit: string }
interface Model { id: string; company: string; model: string; version: string; commits: number }
type Sort = 'name' | 'commits' | 'prs' | 'added' | 'deleted' | 'delta' | 'first' | 'last';
type NameMode = 'username' | 'display' | 'real';
declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const REPO = import.meta.env.VITE_RELEASE_REPO ?? 'clerdoapp/clerdodraft';
const n = (v: number) => v.toLocaleString();

export const AboutDialog = ({ store }: { store: EditorStore }) => {
  const [tab, setTab] = useState<'about' | 'people' | 'models'>('about');
  const [sort, setSort] = useState<Sort>('commits');
  const [mode, setMode] = useState<NameMode>('username');
  const [table, setTable] = useState(false);
  const people = useMemo(() => parsePeople(peopleToml), []);
  const list = credits.contributors as Contributor[];
  const models = credits.models as Model[];
  const nameOf = (c: Contributor): string => {
    const p = people[c.login];
    if (mode === 'real' && p?.real_name) return p.real_name;
    if (mode !== 'username') { const d = p?.display_name || (p?.sync_github_name ? c.github_name : null); if (d) return d; }
    return `@${c.login}`;
  };
  const sorted = useMemo(() => {
    const key: Record<Sort, (c: Contributor) => number | string> = {
      name: (c) => nameOf(c).replace(/^@/, '').toLowerCase(), commits: (c) => -c.commits, prs: (c) => -c.prs, added: (c) => -c.lines_added,
      deleted: (c) => -c.lines_deleted, delta: (c) => -(c.lines_added - c.lines_deleted), first: (c) => c.first_commit, last: (c) => c.last_commit,
    };
    return [...list].sort((a, b) => { const x = key[sort](a); const y = key[sort](b); return x < y ? -1 : x > y ? 1 : 0; });
  }, [list, sort, mode]); // eslint-disable-line
  const cycle = () => setMode((m) => (m === 'username' ? 'display' : m === 'display' ? 'real' : 'username'));
  return (
    <div className="aboutbox">
      <div className="abouthead">
        <img src={icon} alt="" width={64} height={64} />
        <div><h2>ClerdoDraft</h2><p className="muted">{VERSION ? `Version ${VERSION}` : 'Development build'}</p></div>
      </div>
      <div className="seg" role="tablist">
        {(['about', 'people', 'models'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'about' ? 'About' : t === 'people' ? 'Contributors' : 'Models'}</button>)}
      </div>
      {tab === 'about' && (
        <div className="aboutbody">
          <p>A free, open-source word processor by Clerdo.</p>
          <p className="muted">Licensed under the MIT License or the Apache License 2.0, at your option. Third-party material and its licences are listed in the NOTICE file.</p>
          <p className="links">
            <a href="https://clerdo.app" target="_blank" rel="noreferrer">Website</a>
            <a href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">Source code</a>
            <a href={`https://github.com/${REPO}/issues`} target="_blank" rel="noreferrer">Report a problem</a>
            <a href={`https://github.com/${REPO}/releases`} target="_blank" rel="noreferrer">Releases</a>
          </p>
        </div>
      )}
      {tab === 'people' && (
        <div className="aboutbody">
          <div className="row">
            <label className="field inline"><span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="commits">Commits</option><option value="prs">Pull requests</option><option value="name">Name</option>
                <option value="added">Lines added</option><option value="deleted">Lines removed</option><option value="delta">Lines added minus removed</option>
                <option value="first">First contribution</option><option value="last">Latest contribution</option>
              </select>
            </label>
            <button className="tool" onClick={cycle}>{mode === 'username' ? 'Usernames' : mode === 'display' ? 'Display names' : 'Real names'}</button>
            <button className="tool" onClick={() => setTable(!table)}>{table ? 'Show as names' : 'Show as table'}</button>
          </div>
          {!sorted.length && <p className="muted">No contributors yet.</p>}
          {table ? (
            <div className="credittable">
              <table>
                <thead><tr><th>Name</th><th>Pull requests</th><th>Commits</th><th>Lines added</th><th>Lines removed</th><th>Files added</th><th>First</th><th>Latest</th></tr></thead>
                <tbody>{sorted.map((c) => <tr key={c.login}><td><a href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">{nameOf(c)}</a></td><td>{n(c.prs)}</td><td>{n(c.commits)}</td><td>{n(c.lines_added)}</td><td>{n(c.lines_deleted)}</td><td>{n(c.binary_added)}</td><td>{c.first_commit.slice(0, 10)}</td><td>{c.last_commit.slice(0, 10)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="grabbag">{sorted.map((c, i) => <span key={c.login}>{i ? ' · ' : ''}<a href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">{nameOf(c)}</a></span>)}</p>}
          <p className="muted">Add your own name in contributors/people.toml. Usernames are credited automatically.</p>
        </div>
      )}
      {tab === 'models' && (
        <div className="aboutbody">
          <p className="muted">AI models credited as co-authors in commits.</p>
          {models.length ? <ul className="modellist">{models.map((m) => <li key={m.id}><strong>{m.model}{m.version ? ` ${m.version}` : ''}</strong> <span className="muted">{m.company} · {n(m.commits)} commits</span></li>)}</ul> : <p className="muted">None yet.</p>}
        </div>
      )}
      <footer><button className="tool" onClick={() => store.closeDialog()}>Close</button></footer>
    </div>
  );
};
