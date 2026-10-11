// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BCISMascot } from './BCISMascot';
import { announceMascotEvent } from './mascot-events';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('BCIS Buddy', () => {
  it('uses event-specific poses and restrained messages', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    expect(screen.getByText('Payment posted successfully.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BCIS Buddy, success' })).toBeInTheDocument();
  });

  it('announces connection loss without claiming financial success', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('connection-lost'));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, surprised' })).toBeInTheDocument();
    expect(screen.getByText('Connection to the office server was lost.')).toBeInTheDocument();
    expect(screen.queryByText('Payment posted successfully.')).toBeNull();
  });

  it('keeps critical connection feedback ahead of a lower-priority success reaction', () => {
    render(<BCISMascot />);
    act(() => {
      announceMascotEvent('connection-lost');
      announceMascotEvent('payment-posted');
    });

    expect(screen.getByText('Connection to the office server was lost.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BCIS Buddy, surprised' })).toBeInTheDocument();
  });

  it('does not expose event payloads in character copy', () => {
    render(<BCISMascot />);
    window.dispatchEvent(new CustomEvent('bcis:mascot-event', { detail: 'Subscriber Alice paid ₱500' }));

    expect(screen.getByText('Need help? I’m here.')).toBeInTheDocument();
    expect(screen.queryByText(/Alice|500/)).toBeNull();
  });

  it('keeps the dock affordance available when minimized and restores the mascot', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize BCIS Buddy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show BCIS Buddy' }));
    expect(screen.getByRole('group', { name: 'BCIS Buddy controls' })).toBeInTheDocument();
  });

  it('opens accessible preferences with optional sound disabled initially', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Mascot preferences' }));
    expect(screen.getByRole('region', { name: 'BCIS Buddy preferences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable sound feedback' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers an opt-in explanation in the thinking pose', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Mascot preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'What can Buddy do?' }));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, thinking' })).toBeInTheDocument();
  });

  it('clamps drag movement to the available viewport and persists the result', () => {
    render(<BCISMascot />);
    const dragHandle = screen.getByRole('button', { name: 'Move BCIS Buddy' });
    fireEvent.pointerDown(dragHandle, { pointerId: 7, clientX: 800, clientY: 600 });
    fireEvent.pointerMove(dragHandle, { pointerId: 7, clientX: 5000, clientY: 5000, movementX: 4200, movementY: 4400 });
    fireEvent.pointerUp(dragHandle, { pointerId: 7, clientX: 5000, clientY: 5000 });
    const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v2') ?? '{}') as { x?: number; y?: number };
    expect(stored.x).toBeLessThanOrEqual(window.innerWidth - 184 - 12);
    expect(stored.y).toBeLessThanOrEqual(window.innerHeight - 276 - 12);
  });

  it('supports keyboard repositioning as an alternative to dragging', () => {
    render(<BCISMascot />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move BCIS Buddy' }), { key: 'ArrowLeft' });
    const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v2') ?? '{}') as { x?: number };
    expect(stored.x).toBeGreaterThan(0);
    expect(stored.x).toBeLessThanOrEqual(window.innerWidth - 184 - 12);
  });
});
