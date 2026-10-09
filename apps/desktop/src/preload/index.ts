import { contextBridge, ipcRenderer } from 'electron';
import {
  AUTH_CHANGE_PASSWORD_CHANNEL,
  AUTH_LOGIN_CHANNEL,
  AUTH_LOGOUT_CHANNEL,
  AUTH_SESSION_CHANNEL,
  REFERENCE_DATA_CHANNEL,
  SUBSCRIBERS_CREATE_CHANNEL,
  SUBSCRIBERS_GET_CHANNEL,
  SUBSCRIBERS_LIST_CHANNEL,
  type DesktopBridge,
} from '@bcis/shared';

// No ipcRenderer, generic channel, URL, or arbitrary arguments cross this boundary.
const bridge: DesktopBridge = Object.freeze({
  getConnection: () => ipcRenderer.invoke('bcis:connection:get'),
  getSession: () => ipcRenderer.invoke(AUTH_SESSION_CHANNEL),
  login: (input: Parameters<DesktopBridge['login']>[0]) => ipcRenderer.invoke(AUTH_LOGIN_CHANNEL, input),
  changePassword: (input: Parameters<DesktopBridge['changePassword']>[0]) => ipcRenderer.invoke(AUTH_CHANGE_PASSWORD_CHANNEL, input),
  logout: () => ipcRenderer.invoke(AUTH_LOGOUT_CHANNEL),
  listSubscribers: (query: Parameters<DesktopBridge['listSubscribers']>[0]) => ipcRenderer.invoke(SUBSCRIBERS_LIST_CHANNEL, query),
  getSubscriber: (id: string) => ipcRenderer.invoke(SUBSCRIBERS_GET_CHANNEL, id),
  createSubscriber: (input: Parameters<DesktopBridge['createSubscriber']>[0]) => ipcRenderer.invoke(SUBSCRIBERS_CREATE_CHANNEL, input),
  getReferenceData: () => ipcRenderer.invoke(REFERENCE_DATA_CHANNEL),
});
contextBridge.exposeInMainWorld('bcis', bridge);
