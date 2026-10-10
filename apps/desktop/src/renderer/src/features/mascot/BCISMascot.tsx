import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Accessibility, Minus, Move, Volume2, VolumeX, X } from 'lucide-react';
import { z } from 'zod';
import { MASCOT_EVENT, type MascotEvent } from './mascot-events';

const preferenceSchema = z.object({
  x: z.number().finite().min(0).max(10000),
  y: z.number().finite().min(0).max(10000),
  minimized: z.boolean(),
  soundEnabled: z.boolean(),
}).strict();
type Preferences = z.infer<typeof preferenceSchema>;
type Mood = 'idle' | 'hello' | 'happy' | 'walking' | 'processing' | 'thinking' | 'warning' | 'sleeping' | 'surprised' | 'error' | 'success';

const storageKey = 'bcis.mascot.preferences.v1';
const initialPreferences: Preferences = { x: 0, y: 0, minimized: false, soundEnabled: false };
const eventMood: Record<MascotEvent, { mood: Mood; message: string; priority: number }> = {
  login: { mood: 'hello', message: 'Hello! Ready to manage BCIS today?', priority: 3 },
  'subscriber-created': { mood: 'happy', message: 'Subscriber profile saved.', priority: 3 },
  'billing-start': { mood: 'processing', message: 'Preparing this billing run…', priority: 2 },
  'billing-success': { mood: 'success', message: 'Billing run completed.', priority: 5 },
  'billing-error': { mood: 'error', message: 'Billing needs attention. Check the result.', priority: 6 },
  'payment-posted': { mood: 'success', message: 'Payment posted successfully.', priority: 5 },
  'payment-error': { mood: 'error', message: 'Payment could not be confirmed. Check payment history before retrying.', priority: 6 },
  'gcash-approved': { mood: 'happy', message: 'GCash proof verified.', priority: 5 },
  'overdue-found': { mood: 'warning', message: 'Overdue accounts need review.', priority: 4 },
  'report-start': { mood: 'processing', message: 'Preparing your report…', priority: 2 },
  'report-finish': { mood: 'happy', message: 'Report is ready.', priority: 3 },
  'report-error': { mood: 'error', message: 'Report could not be prepared. Check the report screen.', priority: 6 },
  'backup-success': { mood: 'success', message: 'Backup verified and ready.', priority: 5 },
  'connection-lost': { mood: 'surprised', message: 'BCIS server is unavailable or not ready.', priority: 7 },
  'connection-restored': { mood: 'happy', message: 'Office server connection restored.', priority: 5 },
};

function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return initialPreferences;
    const parsed = preferenceSchema.safeParse(JSON.parse(stored) as unknown);
    return parsed.success ? parsed.data : initialPreferences;
  } catch {
    return initialPreferences;
  }
}

function savePreferences(value: Preferences): void {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Storage may be unavailable in managed profiles. */ }
}

function initialPosition(preferences: Preferences): { x: number; y: number } {
  const { innerWidth, innerHeight } = window;
  const width = 154;
  const height = 230;
  const preferredX = preferences.x > 0 ? preferences.x : Math.max(8, innerWidth - width - 18);
  const preferredY = preferences.y > 0 ? preferences.y : Math.max(8, innerHeight - height - 16);
  return { x: Math.min(preferredX, Math.max(8, innerWidth - width - 8)), y: Math.min(preferredY, Math.max(8, innerHeight - height - 8)) };
}

