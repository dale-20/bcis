export function isTrustedFrame(senderUrl: string, rendererUrl: string, isMainFrame: boolean): boolean {
  return isMainFrame && senderUrl === rendererUrl;
}
