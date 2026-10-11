// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MascotPreview } from './MascotPreview';
import { MascotAssetBoundary, MascotRenderer } from './MascotRenderer';
import { MascotCharacter } from './MascotCharacter';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('mascot character studio', () => {
  it('lets a developer trigger each animation and inspect its current state', () => {
    render(<MascotPreview />);
    expect(screen.getByRole('img', { name: 'BCIS Buddy, neutral' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Greeting' }));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, hello' })).toHaveClass('anim-greeting');
    expect(screen.getByRole('button', { name: 'Greeting' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['idle', 'neutral'], ['walk', 'walking'], ['happy', 'happy'], ['thinking', 'thinking'],
    ['processing', 'processing'], ['success', 'celebrating'], ['warning', 'concerned'],
    ['error', 'concerned'], ['sleep', 'sleepy'], ['surprised', 'surprised'], ['greeting', 'hello'],
  ] as const)('triggers the %s animation with its matching expression', (animation, mood) => {
    render(<MascotPreview />);
    fireEvent.click(screen.getByRole('button', { name: animation[0]?.toUpperCase() + animation.slice(1) }));
    expect(screen.getByRole('img', { name: `BCIS Buddy, ${mood}` })).toHaveClass(`anim-${animation}`);
  });

  it('applies the reduced-motion variant when enabled in the playground', () => {
    render(<MascotPreview />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduced motion' }));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, neutral' })).toHaveClass('is-reduced-motion');
  });

  it('keeps the same rig mounted while the primary animation changes', () => {
    const { container, rerender } = render(<MascotRenderer mood="neutral" animation="idle" />);
    const originalSvg = container.querySelector('.mascot-art');
    const originalLifeLayer = container.querySelector('.buddy-life-motion');
    rerender(<MascotRenderer mood="celebrating" animation="success" />);
    expect(container.querySelector('.mascot-art')).toBe(originalSvg);
    expect(container.querySelector('.buddy-life-motion')).toBe(originalLifeLayer);
    expect(originalSvg).toHaveClass('anim-success');
  });

  it('nests shoulders, elbows, wrists, hips, knees, ankles, and feet under body and head pivots', () => {
    const { container } = render(<MascotCharacter mood="neutral" animation="idle" />);
    const bodyRoot = container.querySelector('.buddy-body-root');
    const headPivot = bodyRoot?.querySelector('.buddy-head-pivot');
    const leftShoulder = bodyRoot?.querySelector('.buddy-shoulder-left');
    const rightShoulder = bodyRoot?.querySelector('.buddy-shoulder-right');
    const leftHip = bodyRoot?.querySelector('.buddy-hip-left');
    const rightHip = bodyRoot?.querySelector('.buddy-hip-right');

    expect(bodyRoot).toBeInTheDocument();
    expect(headPivot?.querySelector('.buddy-head-turn .buddy-face .buddy-eyes')).toBeInTheDocument();
    expect(leftShoulder?.querySelector('.buddy-elbow-left .buddy-wrist-left .buddy-hand-base')).toBeInTheDocument();
    expect(rightShoulder?.querySelector('.buddy-elbow-right .buddy-wrist-right .buddy-hand-base')).toBeInTheDocument();
    expect(leftHip?.querySelector('.buddy-knee-left .buddy-ankle-left .buddy-foot-left')).toBeInTheDocument();
    expect(rightHip?.querySelector('.buddy-knee-right .buddy-ankle-right .buddy-foot-right')).toBeInTheDocument();
  });

  it('uses distinct happy eye marks and gradual sleep eyelid layers', () => {
    const { container, rerender } = render(<MascotCharacter mood="happy" animation="happy" />);
    expect(container.querySelectorAll('.buddy-happy-eyes path')).toHaveLength(2);
    rerender(<MascotCharacter mood="sleepy" animation="sleep" />);
    expect(container.querySelectorAll('.buddy-lid')).toHaveLength(2);
    expect(container.querySelector('.buddy-lid')?.getAttribute('d')).toContain('v16');
  });

  it('shows bundled vector fallback if character artwork throws while rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenArtwork(): never { throw new Error('asset render failed'); }
    const { container } = render(<MascotAssetBoundary mood="happy" compact><BrokenArtwork /></MascotAssetBoundary>);
    expect(container.querySelector('.mascot-art-fallback.mood-happy')).toBeInTheDocument();
  });
});
