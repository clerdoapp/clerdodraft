import type { KeyboardEvent } from 'react';
import type { EditorStore } from './store';

export interface Command {
  id: string;
  label: string;
  group?: string;
  keys?: string; // e.g. "mod+b", "mod+shift+l", "f7"
  run: (store: EditorStore) => void;
  active?: (store: EditorStore) => boolean;
  enabled?: (store: EditorStore) => boolean;
}

const registry = new Map<string, Command>();

export const register = (...cmds: Command[]): void => {
  for (const c of cmds) registry.set(c.id, c);
};

export const command = (id: string): Command | undefined => registry.get(id);

export const allCommands = (): Command[] => [...registry.values()];

export const run = (store: EditorStore, id: string): void => {
  const c = registry.get(id);
  if (c && (c.enabled?.(store) ?? true)) c.run(store);
};

const keyName = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let k = e.key.toLowerCase();
  if (e.code.startsWith('Digit')) k = e.code.slice(5);
  else if (e.code.startsWith('Key')) k = e.code.slice(3).toLowerCase();
  parts.push(k);
  return parts.join('+');
};

export const runCommandForKey = (store: EditorStore, e: KeyboardEvent): boolean => {
  const name = keyName(e);
  for (const c of registry.values()) {
    if (c.keys && c.keys.split(' ').includes(name)) {
      if (c.enabled?.(store) ?? true) c.run(store);
      return true;
    }
  }
  return false;
};

export const prettyKeys = (keys?: string): string => {
  if (!keys) return '';
  const mac = typeof navigator !== 'undefined' && /Mac|iPad/.test(navigator.platform);
  return keys.split(' ')[0]!.split('+').map((k) => (k === 'mod' ? (mac ? '⌘' : 'Ctrl') : k === 'shift' ? (mac ? '⇧' : 'Shift') : k === 'alt' ? (mac ? '⌥' : 'Alt') : k.toUpperCase())).join(mac ? '' : '+');
};
