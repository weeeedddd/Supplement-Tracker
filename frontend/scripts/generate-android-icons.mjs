// Regenerate the Android launcher, notification and splash artwork from the
// CORELINE mark. Run with `npx --yes sharp-cli`-free tooling:
//   npm install --no-save sharp && node scripts/generate-android-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');

const BACKGROUND = '#050707';
const MARK = `
  <path d="M356 122c-28-20-62-30-100-30-91 0-164 73-164 164s73 164 164 164c38 0 72-10 100-30"
        fill="none" stroke="STROKE_ACCENT" stroke-width="52" stroke-linecap="square"/>
  <path d="M246 182h126M246 256h96M246 330h126"
        fill="none" stroke="STROKE_TEXT" stroke-width="28" stroke-linecap="square"/>
`;

const markSvg = (accent, text) => MARK.replace('STROKE_ACCENT', accent).replace('STROKE_TEXT', text);

/** Full launcher artwork: rounded dark plate with the mark. */
const launcherSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="${BACKGROUND}"/>
  ${markSvg('#78e7ed', '#eeeae0')}
</svg>`;

/**
 * Adaptive-icon foreground. The art is inset into the central 66% so Android
 * can mask the icon into any launcher shape without clipping it.
 */
const foregroundSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768">
  <g transform="translate(128 128)">${markSvg('#78e7ed', '#eeeae0')}</g>
</svg>`;

/** Notification icons must be a flat white silhouette on transparency. */
const statusSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <g transform="translate(64 64)">${markSvg('#ffffff', '#ffffff')}</g>
</svg>`;

const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

async function launcherIcons() {
  for (const [density, scale] of DENSITIES) {
    const legacy = await png(launcherSvg(), Math.round(48 * scale));
    await write(join(res, `mipmap-${density}/ic_launcher.png`), legacy);
    await write(join(res, `mipmap-${density}/ic_launcher_round.png`), legacy);
    await write(
      join(res, `mipmap-${density}/ic_launcher_foreground.png`),
      await png(foregroundSvg(), Math.round(108 * scale)),
    );
    await write(
      join(res, `drawable-${density}/ic_stat_coreline.png`),
      await png(statusSvg(), Math.round(24 * scale)),
    );
  }
  await write(
    join(res, 'values/ic_launcher_background.xml'),
    Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`),
  );
}

/** Splash artwork: the mark centred on the app background, per orientation. */
async function splashScreens() {
  const sizes = [
    ['mdpi', 320, 480],
    ['hdpi', 480, 800],
    ['xhdpi', 720, 1280],
    ['xxhdpi', 960, 1600],
    ['xxxhdpi', 1280, 1920],
  ];
  for (const [density, shortSide, longSide] of sizes) {
    for (const [orientation, width, height] of [
      ['port', shortSide, longSide],
      ['land', longSide, shortSide],
    ]) {
      const mark = Math.round(Math.min(width, height) * 0.36);
      const buffer = await sharp({
        create: { width, height, channels: 4, background: BACKGROUND },
      })
        .composite([{ input: await png(launcherSvg(), mark), gravity: 'centre' }])
        .png()
        .toBuffer();
      await write(join(res, `drawable-${orientation}-${density}/splash.png`), buffer);
      if (density === 'hdpi' && orientation === 'land') {
        await write(join(res, 'drawable/splash.png'), buffer);
      }
    }
  }
}

await launcherIcons();
await splashScreens();
console.log('Android launcher, notification and splash artwork regenerated.');
