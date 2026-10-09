import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@bcis/shared';

// No ipcRenderer, generic channel, URL, or arbitrary arguments cross this boundary.
const bridge: DesktopBridge = Object.freeze({
  getConnection: () => ipcRenderer.invoke('bcis:connection:get'),
});
contextBridge.exposeInMainWorld('bcis', bridge);
