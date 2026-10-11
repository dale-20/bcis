import type { MascotMood } from './mascot-model';

function Cap() {
  return <g className="buddy-cap">
    <path d="M43 72Q40 53 53 42Q64 32 90 32Q119 32 132 48Q138 57 135 75L126 81Q91 65 49 81Z" fill="#1472cf" stroke="#0b315e" strokeWidth="3" strokeLinejoin="round" />
    <path d="M49 72Q86 60 131 75Q140 78 136 84Q92 70 47 85Z" fill="#22a6f2" stroke="#0b315e" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M79 48Q90 39 101 48M83 52Q90 46 97 52M87 56Q90 53 93 56" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
    <text x="90" y="68" textAnchor="middle" fill="white" fontSize="10" fontWeight="800" fontFamily="Inter, Segoe UI, sans-serif" letterSpacing=".5">BCIS</text>
  </g>;
}

function Headphones() {
  return <g className="buddy-headphones">
    <path d="M42 72Q35 75 35 89Q35 102 44 105M137 72Q144 75 144 89Q144 102 135 105" fill="none" stroke="#0b315e" strokeWidth="6" strokeLinecap="round" />
    <path d="M36 79Q28 81 29 92Q30 103 39 104L43 101L43 80ZM143 79Q151 81 150 92Q149 103 140 104L136 101L136 80Z" fill="#0877d8" stroke="#0b315e" strokeWidth="2.5" />
    <ellipse cx="36" cy="92" rx="3.5" ry="7" fill="#9ee7ff" /><ellipse cx="143" cy="92" rx="3.5" ry="7" fill="#9ee7ff" />
  </g>;
}

function Eyes() {
  return <g className="buddy-eyes">
    <path className="buddy-brows" d="M58 82Q66 77 73 82M105 82Q113 77 121 82" fill="none" stroke="#0b315e" strokeWidth="3" strokeLinecap="round" />
    <g className="buddy-eye buddy-eye-left"><ellipse cx="67" cy="94" rx="7.4" ry="10" fill="#1472b9" stroke="#0b315e" strokeWidth="1.7" /><ellipse cx="69" cy="91" rx="2.4" ry="3.2" fill="white" /></g>
    <g className="buddy-eye buddy-eye-right"><ellipse cx="113" cy="94" rx="7.4" ry="10" fill="#1472b9" stroke="#0b315e" strokeWidth="1.7" /><ellipse cx="115" cy="91" rx="2.4" ry="3.2" fill="white" /></g>
    <g className="buddy-eyelids"><path className="buddy-eyelid buddy-eyelid-left" d="M59 91Q67 84 75 91V96H59Z" /><path className="buddy-eyelid buddy-eyelid-right" d="M105 91Q113 84 121 91V96H105Z" /></g>
    <ellipse cx="53" cy="105" rx="6" ry="2.8" fill="#f58d83" opacity=".46" /><ellipse cx="127" cy="105" rx="6" ry="2.8" fill="#f58d83" opacity=".46" />
  </g>;
}

function Face({ mood }: { mood: MascotMood }) {
  return <g className="buddy-face">
    <path className="buddy-face-shape" d="M42 72Q48 45 69 39Q91 31 112 42Q132 53 136 79L130 109Q123 131 91 133Q58 132 48 111Z" fill="#f5f9ff" stroke="#0b315e" strokeWidth="2.8" />
    <Eyes />
    {mood === 'thinking' && <g className="buddy-thinking-mark"><circle cx="136" cy="42" r="10" fill="#00a68a" /><text x="136" y="47" fill="white" fontSize="14" fontWeight="800" textAnchor="middle">?</text></g>}
    <path className={`buddy-mouth mouth-${mood}`} d={mood === 'sleepy' ? 'M84 110Q90 112 96 110' : mood === 'concerned' ? 'M82 113Q90 106 98 113' : mood === 'surprised' ? 'M86 108Q90 104 94 108Q98 116 90 119Q82 116 86 108Z' : 'M81 105Q90 112 99 105Q98 117 90 118Q82 117 81 105Z'} fill={mood === 'sleepy' || mood === 'concerned' ? 'none' : '#db554b'} stroke="#0b315e" strokeWidth="1.6" strokeLinecap="round" />
  </g>;
}

