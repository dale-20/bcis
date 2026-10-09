import type { DesktopBridge } from '@bcis/shared';

declare global { interface Window { bcis?: DesktopBridge } }
