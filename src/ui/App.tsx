import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { CanvasMeasurer } from '../layout/measure';
import { EditorStore } from '../editor/store';
import { Canvas } from './Canvas';
import { TopBar } from './TopBar';
import { Rail } from './Rail';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { DialogHost } from './DialogHost';
import { registerCoreCommands } from '../features/coreCommands';
import { registerInsertCommands, registerShapes } from '../features/insert';
import { registerCharts } from '../features/charts';
import { registerMailReview } from '../features/mailReview';
import { registerTemplates } from '../features/templates';
import { Proofer } from '../features/proof';
import { registerProof } from '../features/proofCommands';
import { registerAutoType } from '../features/autoType';
import { ContextMenu } from './ContextMenu';
import { Ruler } from './Ruler';
import { registerReferences } from '../features/references';
import { restoreDraft, startAutosave } from '../features/files';

const coarseScreen = matchMedia('(pointer: coarse)').matches;

export const App = () => {
  const store = useMemo(() => {
    registerCoreCommands();
    registerInsertCommands();
    registerShapes();
    registerCharts();
    registerMailReview();
    registerTemplates();
    registerProof();
    registerReferences();
    const s = new EditorStore(new CanvasMeasurer());
    s.proof = new Proofer(s);
    registerAutoType(s);
    return s;
  }, []);
  useSyncExternalStore(store.subscribe, store.getVersion);

  useEffect(() => {
    void Promise.all(['Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'Noto Naskh Arabic'].flatMap((f) => [`12px "${f}"`, `700 12px "${f}"`, `italic 12px "${f}"`].map((c) => document.fonts.load(c, 'Aa\u0645').catch(() => [])))).then(() => store.remeasure());
    const onFont = () => store.remeasure();
    document.fonts.addEventListener?.('loadingdone', onFont);
    (window as unknown as { __store: EditorStore }).__store = store;
    const canvas = document.querySelector('.canvas');
    const page = store.layout.pages[0];
    if (canvas && page && matchMedia('(pointer: coarse)').matches) {
      const fit = (canvas.clientWidth - 32) / (page.width * (4 / 3));
      if (fit < 1) store.setView({ zoom: Math.max(0.25, +fit.toFixed(2)) });
    }
    void restoreDraft(store);
    const stop = startAutosave(store);
    return () => { document.fonts.removeEventListener?.('loadingdone', onFont); stop(); };
  }, [store]);

  useEffect(() => {
    const t = store.view.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [store.view.theme, store]);

  const reading = store.view.focus;
  return (
    <div className={`app${reading ? ' focus' : ''}`}>
      {!reading && <TopBar store={store} />}
      <div className="work">
        {!reading && <Rail store={store} />}
        <main className="stage">{store.view.showRuler && store.view.mode === 'print' && !coarseScreen && <Ruler store={store} />}<Canvas store={store} /></main>
        {!reading && <Inspector store={store} />}
      </div>
      <StatusBar store={store} />
      <DialogHost store={store} />
      {store.menu && <ContextMenu store={store} />}
      {store.toast && <div className="toast" role="status">{store.toast}</div>}
    </div>
  );
};
