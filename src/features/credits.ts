export interface Person { real_name?: string; display_name?: string; sync_github_name?: boolean }

// Reads the few fields people.toml uses; everything else in the file is ignored.
export const parsePeople = (src: string): Record<string, Person> => {
  const out: Record<string, Person> = {};
  let cur: Person | null = null;
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const head = /^\[people\.([A-Za-z0-9-]+)\]$/.exec(line);
    if (head) { cur = out[head[1]!] = {}; continue; }
    const kv = /^(real_name|display_name|sync_github_name)\s*=\s*(.+)$/.exec(line);
    if (!kv || !cur) continue;
    const v = kv[2]!.trim();
    if (kv[1] === 'sync_github_name') cur.sync_github_name = v === 'true';
    else { const s = /^"((?:[^"\\]|\\.)*)"$/.exec(v)?.[1]?.replace(/\\(.)/g, '$1') ?? ''; if (s) cur[kv[1] as 'real_name' | 'display_name'] = s; }
  }
  return out;
};

