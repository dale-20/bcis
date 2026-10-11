import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MascotRenderer } from './MascotRenderer';
import { MascotControls } from './MascotControls';
import { MascotPreferences } from './MascotPreferences';
import { MASCOT_EVENT } from './mascot-events';
import { isMascotEvent, mascotReactions, type MascotMood, type MascotReaction } from './mascot-model';
import { useMascotAnimation } from './use-mascot-animation';
import { clampMascotPosition, initialMascotPosition, loadMascotPreferences, mascotDimensions, saveMascotPreferences, type MascotPosition, type MascotPreferences as MascotPreferencesState } from './mascot-preferences';

const defaultMessage = 'Need help? I’m here.';
const fallbackDimensions = mascotDimensions('small');

type DragState = { pointerId: number; offsetX: number; offsetY: number; lastPosition: MascotPosition; moved: boolean };

function playCue(context: AudioContext | null, mood: MascotMood): void {
  if (!context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = mood === 'concerned' ? 280 : 620;
  gain.gain.setValueAtTime(0.025, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

export function BCISMascot() {
  const [preferences, setPreferences] = useState<MascotPreferencesState>(loadMascotPreferences);
  const [position, setPosition] = useState<MascotPosition>(() => initialMascotPosition(preferences, window.innerWidth, window.innerHeight));
  const { state: animationState, paused: animationPaused, play, reset } = useMascotAnimation();
  const animationStateRef = useRef(animationState);
  const [mood, setMood] = useState<MascotMood>('neutral');
  const [message, setMessage] = useState(defaultMessage);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(true);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const drag = useRef<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const preferencesTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { animationStateRef.current = animationState; }, [animationState]);

  const persist = useCallback((next: MascotPreferencesState) => {
    setPreferences(next);
    saveMascotPreferences(next);
    if (next.minimized || !next.enabled) {
      if (restTimer.current) clearTimeout(restTimer.current);
      reset();
      setMood('neutral');
      setMessage(defaultMessage);
      setPreferencesOpen(false);
    }
  }, [reset]);

  const react = useCallback((reaction: MascotReaction) => {
    const accepted = play({ name: reaction.animation, priority: reaction.priority, durationMs: reaction.durationMs }, () => {
      setMood('neutral');
      setMessage(defaultMessage);
    });
    if (!accepted) return;
    setMood(reaction.mood);
    setMessage(reaction.message);
    if (preferences.soundEnabled) playCue(audioContext.current, reaction.mood);
  }, [play, preferences.soundEnabled]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!preferences.enabled) return;
    const handleEvent = (rawEvent: Event) => {
      if (preferences.minimized || document.visibilityState === 'hidden') return;
      if (!(rawEvent instanceof CustomEvent) || typeof rawEvent.detail !== 'string' || !isMascotEvent(rawEvent.detail)) return;
      react(mascotReactions[rawEvent.detail]);
    };
    window.addEventListener(MASCOT_EVENT, handleEvent);
    return () => window.removeEventListener(MASCOT_EVENT, handleEvent);
  }, [preferences.enabled, preferences.minimized, react]);

  useEffect(() => {
    const updateVisibility = () => {
      const nextVisible = document.visibilityState !== 'hidden';
      setVisible(nextVisible);
      if (nextVisible || !restTimer.current) return;
      clearTimeout(restTimer.current);
      restTimer.current = null;
    };
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!preferences.enabled || preferences.minimized) return;
    const reclamp = () => {
      const width = rootRef.current?.offsetWidth || fallbackDimensions.width;
      const height = rootRef.current?.offsetHeight || fallbackDimensions.height;
      const viewport = window.visualViewport;
      const next = clampMascotPosition(position, Math.min(window.innerWidth, viewport?.width ?? window.innerWidth), Math.min(window.innerHeight, viewport?.height ?? window.innerHeight), width, height);
      if (next.x !== position.x || next.y !== position.y) {
        setPosition(next);
        persist({ ...preferences, ...next });
      }
    };
    const observer = typeof ResizeObserver === 'undefined' || !rootRef.current ? null : new ResizeObserver(reclamp);
    if (rootRef.current) observer?.observe(rootRef.current);
    window.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('resize', reclamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('resize', reclamp);
    };
  }, [position, preferences, persist]);

  useEffect(() => {
    if (!preferencesOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreferencesOpen(false);
      preferencesTrigger.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preferencesOpen]);

  useEffect(() => {
    if (preferences.minimized || !preferences.enabled || !visible) {
      if (restTimer.current) clearTimeout(restTimer.current);
      return;
    }
    const rest = () => {
      if (restTimer.current) clearTimeout(restTimer.current);
      if (animationStateRef.current.name === 'sleep') {
        reset();
        setMood('neutral');
        setMessage(defaultMessage);
      }
      restTimer.current = setTimeout(() => {
        if (animationStateRef.current.name === 'idle') {
          play({ name: 'sleep', priority: 0, durationMs: null });
          setMood('sleepy');
          setMessage('Taking a quiet moment.');
        }
      }, 60_000);
    };
    rest();
    window.addEventListener('pointerdown', rest);
    window.addEventListener('keydown', rest);
    return () => {
      window.removeEventListener('pointerdown', rest);
      window.removeEventListener('keydown', rest);
      if (restTimer.current) clearTimeout(restTimer.current);
    };
  }, [play, preferences.enabled, preferences.minimized, reset, visible]);

  useEffect(() => () => {
    if (restTimer.current) clearTimeout(restTimer.current);
    if (audioContext.current && audioContext.current.state !== 'closed') void audioContext.current.close();
  }, []);

  const updatePosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const width = rootRef.current?.offsetWidth || fallbackDimensions.width;
    const height = rootRef.current?.offsetHeight || fallbackDimensions.height;
    const viewport = window.visualViewport;
    const next = clampMascotPosition({ x: event.clientX - activeDrag.offsetX, y: event.clientY - activeDrag.offsetY }, Math.min(window.innerWidth, viewport?.width ?? window.innerWidth), Math.min(window.innerHeight, viewport?.height ?? window.innerHeight), width, height);
    if (Math.abs(next.x - position.x) + Math.abs(next.y - position.y) > 0) activeDrag.moved = true;
    activeDrag.lastPosition = next;
    setPosition(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const { moved, lastPosition } = drag.current;
    drag.current = null;
    if (moved) persist({ ...preferences, ...lastPosition });
    if (animationState.name === 'walk') {
      reset();
      setMood('neutral');
    }
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, lastPosition: position, moved: false };
    if (animationState.priority === 0 && preferences.animationsEnabled && !reducedMotion) {
      play({ name: 'walk', priority: 1, durationMs: null });
      setMood('walking');
    }
  };

  const moveByKeyboard = (dx: number, dy: number) => {
    const width = rootRef.current?.offsetWidth || fallbackDimensions.width;
    const height = rootRef.current?.offsetHeight || fallbackDimensions.height;
    const viewport = window.visualViewport;
    const next = clampMascotPosition({ x: position.x + dx, y: position.y + dy }, Math.min(window.innerWidth, viewport?.width ?? window.innerWidth), Math.min(window.innerHeight, viewport?.height ?? window.innerHeight), width, height);
    setPosition(next);
    persist({ ...preferences, ...next });
  };

  const showTip = () => react({ animation: 'thinking', mood: 'thinking', message: 'I react to confirmed actions and stay quiet while you work.', priority: 2, durationMs: 6_000 });
  const updatePreferences = (patch: Partial<MascotPreferencesState>) => {
    if (patch.soundEnabled && typeof AudioContext !== 'undefined') {
      audioContext.current ??= new AudioContext();
      void audioContext.current.resume().catch(() => undefined);
    }
    persist({ ...preferences, ...patch });
  };
  const resetPosition = () => {
    const next = initialMascotPosition({ ...preferences, x: 0, y: 0 }, Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth), Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight));
    setPosition(next);
    persist({ ...preferences, ...next });
  };
  const closePreferences = () => {
    setPreferencesOpen(false);
    preferencesTrigger.current?.focus();
  };
  const showMascot = () => persist({ ...preferences, enabled: true, minimized: false });

  if (!preferences.enabled || preferences.minimized) return <button className="mascot-dock" aria-label={preferences.enabled ? 'Show BCIS Buddy' : 'Enable and show BCIS Buddy'} title={preferences.enabled ? 'Show BCIS Buddy' : 'Enable BCIS Buddy'} onClick={showMascot}><MascotRenderer mood="neutral" animation="idle" compact reducedMotion /></button>;

  const personalityClass = `personality-${preferences.personality}`;
  const sizeClass = `size-${preferences.size}`;
  return <div ref={rootRef} role="region" aria-label="BCIS Buddy companion" className={`bcis-mascot ${personalityClass} ${sizeClass}${position.y < 250 ? ' is-near-top' : ''}${position.x < 248 ? ' is-near-left' : ''}${reducedMotion ? ' reduced-motion' : ''}${animationPaused || !visible ? ' is-window-paused' : ''}`} style={{ left: position.x, top: position.y, display: visible ? undefined : 'none', pointerEvents: 'none' }} onPointerMove={updatePosition} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
    <div className={`mascot-bubble${mood === 'neutral' ? ' is-muted' : ''}`} aria-live="polite" aria-atomic="true">{message}</div>
    <MascotRenderer mood={mood} animation={animationState.name} paused={animationPaused || !visible} reducedMotion={reducedMotion || !preferences.animationsEnabled} />
    <MascotControls preferencesOpen={preferencesOpen} preferencesButtonRef={preferencesTrigger} onOpenPreferences={() => setPreferencesOpen((open) => !open)} onMinimize={() => persist({ ...preferences, minimized: true })} onPointerDown={startDrag} onKeyboardMove={moveByKeyboard} />
    {preferencesOpen && <MascotPreferences preferences={preferences} reducedMotion={reducedMotion} onUpdate={updatePreferences} onTip={showTip} onResetPosition={resetPosition} onClose={closePreferences} />}
  </div>;
}
