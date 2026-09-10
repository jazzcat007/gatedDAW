# Sync staged factory assets to the self-hosted media volume
# Usage: .\scripts\sync-factory-to-media.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$staging = Join-Path $repoRoot 'factory-staging\intake'

$mediaRoot = 'T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory'

if (-not (Test-Path $mediaRoot)) {
    Write-Error "Media root not found: $mediaRoot`nMount the volume first."
    exit 1
}

foreach ($type in @('presets','soundfonts','samples','sfz')) {
    $src = Join-Path $staging $type
    $dst = Join-Path $mediaRoot $type
    if (-not (Test-Path $src)) {
        Write-Warning "Source missing: $src"
        continue
    }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Write-Host "Syncing $type ..."
    Copy-Item -Recurse -Force (Join-Path $src '*') $dst
}

Write-Host "Sync complete. Ensure OPENDAW_FACTORY_OFFLINE_ONLY=true is set and restart the container."
