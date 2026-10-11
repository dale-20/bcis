// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BCISMascot } from './BCISMascot';
import { MascotCharacter } from './MascotCharacter';
import { announceMascotEvent } from './mascot-events';
import { defaultMascotPreferences } from './mascot-preferences';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(() => vi.stubGlobal('PointerEvent', TestPointerEvent));
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('BCIS Buddy', () => {
  it('uses event-specific poses and restrained messages', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    expect(screen.getByText('Payment recorded successfully!')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BCIS Buddy, celebrating' })).toBeInTheDocument();
  });

  it('announces connection loss without claiming financial success', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('connection-lost'));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, concerned' })).toBeInTheDocument();
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
    expect(screen.getByRole('img', { name: 'BCIS Buddy, concerned' })).toBeInTheDocument();
  });

  it('does not expose event payloads in character copy', () => {
    render(<BCISMascot />);
    window.dispatchEvent(new CustomEvent('bcis:mascot-event', { detail: 'Subscriber Alice paid ₱500' }));

    expect(screen.getByText('Need help? I’m here.')).toBeInTheDocument();
    expect(screen.queryByText(/Alice|500/)).toBeNull();
  });

  it('dismisses contextual dialogue without interrupting the reaction', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss BCIS Buddy message' }));
    expect(screen.queryByText('Payment recorded successfully!')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BCIS Buddy, celebrating' })).toBeInTheDocument();
  });

  it('automatically dismisses contextual dialogue', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('report-finish'));
    expect(screen.getByText('Your report is ready.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText('Your report is ready.')).not.toBeInTheDocument();
    expect(screen.queryByText('Need help? I’m here.')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('keeps confirmed payment feedback visible on the payment entry screen', () => {
    const input = document.createElement('input');
    input.className = 'payment-workspace';
    document.body.append(input);
    input.focus();
    try {
      render(<BCISMascot />);
      act(() => announceMascotEvent('payment-posted'));
      expect(screen.getByText('Payment recorded successfully!')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'BCIS Buddy, celebrating' })).toBeInTheDocument();
    } finally {
      input.remove();
    }
  });

  it('keeps error text readable after its short animation finishes', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-error'));
    act(() => vi.advanceTimersByTime(1_800));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, neutral' })).toBeInTheDocument();
    expect(screen.getByText(/Payment could not be confirmed/).parentElement).not.toHaveClass('is-muted');
    act(() => vi.advanceTimersByTime(3_200));
    expect(screen.queryByText(/Payment could not be confirmed/)).not.toBeInTheDocument();
  });

  it('shows recovery immediately when the connection returns during a warning', () => {
    render(<BCISMascot />);
    act(() => announceMascotEvent('connection-lost'));
    act(() => announceMascotEvent('connection-restored'));
    expect(screen.getByText('Connection restored.')).toBeInTheDocument();
    expect(screen.queryByText('Connection to the office server was lost.')).not.toBeInTheDocument();
  });

  it('plays a deferred result after a higher-priority reaction finishes', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    act(() => announceMascotEvent('subscriber-created'));
    expect(screen.getByText('Payment recorded successfully!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_800));
    expect(screen.getByText('Subscriber created successfully.')).toBeInTheDocument();
  });

  it('replaces queued processing with its completed result', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    act(() => announceMascotEvent('report-start'));
    act(() => announceMascotEvent('report-finish'));
    act(() => vi.advanceTimersByTime(2_800));
    expect(screen.getByText('Your report is ready.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_200));
    expect(screen.queryByText('Preparing your report…')).not.toBeInTheDocument();
  });

  it('offers a direct tip without opening preferences', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Talk to BCIS Buddy' }));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, thinking' })).toBeInTheDocument();
    expect(screen.getByText('I react to confirmed actions and stay quiet while you work.')).toBeInTheDocument();
  });

  it('settles two quick report runs without replaying the second processing event', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('report-finish'));
    act(() => announceMascotEvent('report-start'));
    act(() => announceMascotEvent('report-finish'));
    act(() => vi.advanceTimersByTime(3_200));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, neutral' })).toBeInTheDocument();
    expect(screen.getByText('Your report is ready.')).toBeInTheDocument();
  });

  it('clears deferred feedback when minimized', () => {
    vi.useFakeTimers();
    render(<BCISMascot />);
    act(() => announceMascotEvent('payment-posted'));
    act(() => announceMascotEvent('report-finish'));
    fireEvent.click(screen.getByRole('button', { name: 'Minimize BCIS Buddy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show BCIS Buddy' }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText('Your report is ready.')).not.toBeInTheDocument();
  });

  it('keeps the dock affordance available when minimized and restores the mascot', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize BCIS Buddy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show BCIS Buddy' }));
    expect(screen.getByRole('group', { name: 'BCIS Buddy controls' })).toBeInTheDocument();
  });

  it('keeps one mascot mounted while shared-layout pages change', () => {
    const SharedWorkspace = ({ page }: { page: string }) => <><main>{page}</main><BCISMascot /></>;
    const { rerender } = render(<SharedWorkspace page="Dashboard" />);
    rerender(<SharedWorkspace page="Subscribers" />);
    expect(screen.getByText('Subscribers')).toBeInTheDocument();
    expect(document.querySelectorAll('.bcis-mascot')).toHaveLength(1);
  });

  it('opens accessible preferences with optional sound disabled initially', () => {
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Mascot preferences' }));
    expect(screen.getByRole('region', { name: 'BCIS Buddy preferences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable sound feedback' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Buddy enabled')).toBeChecked();
    expect(screen.getByLabelText('Animations')).toBeChecked();
    expect(screen.getByLabelText('Mascot size')).toHaveValue('small');
    expect(screen.getByLabelText('Personality')).toHaveValue('balanced');
  });

  it('persists display settings and leaves a restore control when hidden', () => {
    const { unmount } = render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Mascot preferences' }));
    fireEvent.click(screen.getByLabelText('Animations'));
    fireEvent.change(screen.getByLabelText('Mascot size'), { target: { value: 'large' } });
    fireEvent.change(screen.getByLabelText('Personality'), { target: { value: 'professional' } });
    fireEvent.click(screen.getByLabelText('Buddy enabled'));
    expect(screen.getByRole('button', { name: 'Enable and show BCIS Buddy' })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}') as { enabled?: boolean; animationsEnabled?: boolean; size?: string; personality?: string };
    expect(stored).toMatchObject({ enabled: false, animationsEnabled: false, size: 'large', personality: 'professional' });
    unmount();
    render(<BCISMascot />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable and show BCIS Buddy' }));
    expect(screen.getByRole('group', { name: 'BCIS Buddy controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mascot preferences' })).toBeInTheDocument();
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
    const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}') as { x?: number; y?: number };
    expect(stored.x).toBeLessThanOrEqual(window.innerWidth - 116 - 12);
    expect(stored.y).toBeLessThanOrEqual(window.innerHeight - 178 - 12);
  });

  it('reclamps a persisted position after the application viewport shrinks', () => {
    localStorage.setItem('bcis.mascot.preferences.v3', JSON.stringify({ ...defaultMascotPreferences, x: 700, y: 500 }));
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 960 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    try {
      render(<BCISMascot />);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 340 });
      fireEvent.resize(window);
      const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}') as { x?: number; y?: number };
      expect(stored.x).toBeLessThanOrEqual(360 - 116 - 12);
      expect(stored.y).toBeLessThanOrEqual(340 - 178 - 12);
    } finally {
      if (width) Object.defineProperty(window, 'innerWidth', width);
      if (height) Object.defineProperty(window, 'innerHeight', height);
    }
  });

  it('supports keyboard repositioning as an alternative to dragging', () => {
    render(<BCISMascot />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move BCIS Buddy' }), { key: 'ArrowLeft' });
    const stored = JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}') as { x?: number };
    expect(stored.x).toBeGreaterThan(0);
    expect(stored.x).toBeLessThanOrEqual(window.innerWidth - 116 - 12);
  });

  it('keeps artwork click-through while exposing keyboard-operable controls', () => {
    render(<BCISMascot />);
    expect(document.querySelector('.bcis-mascot')).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByRole('button', { name: 'Move BCIS Buddy' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move BCIS Buddy' }), { key: 'ArrowRight' });
    expect(JSON.parse(localStorage.getItem('bcis.mascot.preferences.v3') ?? '{}')).toMatchObject({ x: expect.any(Number) });
  });

  it('removes mascot event listeners when unmounted', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<BCISMascot />);
    unmount();
    expect(removeListener).toHaveBeenCalledWith('bcis:mascot-event', expect.any(Function));
  });

  it.each(['neutral', 'happy', 'thinking', 'surprised', 'concerned', 'sleepy', 'celebrating'] as const)('renders the %s expression', (mood) => {
    const { container } = render(<div><MascotCharacter mood={mood} /></div>);
    expect(container.querySelector(`.mascot-art.mood-${mood}`)).toBeInTheDocument();
  });
});
