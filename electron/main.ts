import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const MAX_FILE = 512 * 1024 * 1024;
const FILTERS = [{ name: 'Documents', extensions: ['docx'] }];
// Only paths the person picked in a dialog this session can be written.
const allowed = new Set<string>();

const createWindow = (): void => {
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
  void win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
};

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: FILTERS });
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
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
