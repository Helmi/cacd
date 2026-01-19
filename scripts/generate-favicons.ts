#!/usr/bin/env bun
/**
 * Generate favicon PNGs from the SVG source
 */

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

const publicDir = path.resolve(import.meta.dir, '../client/public');
const svgPath = path.join(publicDir, 'favicon.svg');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating favicons from SVG...\n');

  for (const { name, size } of sizes) {
    const outputPath = path.join(publicDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Generate ICO file (16x16 and 32x32 combined)
  // Sharp doesn't support ICO directly, so we'll just use the 32x32 PNG
  // Modern browsers prefer PNG anyway

  console.log('\nFavicons generated successfully!');
  console.log('\nDon\'t forget to update index.html with the favicon links.');
}

generateFavicons().catch(console.error);
