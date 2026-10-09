import { connectionResultSchema } from '@bcis/shared';

export async function getConnection() {
  if (!window.bcis) throw new Error('Desktop bridge unavailable. Launch the Electron application.');
  return connectionResultSchema.parse(await window.bcis.getConnection());
}
