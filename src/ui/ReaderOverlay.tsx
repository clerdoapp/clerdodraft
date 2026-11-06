import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { paraText, walkParagraphs } from '../core/tree';
import { headingLevel } from '../core/styles';
import type { EditorStore } from '../editor/store';

type Paper = 'light' | 'sepia' | 'dark';

export const ReaderOverlay = ({ store }: { store: EditorStore }) => {
  const paras = useMemo(() => [...walkParagraphs(store.doc.blocks)].map((p) => ({ id: p.id, text: paraText(p), level: headingLevel(store.doc, p) })).filter((p) => p.text.trim()), [store.doc]);
  const [size, setSize] = useState(22);
  const [leading, setLeading] = useState(1.8);
  const [spacing, setSpacing] = useState(0);
  const [paper, setPaper] = useState<Paper>('light');
  const [focusLines, setFocusLines] = useState(0);
  const [lit, setLit] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const close = () => { speechSynthesis.cancel(); store.setView({ reader: false }); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') { e.preventDefault(); setLit((l) => Math.min(l + 1, paras.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setLit((l) => Math.max(l - 1, 0)); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); speechSynthesis.cancel(); };
  });

  useEffect(() => { body.current?.children[lit]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [lit]);

  const speak = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    setSpeaking(true);
    const next = (i: number) => {
      const p = paras[i];
      if (!p) { setSpeaking(false); return; }
      setLit(i);
      const u = new SpeechSynthesisUtterance(p.text);
      u.onend = () => next(i + 1);
      u.onerror = () => setSpeaking(false);
      speechSynthesis.speak(u);
    };
    next(lit);
  };

  return (
    <div className={`reader ${paper}`} role="dialog" aria-label="Focus reader">
      <header>
        <label>Size<input type="range" min={14} max={44} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
        <label>Lines<input type="range" min={1.3} max={3} step={0.1} value={leading} onChange={(e) => setLeading(+e.target.value)} /></label>
        <label>Letters<input type="range" min={0} max={4} step={0.5} value={spacing} onChange={(e) => setSpacing(+e.target.value)} /></label>
        <div className="seg">{(['light', 'sepia', 'dark'] as Paper[]).map((p) => <button key={p} className={paper === p ? 'on' : ''} onClick={() => setPaper(p)}>{p[0]!.toUpperCase() + p.slice(1)}</button>)}</div>
        <div className="seg">{[['All', 0], ['Focus', 1]].map(([l, n]) => <button key={l} className={focusLines === n ? 'on' : ''} onClick={() => setFocusLines(n as number)}>{l}</button>)}</div>
        <button className="tool" onClick={speak}>{speaking ? 'Stop' : 'Read aloud'}</button>
        <button className="ico" aria-label="Close" onClick={close}><X size={18} strokeWidth={1.9} /></button>
      </header>
      <div className="readbody" ref={body} style={{ fontSize: size, lineHeight: leading, letterSpacing: spacing }}>
        {paras.map((p, i) => {
          const Tag = p.level ? 'h2' : 'p';
          return <Tag key={p.id} dir="auto" className={focusLines && i !== lit ? 'dim' : ''} onClick={() => setLit(i)}>{p.text}</Tag>;
        })}
      </div>
    </div>
  );
};
