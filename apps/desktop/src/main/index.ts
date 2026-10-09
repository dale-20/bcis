import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  apiUrlSchema,
  AUTH_CHANGE_PASSWORD_CHANNEL,
  AUTH_LOGIN_CHANNEL,
  AUTH_LOGOUT_CHANNEL,
  AUTH_SESSION_CHANNEL,
  desktopRequestSchemas,
  HEALTH_CHANNEL,
  REFERENCE_DATA_CHANNEL,
  SUBSCRIBERS_CREATE_CHANNEL,
  SUBSCRIBERS_GET_CHANNEL,
  SUBSCRIBERS_LIST_CHANNEL,
} from '@bcis/shared';
import { checkConnection } from './connection.js';
import { isTrustedFrame } from './security.js';
import { DesktopApiClient } from './api.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
// Runtime override supports three installed clients without rebuilding the renderer.
const endpoint = apiUrlSchema.parse(process.env.BCIS_API_URL ?? import.meta.env.MAIN_VITE_API_URL ?? 'http://127.0.0.1:3001');
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(directory, '../renderer/index.html')).href;
let window: BrowserWindow | null = null;
const api = new DesktopApiClient(endpoint);

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const trusted = window && event.sender === window.webContents && event.senderFrame
    && isTrustedFrame(event.senderFrame.url, rendererUrl, event.senderFrame === window.webContents.mainFrame);
  if (!trusted) throw new Error('Unauthorized IPC sender');
}

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
    assertTrustedSender(event);
    return checkConnection(endpoint);
  });
  ipcMain.handle(AUTH_SESSION_CHANNEL, (event) => { assertTrustedSender(event); return api.session(); });
  ipcMain.handle(AUTH_LOGIN_CHANNEL, (event, input: unknown) => { assertTrustedSender(event); return api.login(desktopRequestSchemas.login.parse(input)); });
  ipcMain.handle(AUTH_CHANGE_PASSWORD_CHANNEL, (event, input: unknown) => { assertTrustedSender(event); return api.changePassword(desktopRequestSchemas.changePassword.parse(input)); });
  ipcMain.handle(AUTH_LOGOUT_CHANNEL, (event) => { assertTrustedSender(event); return api.logout(); });
  ipcMain.handle(SUBSCRIBERS_LIST_CHANNEL, (event, input: unknown) => { assertTrustedSender(event); return api.listSubscribers(desktopRequestSchemas.subscriberList.parse(input)); });
  ipcMain.handle(SUBSCRIBERS_GET_CHANNEL, (event, input: unknown) => { assertTrustedSender(event); return api.getSubscriber(desktopRequestSchemas.subscriberId.parse(input)); });
  ipcMain.handle(SUBSCRIBERS_CREATE_CHANNEL, (event, input: unknown) => { assertTrustedSender(event); return api.createSubscriber(desktopRequestSchemas.subscriberCreate.parse(input)); });
  ipcMain.handle(REFERENCE_DATA_CHANNEL, (event) => { assertTrustedSender(event); return api.getReferenceData(); });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
