import { useId, useLayoutEffect, useRef } from 'react';
import type { MascotMood } from './mascot-model';
import type { MascotAnimationName } from './mascot-animation';
import type { MascotIdleBehavior } from './mascot-behavior';

function WifiMark() {
  return <g className="buddy-wifi-mark" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M-7 0a10 10 0 0 1 14 0M-4 3a5.7 5.7 0 0 1 8 0M-1 6a1.5 1.5 0 0 1 2 0" /></g>;
}

function Cap({ shadeId }: { shadeId: string }) {
  return <g className="buddy-cap" stroke="#153b68" strokeLinejoin="round" strokeWidth="2.35">
    <path d="M47 65c1-16 12-26 25-30 13-4 29-3 40 3 11 6 17 16 18 29l-8 8H53z" fill={`url(#${shadeId})`} />
    <path d="M53 65c22-8 52-8 78-1 7 2 9 7 2 10-23-5-50-5-80 3-9 1-12-5-4-8z" fill="#69caff" />
    <path d="M67 61q23-9 48-1" fill="none" stroke="#a9e6ff" strokeLinecap="round" strokeWidth="1.4" />
    <g transform="translate(88 47)" color="#e7f8ff" stroke="none"><WifiMark /></g>
    <text x="88" y="67" fill="#f5fbff" stroke="none" textAnchor="middle" fontFamily="Inter, Segoe UI, sans-serif" fontSize="7.4" fontWeight="800" letterSpacing=".75">BCIS</text>
    <path d="M54 74q32-7 72-1" fill="none" stroke="#0e4a8c" strokeLinecap="round" strokeWidth="1.3" />
  </g>;
}

function Headphones() {
  return <g className="buddy-headphones" stroke="#12365d" strokeLinejoin="round">
    <path d="M42 85V75c0-25 19-41 46-41s46 16 46 41v10" fill="none" stroke="#12365d" strokeLinecap="round" strokeWidth="5.5" />
    <path d="M44 72h8v31h-8c-5 0-8-4-8-9V81c0-5 3-9 8-9m88 0h-8v31h8c5 0 8-4 8-9V81c0-5-3-9-8-9" fill="#2489e7" strokeWidth="2.2" />
    <path d="M44 79h3v16h-3c-2 0-3-2-3-4v-8c0-2 1-4 3-4m88 0h-3v16h3c2 0 3-2 3-4v-8c0-2-1-4-3-4" fill="#8edcff" stroke="none" />
    <path d="M45 75v6m86-6v6" stroke="#d9f6ff" strokeLinecap="round" strokeWidth="1.5" />
  </g>;
}

function Eyes({ lidId, happy }: { lidId: string; happy: boolean }) {
  return <g className="buddy-eyes">
    <g className="buddy-eyebrows">
    <path className="buddy-brow buddy-brow-left" d="M57 91q9-7 19-1" fill="none" stroke="#183c67" strokeLinecap="round" strokeWidth="3" />
    <path className="buddy-brow buddy-brow-right" d="M101 90q10-6 19 1" fill="none" stroke="#183c67" strokeLinecap="round" strokeWidth="3" />
    </g>
    <g className="buddy-eye buddy-eye-left">
      <ellipse cx="68" cy="105" rx="9.7" ry="12.7" fill="#fff" stroke="#264a70" strokeWidth="1.35" />
      <g className="buddy-iris"><ellipse cx="69" cy="107" rx="6.2" ry="8.1" fill="#2185dd" /><ellipse cx="69" cy="109" rx="3.2" ry="4.8" fill="#172f51" /><circle cx="71" cy="103" r="2.3" fill="#fff" /><circle cx="66" cy="111" r="1.05" fill="#bceaff" /></g>
      <path className="buddy-lid" d="M58 96q10-9 20 0v16q-10 7-20 0z" fill={`url(#${lidId})`} />
    </g>
    <g className="buddy-eye buddy-eye-right">
      <ellipse cx="108" cy="105" rx="9.7" ry="12.7" fill="#fff" stroke="#264a70" strokeWidth="1.35" />
      <g className="buddy-iris"><ellipse cx="107" cy="107" rx="6.2" ry="8.1" fill="#2185dd" /><ellipse cx="107" cy="109" rx="3.2" ry="4.8" fill="#172f51" /><circle cx="109" cy="103" r="2.3" fill="#fff" /><circle cx="104" cy="111" r="1.05" fill="#bceaff" /></g>
      <path className="buddy-lid" d="M98 96q10-9 20 0v16q-10 7-20 0z" fill={`url(#${lidId})`} />
    </g>
    {happy && <g className="buddy-happy-eyes" fill="none" stroke="#183c67" strokeLinecap="round" strokeWidth="3.1"><path d="M58 106q10-13 20 0" /><path d="M98 106q10-13 20 0" /></g>}
    <ellipse cx="51" cy="119" rx="7" ry="3.5" fill="#fa9b97" opacity=".36" /><ellipse cx="125" cy="119" rx="7" ry="3.5" fill="#fa9b97" opacity=".36" />
  </g>;
}

