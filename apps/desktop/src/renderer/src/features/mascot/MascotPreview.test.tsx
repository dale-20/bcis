// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MascotPreview } from './MascotPreview';
import { MascotAssetBoundary } from './MascotRenderer';

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

  it('shows bundled vector fallback if character artwork throws while rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenArtwork(): never { throw new Error('asset render failed'); }
    const { container } = render(<MascotAssetBoundary mood="happy" compact><BrokenArtwork /></MascotAssetBoundary>);
    expect(container.querySelector('.mascot-art-fallback.mood-happy')).toBeInTheDocument();
  });
});
