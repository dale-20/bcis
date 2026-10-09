import { apiUrlSchema, readinessSchema, type ConnectionResult } from '@bcis/shared';

export async function checkConnection(endpoint: string): Promise<ConnectionResult> {
  const origin = apiUrlSchema.parse(endpoint);
  try {
    const response = await fetch(new URL('/health/ready', origin), {
      signal: AbortSignal.timeout(4000), redirect: 'error', headers: { Accept: 'application/json' },
    });
    if (![200, 503].includes(response.status)) return { ok: false, endpoint: origin, reason: 'invalid_response' };
    const result = readinessSchema.safeParse(await response.json());
    if (!result.success || (response.status === 200) !== (result.data.status === 'ready')) {
      return { ok: false, endpoint: origin, reason: 'invalid_response' };
    }
    return { ok: true, endpoint: origin, health: result.data };
  } catch {
    return { ok: false, endpoint: origin, reason: 'unreachable' };
  }
}
