export function isTrustedFrame(senderUrl: string, rendererUrl: string, isMainFrame: boolean): boolean {
  if (!isMainFrame) return false;
  try {
    const sender = new URL(senderUrl);
    const renderer = new URL(rendererUrl);
    return sender.protocol === renderer.protocol
      && sender.username === renderer.username
      && sender.password === renderer.password
      && sender.hostname === renderer.hostname
      && sender.port === renderer.port
      && sender.pathname === renderer.pathname
      && sender.search === renderer.search;
  } catch {
    return false;
  }
}
