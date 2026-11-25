// رسومات LUNÉ الأصلية (SVG) — هلال وزجاجات طلاء
let uid = 0;

export function bottle(c1 = '#E8C5BE', c2 = '#C98F8A', cap = '#2A1F22') {
  const id = 'b' + (++uid);
  return `<svg viewBox="0 0 120 200" width="120" height="200" class="bottle" aria-hidden="true">
  <defs>
    <linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
    <linearGradient id="${id}c" x1="0" x2="1"><stop offset="0" stop-color="${cap}"/><stop offset=".45" stop-color="#6b5a5e"/><stop offset="1" stop-color="${cap}"/></linearGradient>
  </defs>
  <ellipse cx="60" cy="190" rx="44" ry="6" fill="#000" opacity=".08"/>
  <rect x="44" y="8" width="32" height="72" rx="6" fill="url(#${id}c)"/>
  <rect x="50" y="14" width="4" height="58" rx="2" fill="#fff" opacity=".28"/>
  <rect x="38" y="78" width="44" height="12" rx="3" fill="${cap}" opacity=".9"/>
  <rect x="16" y="88" width="88" height="100" rx="24" fill="url(#${id}g)"/>
  <rect x="16" y="88" width="88" height="100" rx="24" fill="none" stroke="#fff" stroke-opacity=".5"/>
  <rect x="27" y="100" width="9" height="72" rx="4.5" fill="#fff" opacity=".45"/>
  <rect x="88" y="110" width="4" height="50" rx="2" fill="#fff" opacity=".25"/>
</svg>`;
}

const SHADES = [['#F1D9D2', '#D9AFA6'], ['#F6E3DF', '#E7BFC3'], ['#EBD3C3', '#C99C86'], ['#F3D6DA', '#C97F8E'], ['#EDE0D9', '#BFA597'], ['#F7E7E3', '#DDB2AE']];
export function placeholder(seed = '') {
  let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = SHADES[h % SHADES.length];
  return `<div class="ph">${bottle(a, b)}</div>`;
}

export function heroArt() {
  return `<svg viewBox="0 0 600 560" class="hero-svg" role="img" aria-label="زجاجات طلاء أظافر أمام هلال">
  <defs>
    <radialGradient id="hm" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FBECEC"/><stop offset=".6" stop-color="#F2D3D3"/><stop offset="1" stop-color="#E7BDBF"/></radialGradient>
    <mask id="hcres"><rect width="600" height="560" fill="#fff"/><circle cx="392" cy="198" r="186" fill="#000"/></mask>
    <linearGradient id="hp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3E6DE"/><stop offset="1" stop-color="#E4CFC2"/></linearGradient>
    <linearGradient id="hpt" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1E2D9"/></linearGradient>
  </defs>
  <circle cx="300" cy="250" r="225" fill="url(#hm)" mask="url(#hcres)"/>
  <circle cx="300" cy="250" r="225" fill="none" stroke="#fff" stroke-opacity=".7" mask="url(#hcres)"/>
  <g fill="#C98A93" opacity=".55">
    <path d="M470 90l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/>
    <path d="M520 190l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/>
    <path d="M110 120l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/>
  </g>
  <ellipse cx="300" cy="470" rx="230" ry="34" fill="#000" opacity=".06"/>
  <rect x="80" y="420" width="440" height="56" rx="28" fill="url(#hp)"/>
  <rect x="80" y="420" width="440" height="22" rx="11" fill="url(#hpt)"/>
  <g transform="translate(95 185) scale(1.25)">${bottle('#F3DCD6', '#D7A9A1')}</g>
  <g transform="translate(195 91) scale(1.75)">${bottle('#F2D3D8', '#C47A8A')}</g>
  <g transform="translate(372 204) scale(1.15)">${bottle('#EEDCCD', '#C6A08A')}</g>
</svg>`;
}
