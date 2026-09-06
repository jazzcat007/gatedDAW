#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'node:fs';

const manifestPath = process.argv[2] ?? 'factory-intake/manifest.json';
const packName = process.argv[3];

if (!packName) {
  console.error('Usage: node update-manifest.mjs <manifest.json> <pack-name>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const packs = [
  ...(manifest.soundfonts ?? []),
  ...(manifest.samples ?? []),
  ...(manifest.sfz ?? [])
];
const pack = packs.find(p => p.name === packName || p.id === packName);
if (!pack) {
  console.error(`Pack ${packName} not found`);
  process.exit(1);
}

pack.imported = true;
pack.lastVerifiedAt = new Date().toISOString();

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Marked ${packName} as imported`);
