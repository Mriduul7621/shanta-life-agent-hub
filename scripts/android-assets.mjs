/**
 * Builds the Android launcher icons for the Capacitor shell from the one
 * source of truth — public/icons/icon-maskable.svg:
 *   • legacy ic_launcher.png (square, full-bleed charcoal)
 *   • round ic_launcher_round.png (same art, circular mask)
 *   • adaptive ic_launcher_foreground.png (the mark only, on transparent;
 *     the background colour #3C3C3B lives in
 *     android/app/src/main/res/values/ic_launcher_background.xml)
 *
 * The PNGs are GENERATED, never committed: they are binaries, and the
 * GitHub connector pushes text only. CI runs this script before every
 * build (`npm run android:assets`); local builds run it once after
 * checkout. The adaptive-icon XMLs in mipmap-anydpi-v26/ are text and
 * ARE committed.
 *
 * The mark is NOT rescaled for the adaptive foreground: it spans 127–385
 * of 512 (~50% of the layer), and its outer edge (dot edge, 144 units
 * from the centre) sits inside the 66dp safe zone (156 units from the
 * centre on a 512 canvas) on every mask shape. Scaling it up to fill
 * the safe zone would push the dots outside the circle mask — verified
 * against a 66dp circle preview on 2026-11-20 (×1.25 clipped the dots).
 *
 * The script fails loudly if the source SVG no longer has the expected
 * shape (full-bleed charcoal rect + mark) — e.g. when the approved
 * Shanta vector logo lands and the icon is re-cut, this script must be
 * updated deliberately, not silently produce a wrong icon.
 *
 * Usage: npm run android:assets
 */
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'public/icons/icon-maskable.svg');
const RES = path.join(root, 'android/app/src/main/res');

const DENSITIES = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

const source = fs.readFileSync(SRC, 'utf8');
// The source must be the known shape: a full-bleed charcoal rect, then
// the mark (orange circle, olive spokes, cream dots). Anything else
// means the icon was redesigned — stop, do not guess.
if (!/<rect width="512" height="512" fill="#3C3C3B"\/>/.test(source)) {
  throw new Error(
    `android-assets: ${SRC} no longer starts with the full-bleed charcoal rect — the icon was redesigned; update this script.`,
  );
}
const inner = source
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();
const markOnly = inner.replace(/<rect width="512" height="512" fill="#3C3C3B"\/>\s*/, '');
if (!markOnly.includes('<circle cx="256" cy="256" r="72" fill="#F37021"/>')) {
  throw new Error('android-assets: the hub mark (orange circle) is missing from the source SVG — update this script.');
}

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`;

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

const write = (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
};

// Adaptive foreground: the mark only, unscaled (see the header note —
// the mark already sits inside the 66dp safe zone as drawn).
const foregroundSvg = wrap(markOnly);

// Round icon: the full art clipped to a circle.
const roundSvg = wrap(
  `<defs><clipPath id="round"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#round)">${inner}</g>`,
);

const written = [];
for (const [dir, size, fgSize] of DENSITIES) {
  const legacy = path.join(RES, dir, 'ic_launcher.png');
  write(legacy, render(wrap(inner), size));
  written.push(legacy);
  const round = path.join(RES, dir, 'ic_launcher_round.png');
  write(round, render(roundSvg, size));
  written.push(round);
  const fg = path.join(RES, dir, 'ic_launcher_foreground.png');
  write(fg, render(foregroundSvg, fgSize));
  written.push(fg);
}

console.log(`android launcher icons written (${written.length} PNGs)`);
for (const file of written) console.log(`  ${path.relative(root, file)}`);
