const electron  = require('electron');
const { BrowserWindow, ipcMain, dialog, shell } = electron;
const app = electron.app;
const path = require('path');
const fs   = require('fs');

// Keep a reference to prevent GC
let mainWindow = null;

const isDev = process.env.ELECTRON_DEV === '1';

function getResourcePath(...segments) {
  return path.join(__dirname, ...segments);
}

// ─── Database + IPC setup ─────────────────────────────────────────────────────
async function setupApp() {
  const { initDatabase } = require('./src/database');
  const { setupIPC }     = require('./src/ipc');
  await initDatabase();
  setupIPC(ipcMain);
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  await setupApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('win:minimize',  () => mainWindow?.minimize());
ipcMain.on('win:maximize',  () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win:close',     () => mainWindow?.close());

ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));

ipcMain.handle('dialog:saveFile', async (_e, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, opts);
  return result.canceled ? null : result.filePath;
});

module.exports = { getMainWindow: () => mainWindow, getResourcePath };
