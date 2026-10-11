import type { MascotMood } from './mascot-model';

export function MascotCharacter({ mood, compact = false }: { mood: MascotMood; compact?: boolean }) {
  return <svg className={`mascot-art mood-${mood}${compact ? ' mascot-art-compact' : ''}`} viewBox="0 0 180 216" role="img" aria-label={`BCIS Buddy, ${mood}`}>
    <defs>
      <linearGradient id="buddy-suit" x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#2789ee" /><stop offset=".52" stopColor="#1455a4" /><stop offset="1" stopColor="#0e315f" /></linearGradient>
      <linearGradient id="buddy-cap" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#32a8ff" /><stop offset=".55" stopColor="#1472cf" /><stop offset="1" stopColor="#0b3f85" /></linearGradient>
      <linearGradient id="buddy-face" x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#e7f1ff" /></linearGradient>
      <linearGradient id="buddy-earcup" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#30baff" /><stop offset=".5" stopColor="#0877d8" /><stop offset="1" stopColor="#0751a4" /></linearGradient>
      <filter id="buddy-depth" x="-30%" y="-25%" width="160%" height="165%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#0f2747" floodOpacity=".22" /></filter>
    </defs>

    <ellipse className="mascot-shadow" cx="91" cy="204" rx="40" ry="6" fill="#0f2747" opacity=".14" />
    <g className="mascot-cape">
      <path d="M58 130Q37 139 38 176Q45 168 57 177L67 153M119 130Q140 139 142 176Q134 168 122 177L111 153" fill="#1682dd" stroke="#0f2747" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M44 159Q49 154 54 158M133 158Q138 154 141 159" fill="none" stroke="#ffd24a" strokeWidth="2.2" strokeLinecap="round" />
    </g>

    <g className="mascot-lower-body" filter="url(#buddy-depth)">
      <path className="mascot-leg mascot-leg-left" d="M66 170L60 189Q59 196 66 198L81 198L87 177Z" fill="#143e74" stroke="#0f2747" strokeWidth="2.5" />
      <path className="mascot-leg mascot-leg-right" d="M103 174L110 190Q113 196 106 198L92 198L88 178Z" fill="#143e74" stroke="#0f2747" strokeWidth="2.5" />
      <path className="mascot-boot mascot-boot-left" d="M61 190Q70 186 81 192L83 202Q82 205 77 205L55 204Q51 202 55 197Z" fill="url(#buddy-cap)" stroke="#0f2747" strokeWidth="2.5" strokeLinejoin="round" />
      <path className="mascot-boot mascot-boot-right" d="M101 191Q111 187 119 194L124 200Q124 204 118 205L96 204L94 198Z" fill="url(#buddy-cap)" stroke="#0f2747" strokeWidth="2.5" strokeLinejoin="round" />
      <path className="mascot-torso" d="M57 128Q88 116 119 129L126 169Q105 181 75 177Q61 175 53 168Z" fill="url(#buddy-suit)" stroke="#0f2747" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M75 131Q89 138 103 131L108 169Q91 175 70 168Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="2" strokeLinejoin="round" />
      <path d="M79 148Q89 139 99 148M82 155Q89 149 96 155M86 162Q89 159 92 162" fill="none" stroke="#1188df" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="89" cy="132" r="3" fill="#ffd24a" stroke="#0f2747" strokeWidth="1.5" />
      <g className="mascot-arm mascot-arm-left"><path d="M57 145Q48 147 45 158L40 153Q37 150 34 153Q31 157 36 162L46 171Q51 174 56 167L68 157Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="2.5" strokeLinejoin="round" /><path d="M39 157Q44 154 49 158L53 165Q51 169 47 168L39 164Q36 162 39 157Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="1.8" /></g>
      <g className="mascot-arm mascot-arm-right"><path d="M119 145Q129 146 132 158L138 153Q141 150 144 154Q147 158 142 163L132 172Q127 175 122 168L110 158Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="2.5" strokeLinejoin="round" /><path d="M137 158Q142 154 145 158L143 164L135 168Q131 169 130 165Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="1.8" /></g>
      <path d="M63 170Q68 174 74 174M105 174Q111 174 116 170" fill="none" stroke="#49b8ff" strokeWidth="2" strokeLinecap="round" opacity=".8" />
    </g>

    <g className="mascot-head" filter="url(#buddy-depth)">
      <path d="M42 72Q48 45 69 39Q91 31 112 42Q132 53 136 79L130 109Q123 131 91 133Q58 132 48 111Z" fill="url(#buddy-face)" stroke="#0f2747" strokeWidth="2.8" />
      <path d="M42 71Q35 74 35 88Q35 101 44 105M137 72Q144 75 144 88Q144 101 135 105" fill="none" stroke="#0f2747" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M36 79Q28 81 29 92Q30 103 39 104L43 101L43 80Z" fill="url(#buddy-earcup)" stroke="#0f2747" strokeWidth="2.5" />
      <path d="M143 79Q151 81 150 92Q149 103 140 104L136 101L136 80Z" fill="url(#buddy-earcup)" stroke="#0f2747" strokeWidth="2.5" />
      <ellipse cx="36" cy="92" rx="3.5" ry="7" fill="#9ee7ff" opacity=".85" />
      <ellipse cx="143" cy="92" rx="3.5" ry="7" fill="#9ee7ff" opacity=".85" />
      <g className="mascot-face">
        <path d="M58 82Q66 77 73 82M105 82Q113 77 121 82" fill="none" stroke="#0f2747" strokeWidth="3" strokeLinecap="round" />
        <ellipse className="mascot-eye eye-left" cx="67" cy="94" rx="7.4" ry="10" fill="#1472b9" stroke="#0f2747" strokeWidth="1.7" />
        <ellipse className="mascot-eye eye-right" cx="113" cy="94" rx="7.4" ry="10" fill="#1472b9" stroke="#0f2747" strokeWidth="1.7" />
        <ellipse cx="69" cy="91" rx="2.4" ry="3.2" fill="#fff" /><ellipse cx="115" cy="91" rx="2.4" ry="3.2" fill="#fff" />
        <ellipse cx="53" cy="105" rx="6" ry="2.8" fill="#f58d83" opacity=".46" /><ellipse cx="127" cy="105" rx="6" ry="2.8" fill="#f58d83" opacity=".46" />
        <path className="mascot-mouth" d="M81 105Q90 112 99 105Q98 117 90 118Q82 117 81 105Z" fill="#db554b" stroke="#0f2747" strokeWidth="1.4" />
      </g>
      <path d="M43 71Q40 53 53 42Q64 32 90 32Q119 32 132 48Q138 57 135 75L126 81Q91 65 49 81Z" fill="url(#buddy-cap)" stroke="#0f2747" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M49 72Q86 60 131 75Q140 78 136 84Q92 70 47 85Z" fill="#22a6f2" stroke="#0f2747" strokeWidth="2" strokeLinejoin="round" />
      <path d="M79 47Q90 38 101 47M83 51Q90 45 97 51M87 55Q90 52 93 55" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <text x="90" y="67" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800" fontFamily="Inter, Segoe UI, sans-serif" letterSpacing=".5">BCIS</text>
      <path d="M127 62Q135 66 141 72" fill="none" stroke="#ffd24a" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>;
}
