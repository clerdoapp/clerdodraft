import { useState } from 'react';
import type { EditorStore } from '../editor/store';
import { LANGUAGES, setUiLang, uiLang } from './i18n';

// Language names stay in their own language, so anyone can find theirs.
export const LanguageDialog = ({ store }: { store: EditorStore }) => {
  const [cur, setCur] = useState(uiLang());
  const pick = async (code: string) => {
    setCur(code);
    await setUiLang(code);
    store.closeDialog();
  };
  return (
    <div className="langbox">
      <h2>Interface language</h2>
      <div className="langgrid" data-no-translate>
        {LANGUAGES.map((l) => (
          <button key={l.code} lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'} className={l.code === cur ? 'on' : ''} aria-pressed={l.code === cur} onClick={() => void pick(l.code)}>{l.name}</button>
        ))}
      </div>
      <p className="muted">The document itself isn't changed. Spelling follows the language of the text.</p>
    </div>
  );
};