function MascotArt({ mood }: { mood: Mood }) {
  return <svg className={`mascot-art mood-${mood}`} viewBox="0 0 160 180" role="img" aria-label={`BCIS Buddy, ${mood}`}>
    <defs>
      <linearGradient id="buddy-blue" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#3B82F6" /><stop offset="1" stopColor="#0F3B79" /></linearGradient>
      <linearGradient id="buddy-shine" x1="0" x2="0.8" y1="0" y2="1"><stop stopColor="#fff" stopOpacity=".92" /><stop offset="1" stopColor="#DCEBFF" /></linearGradient>
      <filter id="buddy-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#0F2747" floodOpacity=".25" /></filter>
    </defs>
    <ellipse cx="81" cy="166" rx="43" ry="8" fill="#0F2747" opacity=".12" className="mascot-shadow" />
    <g className="mascot-body" filter="url(#buddy-shadow)">
      <path d="M45 111Q80 97 115 111L126 153Q104 166 57 158Z" fill="url(#buddy-blue)" stroke="#0F2747" strokeWidth="3" />
      <path d="M65 114Q80 121 96 114L103 151Q82 158 59 151Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="2" />
      <path d="M69 129Q80 118 92 129M73 136Q80 130 88 136M78 143Q81 140 84 143" fill="none" stroke="#1689E8" strokeWidth="4" strokeLinecap="round" />
      <path className="mascot-leg mascot-leg-left" d="M55 150L46 164Q43 170 51 171L69 171L77 158Z" fill="#123D75" stroke="#0F2747" strokeWidth="3" />
      <path className="mascot-leg mascot-leg-right" d="M102 153L112 165Q116 171 108 172L91 171L85 159Z" fill="#123D75" stroke="#0F2747" strokeWidth="3" />
      <path className="mascot-boot mascot-boot-left" d="M45 163Q58 160 70 166L68 174L43 174Q37 171 45 163Z" fill="#2563EB" stroke="#0F2747" strokeWidth="3" />
      <path className="mascot-boot mascot-boot-right" d="M99 164Q112 160 121 165L124 171Q123 175 116 175L93 173Z" fill="#2563EB" stroke="#0F2747" strokeWidth="3" />
      <path className="mascot-arm mascot-arm-left" d="M49 119Q34 120 30 138L22 130Q18 126 14 131Q10 136 17 143L28 153Q34 158 41 150L58 137Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="3" strokeLinejoin="round" />
      <path className="mascot-arm mascot-arm-right" d="M110 119Q125 121 130 138L138 130Q142 126 146 131Q150 136 143 143L132 153Q126 158 119 150L103 137Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="3" strokeLinejoin="round" />
      <path className="mascot-thumb mascot-thumb-left" d="M20 138L20 132Q20 128 24 127L30 117Q33 113 36 117L35 128L41 129Q45 130 43 135L39 147Q38 151 34 151L24 149Q20 148 20 138Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="2.5" strokeLinejoin="round" />
      <path className="mascot-thumb mascot-thumb-right" d="M140 138L140 132Q140 128 136 127L130 117Q127 113 124 117L125 128L119 129Q115 130 117 135L121 147Q122 151 126 151L136 149Q140 148 140 138Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M44 68Q80 48 116 68Q130 87 126 112Q121 137 80 139Q39 137 34 112Q30 87 44 68Z" fill="url(#buddy-shine)" stroke="#0F2747" strokeWidth="3" />
      <path d="M33 85Q25 87 26 100Q27 114 36 115M127 85Q135 87 134 100Q133 114 124 115" fill="none" stroke="#0F2747" strokeWidth="7" strokeLinecap="round" />
      <circle cx="29" cy="101" r="11" fill="#1689E8" stroke="#0F2747" strokeWidth="3" /><circle cx="131" cy="101" r="11" fill="#1689E8" stroke="#0F2747" strokeWidth="3" />
      <g className="mascot-face">
        <path d="M53 94Q62 89 70 94" fill="none" stroke="#0F2747" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M91 94Q99 89 107 94" fill="none" stroke="#0F2747" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse className="mascot-eye eye-left" cx="62" cy="105" rx="8" ry="12" fill="#1472B9" stroke="#0F2747" strokeWidth="2" />
        <ellipse className="mascot-eye eye-right" cx="99" cy="105" rx="8" ry="12" fill="#1472B9" stroke="#0F2747" strokeWidth="2" />
        <ellipse cx="64" cy="101" rx="2.5" ry="4" fill="white" /><ellipse cx="101" cy="101" rx="2.5" ry="4" fill="white" />
        <ellipse cx="47" cy="115" rx="7" ry="3" fill="#F58D83" opacity=".55" /><ellipse cx="114" cy="115" rx="7" ry="3" fill="#F58D83" opacity=".55" />
        <path className="mascot-mouth" d="M72 118Q80 125 89 118Q87 130 80 130Q74 129 72 118Z" fill="#E25245" stroke="#0F2747" strokeWidth="1.5" />
      </g>
      <path d="M38 84Q36 62 50 52Q67 42 103 50Q122 55 124 79L115 87Q79 75 45 91Z" fill="url(#buddy-blue)" stroke="#0F2747" strokeWidth="3" />
      <path d="M48 82Q79 72 118 84Q125 88 120 94Q87 82 45 96Z" fill="#1689E8" stroke="#0F2747" strokeWidth="2" />
      <text x="80" y="68" textAnchor="middle" fill="white" fontSize="12" fontWeight="900" fontFamily="system-ui, sans-serif">BCIS</text>
      <path d="M70 56Q80 48 90 56M74 60Q80 55 86 60M78 64Q80 62 82 64" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  </svg>;
}

