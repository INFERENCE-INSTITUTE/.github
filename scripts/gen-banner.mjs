/**
 * Generates the animated banner for the organisation profile.
 *
 *   node scripts/gen-banner.mjs
 *
 * Two SVGs, one per colour scheme, written to profile/assets/. The README
 * picks between them with <picture> and prefers-color-scheme.
 *
 * Why a generator rather than a hand-written SVG: the type is real Jost and
 * real IBM Plex Mono, baked to outlines. GitHub serves README images through a
 * proxy and renders them as documents, which means no webfont ever loads — a
 * banner with <text> in it is a banner set in whatever the reader happens to
 * have. Outlines are the only way the wordmark is the wordmark.
 *
 * Everything that moves is CSS inside the SVG. Animation works in an <img>;
 * script does not, and would be stripped anyway.
 *
 * The idea being drawn is the one the mark encodes: signal read out of noise.
 * A field of dots sits at rest, a scan passes across it, and what the scan
 * touches resolves. Nothing decorative is doing anything else.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import opentype from 'opentype.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'profile', 'assets');
mkdirSync(OUT, { recursive: true });

/* ---- the palette, from src/styles/tokens.css in the site repo ---------- */
const INK = '#0A0E14';
const PAPER = '#FAFAFA';

const W = 1280;
const H = 420;

/* ---- type ------------------------------------------------------------- */
const FONT_SOURCE = `Fonts are not committed. Fetch them into .build/ first:

  mkdir -p .build
  curl -sL -o .build/jost-400.ttf       "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJQVG.ttf"
  curl -sL -o .build/plex-mono-400.ttf  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf"

(The current URLs come from: curl -H "User-Agent: Mozilla/4.0" \
  "https://fonts.googleapis.com/css2?family=Jost:wght@400&family=IBM+Plex+Mono:wght@400")`;

