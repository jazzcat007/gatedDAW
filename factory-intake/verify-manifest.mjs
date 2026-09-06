#!/usr/bin/env node
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const manifestPath = process.argv[2] ?? 'factory-intake/manifest.json';
const factoryRoot = process.env.FACTORY_ROOT ?? '/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory';

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function countEntries(indexPath, key) {
  if (!existsSync(indexPath)) return 0;
  const data = JSON.parse(readFileSync(indexPath, 'utf8'));
  if (Array.isArray(data)) return data.length;
  if (data.folders) {
    return collectEntries({folders: data.folders}, key).length;
  }
  return 0;
}

function collectEntries(folder, key, entries = []) {
  if (Array.isArray(folder[key])) entries.push(...folder[key]);
  if (Array.isArray(folder.folders)) {
    for (const child of folder.folders) collectEntries(child, key, entries);
  }
  return entries;
}

function manifestPacks(manifest) {
  return [
    ...(manifest.soundfonts ?? []).map(pack => ({type: 'soundfont', ...pack})),
    ...(manifest.samples ?? []).map(pack => ({type: 'sample', ...pack})),
    ...(manifest.sfz ?? []).map(pack => ({type: 'sfz', ...pack}))
  ];
}

const samplesCount = countEntries(join(factoryRoot, 'samples/index.json'), 'samples');
const soundfontsCount = countEntries(join(factoryRoot, 'soundfonts/index.json'), 'soundfonts');
const presetsCount = (() => {
  const p = join(factoryRoot, 'presets/index.json');
  if (!existsSync(p)) return 0;
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return Array.isArray(data) ? data.length : 0;
})();

console.log('Catalog counts:');
console.log('samples:', samplesCount);
console.log('soundfonts:', soundfontsCount);
console.log('presets:', presetsCount);

console.log('\nManifest packs:');
for (const pack of manifestPacks(manifest)) {
  console.log(`- ${pack.type} ${pack.name} imported=${pack.imported === true}`);
}

console.log('\nDone');
