import { newId, para, type HeaderFooterRefs, type StoryId } from '../core/model';
import type { Page } from '../layout/types';
import type { EditorStore } from '../editor/store';

// Opens the header or footer of a page, creating one on first use.
export const enterHeaderFooter = (store: EditorStore, page: Page, kind: 'header' | 'footer'): void => {
  const existing = kind === 'header' ? page.header : page.footer;
  if (existing) {
    store.enterStory(existing.story);
    return;
  }
  const id = newId();
  const style = kind === 'header' ? 'Header' : 'Footer';
  const doc = store.doc;
  const refs: HeaderFooterRefs = { ...(kind === 'header' ? doc.section.headers : doc.section.footers), default: id };
  const section = kind === 'header' ? { ...doc.section, headers: refs } : { ...doc.section, footers: refs };
  const blocks = [para([], { style })];
  const next = kind === 'header' ? { ...doc, section, headers: { ...doc.headers, [id]: blocks } } : { ...doc, section, footers: { ...doc.footers, [id]: blocks } };
  const story = `${kind === 'header' ? 'hdr' : 'ftr'}:${id}` as StoryId;
  store.commit(next);
  store.enterStory(story);
};
