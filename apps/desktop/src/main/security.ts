export function isTrustedFrame(senderUrl: string, rendererUrl: string, isMainFrame: boolean): boolean {
  if (!isMainFrame) return false;
  try {
    return new URL(senderUrl).href === new URL(rendererUrl).href;
  } catch {
    return false;
  }
}