function load(file) {
  let buf;
  try {
    buf = readFileSync(join(ROOT, '.build', file));
  } catch {
    console.error(`Missing .build/${file}\n\n${FONT_SOURCE}`);
    process.exit(1);
  }
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const jost = load('jost-400.ttf');
const mono = load('plex-mono-400.ttf');

/**
 * Serialise a glyph outline ourselves.
 *
 * opentype's own `toPathData(2)` emits `NaN` for some coordinates in this
 * font — the commands it produces are clean, the formatting of them is not —
 * and a single NaN makes the browser abandon the rest of the `d` attribute, so
 * the strapline rendered as far as "ENTERPRISE AI ARCHITECT" and stopped. This
 * is fifteen lines and it is correct.
 */
const round = (v) => String(Math.round(v * 100) / 100);
function toD(outline) {
  return outline.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
          return `M${round(c.x)} ${round(c.y)}`;
        case 'L':
          return `L${round(c.x)} ${round(c.y)}`;
        case 'C':
          return `C${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`;
        case 'Q':
          return `Q${round(c.x1)} ${round(c.y1)} ${round(c.x)} ${round(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

const path = (font, text, x, y, size) => toD(font.getPath(text, x, y, size));
const width = (font, text, size) => font.getAdvanceWidth(text, size);

/** Mono with tracking, letter by letter, the way the site sets metadata. */
function tracked(font, text, x, y, size, tracking) {
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    if (ch !== ' ') parts.push(path(font, ch, cursor, y, size));
    cursor += width(font, ch, size) + tracking;
  }
  return { d: parts.join(' '), width: cursor - tracking - x };
}

/**
 * The stacked lockup: two nine-letter words justified to a shared measure.
 *
 * The wider word sets the width and keeps its base tracking; the narrower one
 * has the slack shared out between its letters, so both lines start and finish
 * on the same two verticals. This is the same rule the site's Wordmark
 * component implements in flexbox — here it has to be arithmetic, because an
 * SVG has no layout engine.
 */
function lockup(x, y, size, leading) {
  const words = ['INFERENCE', 'INSTITUTE'];
  const base = size * 0.17; // the site's --ls-lockup
  const glyphs = words.map((w) => [...w].reduce((sum, ch) => sum + width(jost, ch, size), 0));
  const measure = Math.max(...glyphs) + base * 8;

  const parts = [];
  words.forEach((word, row) => {
    const gap = (measure - glyphs[row]) / (word.length - 1);
    let cursor = x;
    for (const ch of word) {
      parts.push(path(jost, ch, cursor, y + row * leading, size));
      cursor += width(jost, ch, size) + gap;
    }
  });
  return { d: parts.join(' '), width: measure };
}

/* ---- the mark, traced from BrandMark.astro ----------------------------- */
const BARS = [
  [6, 2, 12, 12], [6, 28, 12, 68],
  [28, 28, 7, 68], [42, 28, 5, 68], [54, 28, 10, 68], [71, 28, 12, 68],
  [90, 28, 7, 68], [104, 28, 5, 68], [116, 28, 9, 68],
  [132, 2, 12, 12], [132, 28, 12, 68],
];

/** Deterministic, so the field is identical on every regeneration. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function build({ ground, figure, name }) {
  const rand = seeded(11);

  /* The field. Two copies of the same dots: one at rest, one bright and
     masked, so the scan appears to resolve what it passes over. */
  const dots = [];
  const step = 26;
  for (let x = step; x < W; x += step) {
    for (let y = step; y < H; y += step) {
      dots.push({
        // Enough jitter that the mesh reads as a neighbourhood rather than as
        // graph paper. On a regular grid the links all run at right angles and
        // the whole field looks like a table.
        x: x + (rand() - 0.5) * 19,
        y: y + (rand() - 0.5) * 19,
        r: 0.9 + rand() * 1.5,
      });
    }
  }
  const field = (opacity, cls) =>
    `<g fill="${figure}" opacity="${opacity}"${cls ? ` class="${cls}"` : ''}>` +
    dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(2)}"/>`).join('') +
    '</g>';

  /* A sparse mesh, so the field reads as structure rather than as texture. */
  const links = [];
  for (let i = 0; i < dots.length; i += 1) {
    for (let j = i + 1; j < dots.length; j += 1) {
      const dx = dots[i].x - dots[j].x;
      const dy = dots[i].y - dots[j].y;
      if (dx * dx + dy * dy < step * step * 1.15) {
        links.push(
          `<line x1="${dots[i].x.toFixed(1)}" y1="${dots[i].y.toFixed(1)}" x2="${dots[j].x.toFixed(1)}" y2="${dots[j].y.toFixed(1)}"/>`,
        );
      }
    }
  }

  /* ---- the lockup block ---- */
  const markX = 96;
  const markY = 150;
  const markH = 84;
  const markScale = markH / 96;
  const markW = 150 * markScale;

  const lockSize = markH * 0.42;
  const lock = lockup(markX + markW + 34, markY + lockSize, lockSize, lockSize * 1.5);

  const strap = tracked(
    mono,
    'ENTERPRISE AI ARCHITECTURE · GOVERNANCE · RISK',
    markX,
    markY + markH + 74,
    15,
    2.6,
  );
  const promise = tracked(mono, 'FROM IDEA TO CONTROLLED PRODUCTION', markX, H - 58, 13, 2.2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Inference Institute — enterprise AI architecture, governance and risk">
  <title>Inference Institute</title>
  <style>
    /* The scan. One pass every eight seconds, easing at neither end, because
       an instrument sweep is linear and this is meant to read as one. */
    @keyframes sweep { from { transform: translateX(-45%); } to { transform: translateX(115%); } }
    @keyframes breathe { 0%, 100% { opacity: .20; } 50% { opacity: .34; } }
    /* Bars settle left to right, once, on load — the barcode being read. */
    @keyframes settle { from { transform: scaleY(.06); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

    .scan { animation: sweep 8s linear infinite; }
    .mesh { animation: breathe 9s ease-in-out infinite; }
    .bar { transform-box: fill-box; transform-origin: bottom; animation: settle .9s cubic-bezier(.16,1,.3,1) backwards; }
    .lock, .strap, .rule, .promise { animation: rise .9s cubic-bezier(.16,1,.3,1) backwards; }
    .lock { animation-delay: .5s; }
    .rule { animation-delay: .62s; }
    .strap { animation-delay: .7s; }
    .promise { animation-delay: .85s; }

    /* Someone who has asked for less movement gets a still frame that is
       composed rather than a still frame that is mid-animation. */
    @media (prefers-reduced-motion: reduce) {
      .scan, .mesh, .bar, .lock, .strap, .rule, .promise { animation: none; }
      .scan { transform: translateX(34%); }
    }
  </style>

  <defs>
    <linearGradient id="sweepFade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".42" stop-color="#fff" stop-opacity=".85"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="1"/>
      <stop offset=".58" stop-color="#fff" stop-opacity=".85"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="scanMask">
      <rect x="0" y="0" width="${W}" height="${H}" fill="black"/>
      <rect class="scan" x="0" y="0" width="${Math.round(W * 0.42)}" height="${H}" fill="url(#sweepFade)"/>
    </mask>
    <linearGradient id="vignette" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${ground}" stop-opacity="0"/>
      <stop offset="1" stop-color="${ground}" stop-opacity=".55"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${ground}"/>

  <g class="mesh" stroke="${figure}" stroke-opacity=".13" stroke-width="1" fill="none">${links.join('')}</g>
  ${field(0.16)}
  <g mask="url(#scanMask)">${field(0.85)}</g>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>

  <g transform="translate(${markX} ${markY}) scale(${markScale.toFixed(4)})" fill="${figure}">
    ${BARS.map(([x, y, w, h], i) => `<rect class="bar" style="animation-delay:${(i * 0.055).toFixed(3)}s" x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('\n    ')}
  </g>

  <path class="lock" d="${lock.d}" fill="${figure}"/>
  <rect class="rule" x="${markX}" y="${markY + markH + 34}" width="${Math.round(lock.width + markW + 34)}" height="1" fill="${figure}" opacity=".28"/>
  <path class="strap" d="${strap.d}" fill="${figure}" opacity=".72"/>
  <path class="promise" d="${promise.d}" fill="${figure}" opacity=".45"/>
</svg>
`;
}

writeFileSync(join(OUT, 'banner-dark.svg'), build({ ground: INK, figure: PAPER, name: 'dark' }));
writeFileSync(join(OUT, 'banner-light.svg'), build({ ground: PAPER, figure: INK, name: 'light' }));
console.log('Wrote profile/assets/banner-dark.svg and banner-light.svg');