function Face({ mood, lidId }: { mood: MascotMood; lidId: string }) {
  const concerned = mood === 'concerned';
  const surprised = mood === 'surprised';
  const sleepy = mood === 'sleepy';
  return <g className={`buddy-face mood-face-${mood}`}>
    <path className="buddy-face-outline" d="M45 80c4-20 19-31 42-32 24-1 42 11 47 31l-1 31c-1 20-16 35-44 36-27 0-42-14-44-34z" fill="#fff8f0" stroke="#183b65" strokeLinejoin="round" strokeWidth="2.4" />
    <path d="M50 83c4-18 18-27 38-29 20-1 35 8 41 26l-1 7c-12-5-24-7-39-7-14 0-27 3-39 9z" fill="#fff" opacity=".66" />
    <Eyes lidId={lidId} happy={mood === 'happy'} />
    <path className="buddy-mouth" d={surprised ? 'M84 125c0-5 4-8 8-8s8 3 8 8-4 8-8 8-8-3-8-8' : concerned ? 'M83 129q9-9 18 0' : sleepy ? 'M85 127q7 2 13 0' : 'M80 122q12 12 24 0c-2 10-8 15-13 15s-9-5-11-15'} fill={surprised || sleepy || concerned ? 'none' : '#cf5465'} stroke="#183b65" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    {!surprised && !sleepy && !concerned && <path d="M86 130q6 4 12 0" fill="none" stroke="#f6a1a1" strokeLinecap="round" strokeWidth="1.4" />}
    <path className="buddy-sleep-mark" d="M131 42h10m-6-4 5 4-5 4m6-10h7" fill="none" stroke="#1682dd" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    {mood === 'thinking' && <g className="buddy-thinking-face-hand">
      <path d="M115 153q8 1 12 9l9 17q-4 5-10 4l-10-14-6-10z" fill="#1d6dbb" stroke="#173b64" strokeLinejoin="round" strokeWidth="2" />
      <path d="M118 165q-1-13-8-22l-9-10q-3-4-5-1t2 7l4 6q-5-4-7-1-2 2 2 6l8 11q5 5 13 4z" fill="#fff5e6" stroke="#173b64" strokeLinejoin="round" strokeWidth="2" />
      <path d="M116 165q-1-12-7-20" fill="none" stroke="#e1bc99" strokeLinecap="round" strokeWidth="1.3" />
    </g>}
  </g>;
}

function Head({ mood, shadeId, lidId }: { mood: MascotMood; shadeId: string; lidId: string }) {
  return <g className="buddy-head"><g className="buddy-head-ambient"><g className="buddy-head-turn"><Headphones /><Face mood={mood} lidId={lidId} /><Cap shadeId={shadeId} /></g></g></g>;
}

