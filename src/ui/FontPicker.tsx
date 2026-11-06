import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { ALL_FONTS, cssFamily, lookalikeOf } from '../core/fonts';
import { walkParagraphs } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { canAskForFonts, computerFonts, loadComputerFonts } from '../features/systemFonts';

const CATS: [string, string][] = [['', 'All'], ['sans-serif', 'Sans'], ['serif', 'Serif'], ['monospace', 'Fixed width'], ['handwriting', 'Handwriting'], ['display', 'Display']];

const usedFonts = (store: EditorStore): string[] => {
  const out = new Set<string>();
  for (const p of walkParagraphs(store.doc.blocks)) for (const r of p.runs) if (r.props.font) out.add(r.props.font);
  if (store.doc.styles.docDefaults.run.font) out.add(store.doc.styles.docDefaults.run.font);
  return [...out].sort();
};

export const FontPicker = ({ store, value, onPick, label = 'Font' }: { store: EditorStore; value?: string; onPick: (font: string) => void; label?: string }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [place, setPlace] = useState<CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', away, true);
    return () => window.removeEventListener('mousedown', away, true);
  }, [open]);
  const mine = computerFonts();
  const sections = useMemo(() => {
    const match = (n: string) => n.toLowerCase().includes(q.toLowerCase());
    const all = ALL_FONTS.filter((f) => match(f.name) && (!cat || f.category === cat));
    const known = new Set(ALL_FONTS.map((f) => f.name.toLowerCase()));
    return [
      ['In this document', cat ? [] : usedFonts(store).filter(match)],
      ['On this computer', cat ? [] : mine.filter((n) => match(n) && !known.has(n.toLowerCase()))],
      ['All fonts', all.map((f) => f.name)],
    ] as [string, string[]][];
  }, [q, cat, open, mine.length, store.doc]); // eslint-disable-line
  const pick = (f: string) => { setOpen(false); setQ(''); onPick(f); };
  return (
    <div className="fontpick" ref={box}>
      <button type="button" className="fontbtn" aria-label={label} aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => {
        const r = box.current!.getBoundingClientRect();
        const below = innerHeight - r.bottom - 12;
        setPlace(below > 320 ? { top: r.bottom + 4, left: Math.min(r.left, innerWidth - 292), maxHeight: below } : { bottom: innerHeight - r.top + 4, left: Math.min(r.left, innerWidth - 292), maxHeight: r.top - 12 });
        setOpen(!open);
      }}>
        <span style={{ fontFamily: value ? cssFamily(value) : undefined }}>{value || label}</span><ChevronDown size={14} />
      </button>
      {open && createPortal(
        <div className="fontmenu" role="listbox" ref={menu} style={place}>
          <input autoFocus placeholder="Search fonts" aria-label="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) pick(sections.flatMap((s) => s[1])[0] ?? q.trim()); if (e.key === 'Escape') setOpen(false); }} />
          <div className="fontcats">{CATS.map(([k, l]) => <button key={k} type="button" className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{l}</button>)}</div>
          <div className="fontlist">
            {sections.map(([title, names]) => !!names.length && (
              <section key={title}>
                <h4>{title}</h4>
                {names.map((n) => (
                  <button key={`${title}:${n}`} type="button" role="option" aria-selected={n === value} className={n === value ? 'on' : ''} onClick={() => pick(n)} title={lookalikeOf(n) ? `Shown with ${lookalikeOf(n)} on this device` : n}>
                    <span style={{ fontFamily: cssFamily(n) }}>{n}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
          {canAskForFonts() && !mine.length && <button type="button" className="tool" onClick={() => void loadComputerFonts(store, true)}>Show fonts on this computer</button>}
        </div>, document.body,
      )}
    </div>
  );
};