export function BCISMascot() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [mood, setMood] = useState<Mood>('idle');
  const [message, setMessage] = useState('Need help? I’m here.');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => initialPosition(preferences));
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(true);
  const currentPriority = useRef(0);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundEnabled = useRef(preferences.soundEnabled);
  const audioContext = useRef<AudioContext | null>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number; moved: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const persist = useCallback((next: Preferences) => {
    setPreferences(next);
    savePreferences(next);
    if (next.minimized) {
      if (moodTimer.current) clearTimeout(moodTimer.current);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      currentPriority.current = 0;
      setMood('idle');
      setMessage('Need help? I’m here.');
    }
  }, []);
  useEffect(() => { soundEnabled.current = preferences.soundEnabled; }, [preferences.soundEnabled]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (!rootRef.current) return;
      const width = rootRef.current.offsetWidth || 154;
      const height = rootRef.current.offsetHeight || 230;
      setPosition({ x: Math.min(position.x, Math.max(8, innerWidth - width - 8)), y: Math.min(position.y, Math.max(8, innerHeight - height - 8)) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  useEffect(() => {
    const handleEvent = (rawEvent: Event) => {
      if (preferences.minimized || !visible || document.visibilityState !== 'visible') return;
      if (!(rawEvent instanceof CustomEvent) || typeof rawEvent.detail !== 'string' || !Object.hasOwn(eventMood, rawEvent.detail)) return;
      const selected = eventMood[rawEvent.detail as MascotEvent];
      if (!selected || selected.priority < currentPriority.current) return;
      currentPriority.current = selected.priority;
      setMood(selected.mood);
      setMessage(selected.message);
      if (moodTimer.current) clearTimeout(moodTimer.current);
      moodTimer.current = setTimeout(() => { setMood('idle'); setMessage('Need help? I’m here.'); currentPriority.current = 0; }, selected.mood === 'processing' ? 60_000 : 6_000);
      if (soundEnabled.current && audioContext.current?.state === 'running') {
        const oscillator = audioContext.current.createOscillator();
        const gain = audioContext.current.createGain();
        oscillator.frequency.value = selected.mood === 'error' || selected.mood === 'warning' ? 280 : 620;
        gain.gain.setValueAtTime(0.035, audioContext.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.current.currentTime + 0.12);
        oscillator.connect(gain);
        gain.connect(audioContext.current.destination);
        oscillator.start();
        oscillator.stop(audioContext.current.currentTime + 0.12);
      }
    };
    window.addEventListener(MASCOT_EVENT, handleEvent);
    return () => { window.removeEventListener(MASCOT_EVENT, handleEvent); if (moodTimer.current) clearTimeout(moodTimer.current); };
  }, [preferences.minimized, visible]);

  useEffect(() => {
    const onVisibility = () => {
      const nextVisible = document.visibilityState === 'visible';
      setVisible(nextVisible);
      if (!nextVisible) {
        if (moodTimer.current) clearTimeout(moodTimer.current);
        if (sleepTimer.current) clearTimeout(sleepTimer.current);
        currentPriority.current = 0;
        setMood('idle');
        setMessage('Need help? I’m here.');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!preferencesOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreferencesOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preferencesOpen]);

  useEffect(() => {
    if (preferences.minimized || !visible) {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      return;
    }
    const rest = () => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (mood === 'sleeping') { setMood('idle'); setMessage('Need help? I’m here.'); }
      sleepTimer.current = setTimeout(() => { if (currentPriority.current === 0) { setMood('sleeping'); setMessage('Taking a quiet moment.'); } }, 60_000);
    };
    rest();
    window.addEventListener('pointerdown', rest);
    window.addEventListener('keydown', rest);
    return () => { window.removeEventListener('pointerdown', rest); window.removeEventListener('keydown', rest); if (sleepTimer.current) clearTimeout(sleepTimer.current); };
  }, [mood, preferences.minimized, visible]);

  useEffect(() => () => { if (audioContext.current && audioContext.current.state !== 'closed') void audioContext.current.close(); }, []);

  const updatePosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const width = event.currentTarget.offsetWidth || 154;
    const height = event.currentTarget.offsetHeight || 230;
    const next = { x: Math.max(8, Math.min(innerWidth - width - 8, event.clientX - current.dx)), y: Math.max(8, Math.min(innerHeight - height - 8, event.clientY - current.dy)) };
    if (Math.abs(next.x - position.x) + Math.abs(next.y - position.y) > 0) current.moved = true;
    setPosition(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) persist({ ...preferences, x: position.x, y: position.y });
    if (currentPriority.current === 0) setMood('idle');
  };

  const showTip = () => {
    if (currentPriority.current > 1) return;
    currentPriority.current = 1;
    setMood('thinking');
    setMessage('I react to confirmed actions and stay quiet while you work.');
    if (moodTimer.current) clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => { setMood('idle'); setMessage('Need help? I’m here.'); currentPriority.current = 0; }, 6_000);
  };

  if (!visible) return null;
  if (preferences.minimized) return <button className="mascot-dock" aria-label="Show BCIS Buddy" onClick={() => persist({ ...preferences, minimized: false })}><MascotArt mood="idle" /></button>;

  return <div ref={rootRef} className={`bcis-mascot ${reducedMotion ? 'reduced-motion' : ''}`} style={{ left: position.x, top: position.y }} onContextMenu={(event) => { event.preventDefault(); setPreferencesOpen(true); }} onPointerMove={updatePosition} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
    <div className="mascot-bubble" aria-live="polite" aria-atomic="true">{message}</div>
    <MascotArt mood={mood} />
    <div className="mascot-toolbar" role="group" aria-label="BCIS Buddy controls">
      <button aria-label="Drag BCIS Buddy" title="Drag BCIS Buddy; use arrow keys to move" onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 16;
        const offset = event.key === 'ArrowUp' ? { x: 0, y: -step } : event.key === 'ArrowDown' ? { x: 0, y: step } : event.key === 'ArrowLeft' ? { x: -step, y: 0 } : event.key === 'ArrowRight' ? { x: step, y: 0 } : null;
        if (!offset) return;
        event.preventDefault();
        const width = rootRef.current?.offsetWidth || 154;
        const height = rootRef.current?.offsetHeight || 230;
        const next = { x: Math.max(8, Math.min(innerWidth - width - 8, position.x + offset.x)), y: Math.max(8, Math.min(innerHeight - height - 8, position.y + offset.y)) };
        setPosition(next);
        persist({ ...preferences, x: next.x, y: next.y });
      }} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); const bounds = rootRef.current?.getBoundingClientRect(); if (bounds) drag.current = { pointerId: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top, moved: false }; if (currentPriority.current === 0) setMood('walking'); }}><Move aria-hidden="true" /></button>
      <button aria-label="Mascot preferences" aria-expanded={preferencesOpen} aria-controls="bcis-mascot-preferences" onClick={() => setPreferencesOpen((open) => !open)}><Accessibility aria-hidden="true" /></button>
      <button aria-label="Minimize BCIS Buddy" onClick={() => persist({ ...preferences, minimized: true })}><Minus aria-hidden="true" /></button>
    </div>
    {preferencesOpen && <section id="bcis-mascot-preferences" className="mascot-preferences" aria-label="BCIS Buddy preferences">
      <header><strong>BCIS Buddy</strong><button aria-label="Close preferences" onClick={() => setPreferencesOpen(false)}><X aria-hidden="true" /></button></header>
      <div className="mascot-sound-setting"><span>Sound feedback</span><button aria-label={preferences.soundEnabled ? 'Disable sound feedback' : 'Enable sound feedback'} aria-pressed={preferences.soundEnabled} onClick={() => {
        const enabled = !preferences.soundEnabled;
        if (enabled && typeof AudioContext !== 'undefined') { audioContext.current ??= new AudioContext(); void audioContext.current.resume().catch(() => undefined); }
        persist({ ...preferences, soundEnabled: enabled });
      }}>{preferences.soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}{preferences.soundEnabled ? 'On' : 'Off'}</button></div>
      <p>Sound is optional and muted by default. Reduced motion: {reducedMotion ? 'on' : 'off'}.</p>
      <button className="mascot-tip" onClick={showTip}>What can BCIS Buddy do?</button>
      <button className="mascot-hide" onClick={() => persist({ ...preferences, minimized: true })}>Hide Buddy</button>
    </section>}
  </div>;
}
