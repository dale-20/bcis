import { Accessibility, MessageCircle, Minus, Move } from 'lucide-react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';

export function MascotControls({ preferencesOpen, preferencesButtonRef, onOpenPreferences, onTip, onMinimize, onPointerDown, onKeyboardMove }: {
  preferencesOpen: boolean;
  preferencesButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenPreferences: () => void;
  onTip: () => void;
  onMinimize: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyboardMove: (dx: number, dy: number) => void;
}) {
  const handleMovementKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 40 : 16;
    const direction = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    } as const;
    const offset = direction[event.key as keyof typeof direction];
    if (!offset) return;
    event.preventDefault();
    onKeyboardMove(offset[0], offset[1]);
  };

  return <div className="mascot-toolbar" role="group" aria-label="BCIS Buddy controls">
    <button aria-label="Talk to BCIS Buddy" title="Get a Buddy tip" onClick={onTip}><MessageCircle aria-hidden="true" /></button>
    <button className="mascot-drag-handle" aria-label="Move BCIS Buddy" title="Drag to move; use arrow keys to reposition" onKeyDown={handleMovementKeys} onPointerDown={onPointerDown}><Move aria-hidden="true" /></button>
    <button ref={preferencesButtonRef} aria-label="Mascot preferences" aria-expanded={preferencesOpen} aria-controls="bcis-mascot-preferences" onClick={onOpenPreferences}><Accessibility aria-hidden="true" /></button>
    <button aria-label="Minimize BCIS Buddy" onClick={onMinimize}><Minus aria-hidden="true" /></button>
  </div>;
}
