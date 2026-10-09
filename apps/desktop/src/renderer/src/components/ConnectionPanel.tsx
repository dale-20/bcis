import { CheckCircle2, CircleAlert, Database, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import type { ConnectionResult } from '@bcis/shared';
import { Button } from './ui/button';

interface Props {
  result: ConnectionResult | undefined;
  pending: boolean;
  refreshing: boolean;
  error: boolean;
  onRetry: () => void;
}

export function ConnectionPanel({ result, pending, refreshing, error, onRetry }: Props) {
  const apiConnected = !error && result?.ok === true;
  const ready = apiConnected && result.health.status === 'ready';
  const migrationRequired = apiConnected && result.health.database === 'migration_required';
  const title = pending ? 'Checking your connection' : ready ? 'Connected to BCIS' : apiConnected ? 'Database needs attention' : 'Unable to reach BCIS';
  const detail = pending ? 'Contacting the office server and checking database readiness.'
    : ready ? 'The office server and database are ready. This workstation can reach the BCIS environment.'
    : migrationRequired ? 'The API is reachable, but database setup is incomplete. Ask your administrator to apply migrations.'
    : apiConnected ? 'The API is reachable, but PostgreSQL is unavailable. Ask your administrator to check the database service.'
    : error ? 'The desktop connection check failed. Restart the application, then try again.'
    : result?.ok === false && result.reason === 'invalid_response' ? 'The server returned an unexpected response. Check the configured BCIS server address.'
    : 'Check the office server, your network connection, and the configured API address. Then check again.';

  return <section className="connection-panel" aria-labelledby="connection-title">
    <div className="connection-summary" role="status" aria-live="polite">
      <div className={`connection-icon ${pending ? 'is-pending' : ready ? 'is-ready' : 'is-error'}`}>
        {ready ? <CheckCircle2 aria-hidden="true" /> : pending ? <Server aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      </div>
      <div><h2 id="connection-title">{title}</h2><p>{detail}</p></div>
    </div>
    <dl className="connection-details">
      <div><dt><Server aria-hidden="true" /> API server</dt><dd><span className={`status-label ${apiConnected ? 'text-success' : ''}`}>{pending ? 'Checking…' : apiConnected ? 'Reachable' : 'Not connected'}</span><span className="endpoint">{result?.endpoint ?? 'Awaiting connection check'}</span></dd></div>
      <div><dt><Database aria-hidden="true" /> PostgreSQL</dt><dd><span className={`status-label ${ready ? 'text-success' : ''}`}>{pending ? 'Checking…' : ready ? 'Ready' : migrationRequired ? 'Migration required' : apiConnected ? 'Unavailable' : 'Not checked'}</span><span className="detail-note">{ready ? 'Database schema is up to date' : 'Checked through the office API'}</span></dd></div>
      <div><dt><ShieldCheck aria-hidden="true" /> Desktop boundary</dt><dd><span className="status-label">Isolated renderer</span><span className="detail-note">Database access stays on the server</span></dd></div>
    </dl>
    <div className="connection-actions">
      <p>{apiConnected ? `Server checked at ${new Intl.DateTimeFormat('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(result.health.timestamp))}` : 'Connection checks repeat every 15 seconds.'}</p>
      <Button variant="outline" onClick={onRetry} disabled={refreshing}><RefreshCw aria-hidden="true" />{refreshing ? 'Checking…' : 'Check again'}</Button>
    </div>
  </section>;
}
