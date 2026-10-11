import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MascotRenderer } from './MascotRenderer';
import { MascotControls } from './MascotControls';
import { MascotPreferences } from './MascotPreferences';
import { announceMascotEvent, MASCOT_EVENT, type MascotEvent, type MascotEventDetail } from './mascot-events';
import { isMascotEvent, mascotReactions, type MascotMood, type MascotReaction } from './mascot-model';
import { useMascotAnimation } from './use-mascot-animation';
import { clampMascotPosition, initialMascotPosition, loadMascotPreferences, mascotDimensions, saveMascotPreferences, type MascotPosition, type MascotPreferences as MascotPreferencesState } from './mascot-preferences';
import { createMascotBehaviorScheduler, isSensitiveMascotWorkflowActive, shouldReactToApplicationEvent, shouldShowPersonalityDialogue, type MascotIdleBehavior } from './mascot-behavior';

const defaultMessage = 'Need help? I’m here.';
const fallbackDimensions = mascotDimensions('small');
const dialogueDurationMs = 5_000;

type DragState = { pointerId: number; offsetX: number; offsetY: number; lastPosition: MascotPosition; moved: boolean };
type PendingReaction = { event: MascotEvent; reaction: MascotReaction; showDialogue: boolean; expiresAt: number };

function reactionGroup(event: MascotEvent): string {
  return event.split('-')[0] ?? event;
}

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
  const [idleBehavior, setIdleBehavior] = useState<MascotIdleBehavior | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(true);
  const dialogueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleBehaviorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEventIds = useRef(new Set<string>());
  const pendingReactions = useRef<PendingReaction[]>([]);
  const activeEvent = useRef<MascotEvent | undefined>(undefined);
  const audioContext = useRef<AudioContext | null>(null);
  const drag = useRef<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const preferencesTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { animationStateRef.current = animationState; }, [animationState]);

  const persist = useCallback((next: MascotPreferencesState) => {
    setPreferences(next);
    saveMascotPreferences(next);
    if (next.minimized || !next.enabled) {
      if (dialogueTimer.current) clearTimeout(dialogueTimer.current);
      dialogueTimer.current = null;
      pendingReactions.current = [];
      activeEvent.current = undefined;
      reset();
      setMood('neutral');
      setMessage(defaultMessage);
      setPreferencesOpen(false);
    }
  }, [reset]);

  const react = useCallback(function reactTo(reaction: MascotReaction, showDialogue = true, event?: MascotEvent) {
    // Keep only the newest phase per workflow; never replay a stale "preparing" pose.
    pendingReactions.current = pendingReactions.current.filter((pending) => pending.expiresAt > Date.now()
      && (!event || reactionGroup(pending.event) !== reactionGroup(event)));
    if (event === 'connection-restored' && activeEvent.current === 'connection-lost') reset();
    const accepted = play({ name: reaction.animation, priority: reaction.priority, durationMs: reaction.durationMs }, () => {
      setMood('neutral');
      activeEvent.current = undefined;
      pendingReactions.current = pendingReactions.current.filter((pending) => pending.expiresAt > Date.now());
      const next = pendingReactions.current.shift();
      if (next) reactTo(next.reaction, next.showDialogue, next.event);
    });
    if (!accepted) {
      if (event) {
        pendingReactions.current.push({ event, reaction, showDialogue, expiresAt: Date.now() + 10_000 });
        pendingReactions.current.sort((left, right) => right.reaction.priority - left.reaction.priority);
        pendingReactions.current = pendingReactions.current.slice(0, 4);
      }
      return;
    }
    activeEvent.current = event;
    if (dialogueTimer.current) clearTimeout(dialogueTimer.current);
    if (idleBehaviorTimer.current) clearTimeout(idleBehaviorTimer.current);
    idleBehaviorTimer.current = null;
    setIdleBehavior(null);
    setMood(reaction.mood);
    setMessage(showDialogue ? reaction.message : '');
    if (showDialogue) {
      dialogueTimer.current = setTimeout(() => {
        setMessage('');
        dialogueTimer.current = null;
      }, dialogueDurationMs);
    }
    if (preferences.soundEnabled) playCue(audioContext.current, reaction.mood);
  }, [play, preferences.soundEnabled, reset]);

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
      if (!(rawEvent instanceof CustomEvent)) return;
      const detail: unknown = rawEvent.detail;
      if (!detail || typeof detail !== 'object' || !('type' in detail) || !('eventId' in detail)) return;
      const eventDetail = detail as MascotEventDetail;
      if (typeof eventDetail.type !== 'string' || !isMascotEvent(eventDetail.type) || typeof eventDetail.eventId !== 'string') return;
      if (seenEventIds.current.has(eventDetail.eventId)) return;
      seenEventIds.current.add(eventDetail.eventId);
      if (seenEventIds.current.size > 128) seenEventIds.current.delete(seenEventIds.current.values().next().value ?? '');
      if (!shouldReactToApplicationEvent(preferences.personality, eventDetail.type)) return;
      // Quiet ambient behavior during entry, but keep confirmed outcomes and errors readable.
      react(mascotReactions[eventDetail.type], shouldShowPersonalityDialogue(preferences.personality, eventDetail.type), eventDetail.type);
    };
    window.addEventListener(MASCOT_EVENT, handleEvent);
    return () => window.removeEventListener(MASCOT_EVENT, handleEvent);
  }, [preferences.enabled, preferences.minimized, preferences.personality, react]);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(document.visibilityState !== 'hidden');
      if (document.visibilityState === 'hidden') {
        setIdleBehavior(null);
        pendingReactions.current = [];
      }
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
    if (preferences.minimized || !preferences.enabled || !visible) return;
    const scheduler = createMascotBehaviorScheduler({
      personality: preferences.personality,
      clock: { setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs), clearTimeout: (handle) => window.clearTimeout(handle as number) },
      random: Math.random,
      canBehave: () => preferences.animationsEnabled && !reducedMotion && !animationPaused
        && animationStateRef.current.name === 'idle' && !isSensitiveMascotWorkflowActive(document),
      onBehavior: (behavior) => {
        setIdleBehavior(behavior);
        if (idleBehaviorTimer.current) clearTimeout(idleBehaviorTimer.current);
        const durationMs = behavior === 'blink' ? 160 : behavior === 'breathe' ? 2_400 : 1_200;
        idleBehaviorTimer.current = setTimeout(() => {
          setIdleBehavior(null);
          idleBehaviorTimer.current = null;
        }, durationMs);
      },
      onSleep: () => announceMascotEvent('extended-inactivity'),
      onWake: () => {
        if (isSensitiveMascotWorkflowActive(document)) {
          reset();
          setMood('neutral');
          setMessage('');
          return;
        }
        if (animationStateRef.current.name === 'sleep') reset();
        if (preferences.personality === 'professional') {
          setMood('neutral');
          setMessage('');
          setIdleBehavior('look');
          idleBehaviorTimer.current = setTimeout(() => setIdleBehavior(null), 900);
          return;
        }
        react({
          animation: preferences.personality === 'playful' ? 'happy' : 'greeting',
          mood: preferences.personality === 'playful' ? 'happy' : 'hello',
          message: 'Welcome back!',
          priority: 3,
          durationMs: preferences.personality === 'playful' ? 2_400 : 3_200,
        }, true);
      },
    });
    scheduler.start();
    const onActivity = () => scheduler.activity();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      scheduler.stop();
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (idleBehaviorTimer.current) clearTimeout(idleBehaviorTimer.current);
      idleBehaviorTimer.current = null;
    };
  }, [animationPaused, play, preferences.animationsEnabled, preferences.enabled, preferences.minimized, preferences.personality, react, reducedMotion, reset, visible]);

  useEffect(() => () => {
    if (dialogueTimer.current) clearTimeout(dialogueTimer.current);
    if (idleBehaviorTimer.current) clearTimeout(idleBehaviorTimer.current);
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

  const showTip = () => {
    if (preferencesOpen) {
      setPreferencesOpen(false);
      preferencesTrigger.current?.focus();
    }
    react({ animation: 'thinking', mood: 'thinking', message: 'I react to confirmed actions and stay quiet while you work.', priority: 4, durationMs: 6_000 });
  };
  const updatePreferences = (patch: Partial<MascotPreferencesState>) => {
    if (patch.animationsEnabled !== undefined || patch.personality !== undefined) setIdleBehavior(null);
    if (patch.personality !== undefined) pendingReactions.current = [];
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
    <div className={`mascot-bubble${!message ? ' is-muted' : ''}`} aria-live="polite" aria-atomic="true">
      <span>{message}</span>
      {message && <button type="button" className="mascot-bubble-dismiss" aria-label="Dismiss BCIS Buddy message" onClick={() => { if (dialogueTimer.current) clearTimeout(dialogueTimer.current); dialogueTimer.current = null; setMessage(''); }}>×</button>}
    </div>
    <MascotRenderer mood={mood} animation={animationState.name} animationId={animationState.requestId} idleBehavior={idleBehavior} paused={animationPaused || !visible} reducedMotion={reducedMotion || !preferences.animationsEnabled} />
    <MascotControls preferencesOpen={preferencesOpen} preferencesButtonRef={preferencesTrigger} onOpenPreferences={() => setPreferencesOpen((open) => !open)} onTip={showTip} onMinimize={() => persist({ ...preferences, minimized: true })} onPointerDown={startDrag} onKeyboardMove={moveByKeyboard} />
    {preferencesOpen && <MascotPreferences preferences={preferences} reducedMotion={reducedMotion} onUpdate={updatePreferences} onTip={showTip} onResetPosition={resetPosition} onClose={closePreferences} />}
  </div>;
}