function Head({ mood }: { mood: MascotMood }) {
  return <g className="buddy-head">
    <Face mood={mood} />
    <Headphones />
    <Cap />
  </g>;
}

function Gloves() {
  return <g className="buddy-hands" fill="#f5f9ff" stroke="#0b315e" strokeWidth="2" strokeLinejoin="round">
    <path className="buddy-hand buddy-hand-left" d="M40 153Q36 149 33 153Q30 157 35 162L46 171Q51 174 56 167L68 157L57 145Q48 147 45 158Z" />
    <path className="buddy-hand buddy-hand-right" d="M138 153Q142 150 145 154Q148 158 143 163L132 172Q127 175 122 168L110 158L119 145Q129 146 132 158Z" />
  </g>;
}

function Arms() {
  return <g className="buddy-arms" fill="none" stroke="#0b315e" strokeWidth="7" strokeLinecap="round">
    <path className="buddy-arm buddy-arm-left" d="M60 143Q49 149 47 160" />
    <path className="buddy-arm buddy-arm-right" d="M119 143Q130 149 132 160" />
  </g>;
}

function Body() {
  return <g className="buddy-body">
    <path className="buddy-cape" d="M58 130Q37 139 38 176Q45 168 57 177L67 153M119 130Q140 139 142 176Q134 168 122 177L111 153" fill="#1682dd" stroke="#0b315e" strokeWidth="2.5" strokeLinejoin="round" />
    <path className="buddy-uniform" d="M57 128Q88 116 119 129L126 169Q105 181 75 177Q61 175 53 168Z" fill="#1455a4" stroke="#0b315e" strokeWidth="2.8" strokeLinejoin="round" />
    <path d="M75 131Q89 138 103 131L108 169Q91 175 70 168Z" fill="#edf6ff" stroke="#0b315e" strokeWidth="2" strokeLinejoin="round" />
    <path className="buddy-uniform-mark" d="M79 148Q89 139 99 148M82 155Q89 149 96 155M86 162Q89 159 92 162" fill="none" stroke="#1188df" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="89" cy="132" r="3" fill="#ffd24a" stroke="#0b315e" strokeWidth="1.5" />
    <Arms /><Gloves />
  </g>;
}

function Legs() {
  return <g className="buddy-legs">
    <path className="buddy-leg buddy-leg-left" d="M66 170L60 189Q59 196 66 198L81 198L87 177Z" fill="#143e74" stroke="#0b315e" strokeWidth="2.5" />
    <path className="buddy-leg buddy-leg-right" d="M103 174L110 190Q113 196 106 198L92 198L88 178Z" fill="#143e74" stroke="#0b315e" strokeWidth="2.5" />
    <path className="buddy-foot buddy-foot-left" d="M61 190Q70 186 81 192L83 202Q82 205 77 205L55 204Q51 202 55 197Z" fill="#1472cf" stroke="#0b315e" strokeWidth="2.5" strokeLinejoin="round" />
    <path className="buddy-foot buddy-foot-right" d="M101 191Q111 187 119 194L124 200Q124 204 118 205L96 204L94 198Z" fill="#1472cf" stroke="#0b315e" strokeWidth="2.5" strokeLinejoin="round" />
  </g>;
}

function CharacterArt() {
  return <>
    <ellipse className="buddy-shadow" cx="91" cy="204" rx="40" ry="6" fill="#0f2747" opacity=".14" />
    <Legs /><Body />
  </>;
}

export function MascotCharacter({ mood, compact = false }: { mood: MascotMood; compact?: boolean }) {
  return <svg className={`mascot-art mood-${mood}${compact ? ' mascot-art-compact' : ''}`} viewBox="0 0 180 216" role="img" aria-hidden={compact || undefined} aria-label={`BCIS Buddy, ${mood}`}>
    <defs>
      <linearGradient id="buddy-depth" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#0b315e" stopOpacity=".08" /></linearGradient>
    </defs>
    <g className="buddy-character"><CharacterArt /><Head mood={mood} /></g>
  </svg>;
}
