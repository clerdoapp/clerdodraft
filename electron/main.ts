import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { installedFonts } from './fonts';

const MAX_FILE = 512 * 1024 * 1024;
const FILTERS = [{ name: 'Documents', extensions: ['docx'] }];
const OPEN_FILTERS = [{ name: 'Documents', extensions: ['docx', 'docm', 'dotx', 'doc', 'odt', 'rtf', 'pdf', 'txt', 'md', 'html', 'htm'] }];
// Only paths the person picked in a dialog, or opened from the system, can be written.
const allowed = new Set<string>();
const OPENABLE = new Set(OPEN_FILTERS[0]!.extensions.map((e) => `.${e}`));
// Files opened by double-clicking or dropping on the app icon, waiting for their window.
const launch = new Map<number, string>();
const queued: string[] = [];

const documentsIn = (argv: string[], cwd = process.cwd()): string[] =>
  argv.filter((a) => !a.startsWith('-')).map((a) => resolve(cwd, a)).filter((p) => OPENABLE.has(extname(p).toLowerCase()) && existsSync(p) && statSync(p).isFile());

const createWindow = (blank = false, file?: string): void => {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    title: 'ClerdoDraft',
    backgroundColor: '#eceef3',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // The page asks to stay open while changes are unsaved; the choice belongs to the person.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Keep editing', 'Close without saving'], defaultId: 0, cancelId: 0,
      message: 'This document has unsaved changes.',
    });
    if (choice === 1) e.preventDefault();
  });
  if (file) launch.set(win.webContents.id, file);
  void win.loadFile(join(__dirname, '..', 'dist', 'index.html'), blank || file ? { search: 'new=1' } : undefined);
};

const openDocuments = (paths: string[]): void => {
  for (const p of paths) createWindow(false, p);
  BrowserWindow.getAllWindows().at(-1)?.focus();
};

ipcMain.handle('file:launch', async (e) => {
  const path = launch.get(e.sender.id);
  launch.delete(e.sender.id);
  if (!path) return null;
  if ((await stat(path)).size > MAX_FILE) throw new Error('This document is too large to open.');
  allowed.add(path);
  return { path, name: basename(path), data: new Uint8Array(await readFile(path)) };
});

// One copy of the app runs at a time; opening more files adds windows to it.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv, cwd) => {
  const files = documentsIn(argv.slice(1), cwd);
  if (files.length) openDocuments(files);
  else BrowserWindow.getAllWindows()[0]?.focus();
});
// macOS hands files over through this event, also before the app is ready.
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (app.isReady()) openDocuments([path]); else queued.push(path);
});

ipcMain.on('window:new', () => createWindow(true));

ipcMain.handle('net:image', async (_e, url: unknown) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const type = r.headers.get('content-type')?.split(';')[0] ?? '';
    if (!r.ok || !/^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(type)) return null;
    const data = new Uint8Array(await r.arrayBuffer());
    return data.length > 64 * 1024 * 1024 ? null : { data, type };
  } catch { return null; }
});

let fontList: Promise<string[]> | null = null;
ipcMain.handle('fonts:list', () => (fontList ??= installedFonts().catch(() => [])));

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: OPEN_FILTERS });
  const path = r.filePaths[0];
  if (r.canceled || !path) return null;
  if ((await stat(path)).size > MAX_FILE) throw new Error('This document is too large to open.');
  allowed.add(path);
  return { path, name: basename(path), data: new Uint8Array(await readFile(path)) };
});

ipcMain.handle('file:save', async (_e, path: unknown, name: unknown, data: unknown) => {
  if (!(data instanceof Uint8Array)) throw new Error('Nothing to save.');
  let target = typeof path === 'string' && allowed.has(path) ? path : null;
  if (!target) {
    const r = await dialog.showSaveDialog({ defaultPath: typeof name === 'string' ? basename(name) : 'Document.docx', filters: FILTERS });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
    allowed.add(target);
  }
  await writeFile(target, data);
  return { path: target, name: basename(target) };
});

void app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((_req, reply) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((list) => reply(list[0] ? { video: list[0] } : {})).catch(() => reply({}));
  });
  const files = [...queued, ...documentsIn(process.argv.slice(app.isPackaged ? 1 : 2))];
  if (files.length) openDocuments(files); else createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