function Hand({ side, mood }: { side: 'left' | 'right'; mood: MascotMood }) {
  const left = side === 'left';
  const armColor = left ? '#258be1' : '#1d6dbb';
  return <g className={`buddy-shoulder-ambient buddy-shoulder-ambient-${side}`}><g className={`buddy-shoulder buddy-shoulder-${side}`}>
    <g className="buddy-side-art" transform={left ? undefined : 'translate(180 0) scale(-1 1)'}>
      <g className="buddy-upper-arm">
        <path d="M64 151q7-3 13 3l-10 13q-5 5-11 2l-5-5q4-9 13-13z" fill={armColor} stroke="#173b64" strokeLinejoin="round" strokeWidth="2.15" />
        <path d="M57 163q5 1 9 5" fill="none" stroke="#78c3f0" strokeLinecap="round" strokeWidth="1.35" />
      </g>
      <g className={`buddy-elbow buddy-elbow-${side}`}>
        <path d="M59 163q5 1 8 5l-8 12q-4 3-9 0l-4-4q3-8 13-13z" fill={armColor} stroke="#173b64" strokeLinejoin="round" strokeWidth="2.05" />
        <path d="M49 175q5 2 10 0" fill="none" stroke="#8ed4fa" strokeLinecap="round" strokeWidth="1.25" />
        <g className={`buddy-wrist buddy-wrist-${side}`}>
          <g className="buddy-hand-base">
            <path className="buddy-glove" d="M56 168q-5-1-7 3l-3 7q-1 4 3 5l3-2q-1 5 3 5 3 0 4-3 2 3 5 1 2-1 1-4 4 1 5-3l-2-7q-2-4-7-2z" fill="#fff5e6" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.8" />
          </g>
          {left && <g className="buddy-wave-hand"><path d="M55 173q-5-2-6-8l-1-8q1-4 4-3l3 9-1-10q1-4 4-3l2 11 1-8q2-3 4 0l1 9 3-5q3-2 4 1l-3 10q-2 7-9 8z" fill="#fff5e6" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.8" /></g>}
          {!left && mood === 'celebrating' && <g className="buddy-thumbs-up"><path d="M58 165l4-13q2-5 5-3l2 8q7-4 11 0l-2 12q-1 4-6 5l-10-1z" fill="#fff5e6" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.8" /></g>}
        </g>
      </g>
    </g>
  </g></g>;
}

function Body({ mood }: { mood: MascotMood }) {
  return <g className="buddy-body">
    <path className="buddy-cape" d="M57 145q-13 9-13 34l14-6 10-19m48-9q14 9 14 33l-13-6-10-18" fill="#258be1" stroke="#173b64" strokeLinejoin="round" strokeWidth="2.2" />
    <path className="buddy-uniform" d="M62 140q27-13 54 0l10 35q-7 9-37 9t-37-9z" fill="#1762ac" stroke="#173b64" strokeLinejoin="round" strokeWidth="2.4" />
    <path d="M71 139l18 9 18-9-5 15H76z" fill="#e9f7ff" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.65" />
    <path d="M89 150v24" stroke="#9dc8ea" strokeWidth="1.25" />
    <circle cx="92" cy="158" r="1.15" fill="#ffd66d" /><circle cx="92" cy="165" r="1.15" fill="#ffd66d" />
    <g className="buddy-chest-badge" transform="translate(107 160) scale(.67)" color="#b9efff">
      <circle r="11" fill="#124c88" stroke="#6cbbe9" strokeWidth="1.3" /><g transform="translate(0 -1)" stroke="currentColor" strokeWidth="1.8"><WifiMark /></g>
    </g>
    <path d="M64 146q-4 3-6 9m65-9q4 3 6 9" fill="none" stroke="#71b9ed" strokeLinecap="round" strokeWidth="1.2" />
    {mood === 'processing' && <g className="buddy-workpad"><rect x="69" y="153" width="40" height="24" rx="4" fill="#0d3157" stroke="#173b64" strokeWidth="2" /><rect x="73" y="157" width="32" height="16" rx="2" fill="#bceeff" /><path d="M66 179h47l-4 4H70z" fill="#cfdae3" stroke="#173b64" strokeWidth="1.4" /></g>}
    <path className="buddy-hem" d="M65 176q24 8 48 0" fill="none" stroke="#5ba4dd" strokeLinecap="round" strokeWidth="1.35" />
  </g>;
}

function Legs() {
  return <g className="buddy-legs">
    <g className="buddy-hip buddy-hip-left"><path d="M72 177h13v8H72z" fill="#245483" /><g className="buddy-knee buddy-knee-left"><path d="M72 184h13v8H72z" fill="#245483" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.8" /><g className="buddy-ankle buddy-ankle-left"><path d="M72 190h13v5H72z" fill="#245483" stroke="#173b64" strokeWidth="1.6" /><g className="buddy-foot buddy-foot-left"><path d="M69 192q8-3 17 1l3 7q0 4-5 4H64q-4-2-2-6z" fill="#1262b2" stroke="#173b64" strokeLinejoin="round" strokeWidth="2.2" /><path d="M65 199q10 2 21 0" fill="none" stroke="#78caff" strokeLinecap="round" strokeWidth="1.35" /></g></g></g><ellipse cx="78" cy="177" rx="6" ry="2" fill="#3989cc" /></g>
    <g className="buddy-hip buddy-hip-right"><path d="M94 177h13v8H94z" fill="#245483" /><g className="buddy-knee buddy-knee-right"><path d="M94 184h13v8H94z" fill="#245483" stroke="#173b64" strokeLinejoin="round" strokeWidth="1.8" /><g className="buddy-ankle buddy-ankle-right"><path d="M94 190h13v5H94z" fill="#245483" stroke="#173b64" strokeWidth="1.6" /><g className="buddy-foot buddy-foot-right"><path d="M93 193q8-4 17 0l6 6q1 4-4 5H91q-4-2-2-6z" fill="#1262b2" stroke="#173b64" strokeLinejoin="round" strokeWidth="2.2" /><path d="M92 200q10 2 21 0" fill="none" stroke="#78caff" strokeLinecap="round" strokeWidth="1.35" /></g></g></g><ellipse cx="100" cy="177" rx="6" ry="2" fill="#3989cc" /></g>
  </g>;
}

function CharacterArt({ mood, shadeId, lidId }: { mood: MascotMood; shadeId: string; lidId: string }) {
  return <>
    <ellipse className="buddy-shadow" cx="90" cy="208" rx="36" ry="4" fill="#102a47" opacity=".15" />
    <g className="buddy-life-motion"><g className="buddy-body-root"><g className="buddy-action-pose">
      <Legs />
      <g className="buddy-torso-rig"><g className="buddy-torso-ambient"><Body mood={mood} /><g className="buddy-shoulders"><Hand side="left" mood={mood} /><Hand side="right" mood={mood} /></g></g></g>
      <g className="buddy-neck"><g className="buddy-head-pivot"><Head mood={mood} shadeId={shadeId} lidId={lidId} /></g></g>
      {mood === 'celebrating' && <g className="buddy-success-check"><circle cx="139" cy="128" r="8" fill="#159b77" /><path d="M135 128l3 3 5-6" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></g>}
    </g></g></g>
  </>;
}

export function MascotCharacter({ mood, animation = 'idle', animationRequestId = 0, idleBehavior = null, compact = false, paused = false, reducedMotion = false, handingOff = false }: { mood: MascotMood; animation?: MascotAnimationName; animationRequestId?: number; idleBehavior?: MascotIdleBehavior | null; compact?: boolean; paused?: boolean; reducedMotion?: boolean; handingOff?: boolean }) {
  const id = useId().replaceAll(':', '');
  const shadeId = `${id}-cap-shade`;
  const lidId = `${id}-lid-shade`;
  const artRef = useRef<SVGSVGElement>(null);
  const previousRequest = useRef({ animation, requestId: animationRequestId });

  useLayoutEffect(() => {
    const previous = previousRequest.current;
    previousRequest.current = { animation, requestId: animationRequestId };
    if (previous.animation !== animation || previous.requestId === animationRequestId) return;
    for (const runningAnimation of artRef.current?.getAnimations({ subtree: true }) ?? []) {
      runningAnimation.currentTime = 0;
      runningAnimation.play();
    }
  }, [animation, animationRequestId]);

  return <svg ref={artRef} className={`mascot-art mood-${mood} anim-${animation}${idleBehavior ? ` ambient-${idleBehavior}` : ''}${compact ? ' mascot-art-compact' : ''}${paused ? ' is-paused' : ''}${reducedMotion ? ' is-reduced-motion' : ''}${handingOff ? ' is-handing-off' : ''}`} viewBox="0 0 180 216" role="img" aria-hidden={compact || undefined} aria-label={`BCIS Buddy, ${mood}`}>
    <defs>
      <linearGradient id={shadeId} x1=".15" y1="0" x2=".8" y2="1"><stop stopColor="#53baff" /><stop offset=".52" stopColor="#1674c9" /><stop offset="1" stopColor="#14529b" /></linearGradient>
      <linearGradient id={lidId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff8f0" /><stop offset="1" stopColor="#f0d8c8" /></linearGradient>
    </defs>
    <g className="buddy-character"><CharacterArt mood={mood} shadeId={shadeId} lidId={lidId} /></g>
  </svg>;
}
