import { describe, expect, it } from 'vitest';
import { electronViteEnvironment } from './run-electron-vite.mjs';

describe('desktop development launcher environment', () => {
  it('removes Electron Node mode inherited from IDE processes', () => {
    const source = { ELECTRON_RUN_AS_NODE: '1', BCIS_API_URL: 'http://127.0.0.1:3001' };

    const environment = electronViteEnvironment(source);

    expect(environment).toEqual({ BCIS_API_URL: 'http://127.0.0.1:3001' });
    expect(source.ELECTRON_RUN_AS_NODE).toBe('1');
  });
});
