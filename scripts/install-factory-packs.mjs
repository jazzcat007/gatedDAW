#!/usr/bin/env node
// Installs curated factory content packs, server-side, one pack at a time:
//   fetch (git clone / pull --ff-only into the intake tree)
//   -> import (scripts/import-sfz-instruments.mjs or import-soundfonts.mjs)
// Every stage writes straight to stdout/stderr so the admin job panel shows the same lines an
// operator would see running the importer by hand — including the importer's own
// "imported=..." / "invalid=..." report, which is relayed verbatim, never reformatted.
//
// Pack ids are resolved against the committed factory-intake/packs.json (or --packs-file) only.
// The admin endpoint has already validated them, but this script re-validates on its own so a bad
// id can never reach git or an importer even if invoked directly.
import {dirname, join, resolve} from "node:path"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import {checkFreeSpace, freeSpaceBytes, readPackManifest, resolvePacks} from "../packages/server/factory-packs/index.mjs"
import {fetchPack} from "../packages/server/factory-packs/fetch-pack.mjs"
import {importCommandFor} from "../packages/server/factory-packs/install-steps.mjs"

const scriptDir = dirname(fileURLToPath(import.meta.url))

const usage = `Usage:
  node scripts/install-factory-packs.mjs --pack-ids <id1,id2,...> [options]

Options:
  --pack-ids <ids>     Comma-separated pack ids from factory-intake/packs.json (required)
  --packs-file <path>  Pack manifest (default: <repo>/factory-intake/packs.json)
  --root <path>        Factory root (default: FACTORY_ASSET_ROOT env or /data/factory)
  --intake-root <path> Intake/cache root (default: OPENDAW_INTAKE_ROOT env or /data/factory-intake)
  --help               Show this help
`

const parseArgs = argv => {
    const args = {packIds: [], packsFile: undefined, root: undefined, intakeRoot: undefined, help: false}
    for (let index = 2; index < argv.length; index++) {
        const token = argv[index]
        if (token === "--help") {args.help = true; continue}
        if (token !== "--pack-ids" && token !== "--packs-file" && token !== "--root" && token !== "--intake-root") {
            throw new Error(`Unknown option: ${token}\n${usage}`)
        }
        const value = argv[++index]
        if (value === undefined || value.startsWith("--")) {throw new Error(`Missing value for ${token}`)}
        if (token === "--pack-ids") {
            args.packIds = value.split(",").map(id => id.trim()).filter(id => id.length > 0)
        } else if (token === "--packs-file") {
            args.packsFile = value
        } else if (token === "--root") {
            args.root = value
        } else {
            args.intakeRoot = value
        }
    }
    if (!args.help && args.packIds.length === 0) {throw new Error(usage)}
    return args
}

// stdio: "inherit" so the child's output streams into this process's stdout, which the job runner
// captures — the importer's own report lines land in the admin panel unmodified.
const run = (command, args) => new Promise((done, failed) => {
    const child = spawn(command, args, {stdio: "inherit"})
    child.on("error", failed)
    child.on("close", code => code === 0 ? done() : failed(new Error(`${command} exited with code ${code}`)))
})

const main = async () => {
    const args = parseArgs(process.argv)
    if (args.help) {process.stdout.write(usage); return}

    const factoryRoot = resolve(args.root ?? process.env.FACTORY_ASSET_ROOT ?? "/data/factory")
    const intakeRoot = resolve(args.intakeRoot ?? process.env.OPENDAW_INTAKE_ROOT ?? "/data/factory-intake")
    const packsFile = resolve(args.packsFile ?? join(scriptDir, "..", "factory-intake", "packs.json"))

    const manifest = readPackManifest(packsFile)
    const {packs, unknown, blocked} = resolvePacks(manifest, args.packIds)
    if (unknown.length > 0) {throw new Error(`Unknown pack id(s): ${unknown.join(", ")}`)}
    if (blocked.length > 0) {
        throw new Error(`Not installable: ${blocked.map(({id, reason}) => `${id} (${reason})`).join("; ")}`)
    }
    if (packs.length === 0) {console.log("Nothing to install."); return}

    // Same preflight the endpoint enforces; re-checked here so a direct CLI invocation cannot
    // run the volume dry either.
    const space = checkFreeSpace(packs, freeSpaceBytes(factoryRoot))
    if (!space.ok) {
        throw new Error(`Insufficient free space: need ${space.marginBytes} free after installing `
            + `${space.totalBytes} bytes, but only ${space.freeBytes} available (short by ${space.shortfallBytes})`)
    }
    console.log(`installing ${packs.length} pack(s) into ${factoryRoot}`)
    console.log(`projected usage: ${space.totalBytes} bytes, free-space margin ${space.marginBytes} bytes`)

    const downloadsRoot = join(intakeRoot, "_downloads")
    const failures = []
    for (const pack of packs) {
        console.log(`\n== ${pack.id} (${pack.kind}, ${pack.license}) ==`)
        try {
            console.log(`-- fetch --`)
            const cacheDir = join(downloadsRoot, pack.id)
            const {dir, cloned} = await fetchPack(pack, cacheDir)
            console.log(cloned ? `cloned ${pack.source.url}` : `updated ${cacheDir} (fast-forward)`)

            console.log(`-- import --`)
            const {command, args: importArgs} = importCommandFor(pack, dir, factoryRoot, scriptDir)
            console.log(`${command} ${importArgs.join(" ")}`)
            await run(command, importArgs)
            console.log(`== ${pack.id} done ==`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.error(`!! ${pack.id} FAILED: ${message}`)
            failures.push(pack.id)
            // Continue with the remaining packs; a partial install is safe (every step is
            // idempotent), and the admin sees exactly which pack failed in the job output.
        }
    }

    console.log(`\ninstall run complete: ${packs.length - failures.length} succeeded, ${failures.length} failed`
        + (failures.length > 0 ? ` (failed: ${failures.join(", ")})` : ""))
    if (failures.length > 0) {process.exitCode = 1}
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})