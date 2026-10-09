// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConnectionPanel } from './ConnectionPanel';

afterEach(cleanup);
const base = { result: undefined, pending: false, refreshing: false, error: false, onRetry: vi.fn() };
describe('connection panel states', () => {
  it('shows checking state without claiming connectivity', () => {
    render(<ConnectionPanel {...base} pending refreshing />);
    expect(screen.getByRole('heading', { name: 'Checking your connection' })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('offers retry on connection failure', () => {
    render(<ConnectionPanel {...base} result={{ ok: false, endpoint: 'http://localhost:3001', reason: 'unreachable' }} />);
    expect(screen.getByRole('heading', { name: 'Unable to reach BCIS' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(base.onRetry).toHaveBeenCalled();
  });
  it('renders readiness only from the API response', () => {
    render(<ConnectionPanel {...base} result={{ ok: true, endpoint: 'http://localhost:3001', health: { service: 'bcis-api', status: 'ready', database: 'connected', timestamp: '2026-10-09T00:00:00Z' } }} />);
    expect(screen.getByRole('heading', { name: 'Connected to BCIS' })).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
  it('explains missing migrations', () => {
    render(<ConnectionPanel {...base} result={{ ok: true, endpoint: 'http://localhost:3001', health: { service: 'bcis-api', status: 'degraded', database: 'migration_required', timestamp: '2026-10-09T00:00:00Z' } }} />);
    expect(screen.getByText('Migration required')).toBeInTheDocument();
  });
  it('does not keep a stale green status after bridge failure', () => {
    render(<ConnectionPanel {...base} error result={{ ok: true, endpoint: 'http://localhost:3001', health: { service: 'bcis-api', status: 'ready', database: 'connected', timestamp: '2026-10-09T00:00:00Z' } }} />);
    expect(screen.queryByText('Connected to BCIS')).not.toBeInTheDocument();
  });
});
