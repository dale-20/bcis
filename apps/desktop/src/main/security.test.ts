import { describe, expect, it } from 'vitest';
import { isTrustedFrame } from './security.js';

describe('IPC sender policy', () => {
  const renderer = 'file:///C:/BCIS/out/renderer/index.html';
  it('allows only the exact main frame', () => { expect(isTrustedFrame(renderer, renderer, true)).toBe(true); });
  it('rejects subframes', () => { expect(isTrustedFrame(renderer, renderer, false)).toBe(false); });
  it.each(['https://attacker.example', 'file:///C:/other.html', `${renderer}?spoofed=1`])('rejects %s', (url) => {
    expect(isTrustedFrame(url, renderer, true)).toBe(false);
  });
});
