#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'node:fs';

function parseArgs(argv) {
  const args = {
    manifestPath: 'factory-intake/manifest.json',
    imported: true
  };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      console.error(`Missing value for --${key}`);
      process.exit(2);
    }
    if (key === 'manifest') args.manifestPath = value;
    else if (key === 'name' || key === 'id') args.packName = value;
    else if (key === 'imported') args.imported = value === 'true';
    else {
      console.error(`Unknown option --${key}`);
      process.exit(2);
    }
    i++;
  }
  if (positional.length === 1) args.packName ??= positional[0];
  if (positional.length >= 2) {
    args.manifestPath = positional[0];
    args.packName ??= positional[1];
  }
  return args;
}

const {manifestPath, packName, imported} = parseArgs(process.argv);

if (!packName) {
  console.error('Usage: node update-manifest.mjs [manifest.json] <pack-name>');
  console.error('   or: node update-manifest.mjs --name <pack-name> --imported true [--manifest factory-intake/manifest.json]');
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

pack.imported = imported;
pack.lastVerifiedAt = new Date().toISOString();

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Marked ${packName} as imported=${imported}`);
