# Factory Intake Structure

This folder defines the canonical layout for the self-hosted factory mirror.

## Target layout on the media volume

```
/data/factory/
  demos/
    projects.json
    <id>/project.odb
  samples/
    index.json
    Drums/
    One-Shots/
    Loops/
    Foley/
    Vocals/
    Bass/
    Synth/
    Guitar/
    Keys/
    Impulse Responses/
  soundfonts/
    index.json
    <catalog-name>/
  presets/
    index.json
    *.odp
```

## Import commands

```bash
# samples
node scripts/import-samples.mjs <folder> --root /data/factory --folder "Imported/Samples"

# soundfonts
node scripts/import-soundfonts.mjs <folder> --folder <catalog-name> --license <license> --url <source-url>

# demos
npm run import-demos
```

Keep `OPENDAW_FACTORY_OFFLINE_ONLY=true` in production.

## OMV ingest template

Use `ingest.sh` as the repeatable OMV-side intake wrapper. It creates the staging tree, optionally rsyncs from a trusted mirror, runs the existing import scripts against the OMV factory root, and prints catalog counts.

`manifest.json` records intended packs, source paths, licenses, acceptance thresholds, and required UUIDs. Keep large sample and SoundFont files on the OMV media volume; `factory-intake/samples/` and `factory-intake/soundfonts/` are intentionally ignored by git.
