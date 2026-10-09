import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { apiUrlSchema, HEALTH_CHANNEL } from '@bcis/shared';
import { checkConnection } from './connection.js';
import { isTrustedFrame } from './security.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
// Runtime override supports three installed clients without rebuilding the renderer.
const endpoint = apiUrlSchema.parse(process.env.BCIS_API_URL ?? import.meta.env.MAIN_VITE_API_URL ?? 'http://127.0.0.1:3001');
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(directory, '../renderer/index.html')).href;
let window: BrowserWindow | null = null;

function createWindow() {
  window = new BrowserWindow({
    title: 'BCIS · Subscription Billing & Collection', width: 1200, height: 800,
    minWidth: 960, minHeight: 640, show: false, backgroundColor: '#F6F8FB', autoHideMenuBar: true,
    webPreferences: {
      preload: join(directory, '../preload/index.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  void window.loadURL(rendererUrl);
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle(HEALTH_CHANNEL, async (event) => {
    const trusted = window && event.sender === window.webContents && event.senderFrame
      && isTrustedFrame(event.senderFrame.url, rendererUrl, event.senderFrame === window.webContents.mainFrame);
    if (!trusted) throw new Error('Unauthorized IPC sender');
    return checkConnection(endpoint);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
