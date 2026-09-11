// Tests for the pack installer's shared logic. No test in here performs a real network clone or a
// real git call — the runner is always a recording fake, and disk numbers are passed in directly.
import {afterEach, describe, expect, it} from "vitest"
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {checkFreeSpace, decideInstall, resolvePacks} from "./pack-manifest.mjs"
import {fetchPack} from "./fetch-pack.mjs"
import {importCommandFor, isPackInstalled, sfzInstrumentUuids} from "./install-steps.mjs"

const manifest = {
    version: 1,
    packs: [
        {
            id: "pack-a", kind: "sfz", name: "Pack A", genres: ["rock"], license: "CC0-1.0",
            source: {type: "git", url: "https://github.com/example/pack-a", ref: "HEAD"},
            sampleFormat: "wav", rawSizeBytes: 1_000_000_000, installable: true
        },
        {
            id: "pack-b", kind: "soundfont", name: "Pack B", genres: ["pop"], license: "CC0-1.0",
            source: {type: "git", url: "https://github.com/example/pack-b"}, folder: "B-Folder",
            rawSizeBytes: 2_000_000_000, installable: true
        },
        {
            id: "pack-blocked", kind: "sfz", name: "Pack Blocked", genres: [], license: "CC0-1.0",
            source: {type: "git", url: "https://github.com/example/pack-blocked"},
            rawSizeBytes: 3_000_000_000, installable: false,
            blockedReason: "FLAC-only source; needs FLAC->WAV conversion at import (not yet built)"
        }
    ]
}

const tempDirs = []
const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "factory-packs-"))
    tempDirs.push(dir)
    return dir
}
afterEach(() => {
    while (tempDirs.length > 0) {rmSync(tempDirs.pop(), {recursive: true, force: true})}
})

describe("resolvePacks", () => {
    it("resolves known installable ids and reports unknown ones separately", () => {
        const {packs, unknown, blocked} = resolvePacks(manifest, ["pack-a", "no-such-pack"])
        expect(packs.map(pack => pack.id)).toEqual(["pack-a"])
        expect(unknown).toEqual(["no-such-pack"])
        expect(blocked).toEqual([])
    })

    it("reports blocked packs with their reason instead of installing them", () => {
        const {packs, unknown, blocked} = resolvePacks(manifest, ["pack-blocked"])
        expect(packs).toEqual([])
        expect(unknown).toEqual([])
        expect(blocked).toEqual([{id: "pack-blocked", reason: expect.stringContaining("FLAC")}])
    })

    it("ignores duplicate ids and non-string entries", () => {
        const {packs, unknown} = resolvePacks(manifest, ["pack-a", "pack-a", 42])
        expect(packs.map(pack => pack.id)).toEqual(["pack-a"])
        expect(unknown).toEqual(["42"])
    })
})

describe("decideInstall (endpoint decision)", () => {
    const base = {manifest, freeBytes: 100_000_000_000, jobRunning: false, offlineInstallDisabled: false}

    it("rejects an unknown pack id with 400 before any stage could run", () => {
        const decision = decideInstall({...base, packIds: ["attacker-id"]})
        expect(decision.status).toBe(400)
        expect(decision.error).toContain("attacker-id")
        expect(decision.packs).toBeUndefined()
    })

    it("rejects a blocked pack with 400 and the blocked reason", () => {
        const decision = decideInstall({...base, packIds: ["pack-blocked"]})
        expect(decision.status).toBe(400)
        expect(decision.error).toContain("FLAC")
    })

    it("rejects while offline-only mode is on, before validating anything else", () => {
        const decision = decideInstall({...base, packIds: ["pack-a"], offlineInstallDisabled: true})
        expect(decision.status).toBe(403)
    })

    it("rejects with 409 while another job is running, without touching packs", () => {
        const decision = decideInstall({...base, packIds: ["pack-a"], jobRunning: true})
        expect(decision.status).toBe(409)
        expect(decision.packs).toBeUndefined()
    })

    it("refuses an over-budget batch with 409 and the shortfall (no real disk involved)", () => {
        // 1 GB + 2 GB = 3 GB total, margin max(5 GB, 2x2 GB) = 5 GB, so 8 GB free is required; 6.5 GB is 1.5 GB short.
        const decision = decideInstall({...base, packIds: ["pack-a", "pack-b"], freeBytes: 6_500_000_000})
        expect(decision.status).toBe(409)
        expect(decision.freeSpace.shortfallBytes).toBe(1_500_000_000)
    })

    it("accepts a batch that fits the margin", () => {
        const decision = decideInstall({...base, packIds: ["pack-a", "pack-b"], freeBytes: 8_000_000_000})
        expect(decision.status).toBe(202)
        expect(decision.packs.map(pack => pack.id)).toEqual(["pack-a", "pack-b"])
    })
})

describe("checkFreeSpace", () => {
    it("uses the 5 GB floor for small packs", () => {
        // Margin is the 5 GB floor; total is 1 KB, so free must stay >= 5 GB + 1 KB after installing.
        const result = checkFreeSpace([{rawSizeBytes: 1_000}], 5_000_001_000)
        expect(result.ok).toBe(true)
        expect(result.marginBytes).toBe(5_000_000_000)
        expect(checkFreeSpace([{rawSizeBytes: 1_000}], 5_000_000_000).ok).toBe(false)
    })

    it("uses twice the largest pack when that exceeds the floor", () => {
        const packs = [{rawSizeBytes: 4_000_000_000}, {rawSizeBytes: 1_000_000_000}]
        expect(checkFreeSpace(packs, 12_999_999_999).ok).toBe(false) // margin is 8 GB, total 5 GB -> 13 GB needed
        expect(checkFreeSpace(packs, 13_000_000_000).ok).toBe(true)
    })
})

describe("fetchPack", () => {
    const pack = manifest.packs[0]
    const recordingRunner = calls => async (command, args) => {
        calls.push([command, ...args])
        return ""
    }

    it("clones with --depth 1 into the cache dir when nothing is cached yet", async () => {
        const calls = []
        const cache = join(tempDir(), "pack-a")
        const result = await fetchPack(pack, cache, {run: recordingRunner(calls)})
        expect(result.cloned).toBe(true)
        expect(result.dir).toBe(cache)
        expect(calls).toEqual([["git", "clone", "--depth", "1", pack.source.url, cache]])
    })

    it("fast-forward-pulls instead of re-cloning when the cache exists", async () => {
        const calls = []
        const cache = join(tempDir(), "pack-a")
        mkdirSync(cache, {recursive: true})
        mkdirSync(join(cache, ".git"))
        const result = await fetchPack(pack, cache, {run: recordingRunner(calls)})
        expect(result.cloned).toBe(false)
        expect(calls).toEqual([["git", "-C", cache, "pull", "--ff-only"]])
    })

    it("passes --branch for a pinned ref but not for HEAD", async () => {
        const calls = []
        await fetchPack({...pack, source: {type: "git", url: pack.source.url, ref: "sfz"}},
            join(tempDir(), "pinned"), {run: recordingRunner(calls)})
        expect(calls[0]).toContain("sfz")
        expect(calls[0]).toEqual(["git", "clone", "--depth", "1", "--branch", "sfz", pack.source.url, expect.any(String)])
    })

    it("refuses non-git source types (archive is a stub, not a silent no-op)", async () => {
        await expect(fetchPack(
            {...pack, source: {type: "archive", url: "https://example.com/x.zip"}},
            join(tempDir(), "arch"), {run: recordingRunner([])}
        )).rejects.toThrow("not yet implemented")
    })

    it("refuses non-https source urls", async () => {
        await expect(fetchPack(
            {...pack, source: {type: "git", url: "file:///etc"}},
            join(tempDir(), "file-url"), {run: recordingRunner([])}
        )).rejects.toThrow("unsupported source url")
    })

    it("never executes anything for an unknown pack because the decision layer runs first", () => {
        // Mirrors the endpoint's ordering: the job (and its fetch stage) is only built on a 202.
        const decision = decideInstall({manifest, packIds: ["unknown"], freeBytes: 1e12, jobRunning: false, offlineInstallDisabled: false})
        expect(decision.status).toBe(400)
        expect(decision.packs).toBeUndefined()
    })
})

describe("importCommandFor", () => {
    it("builds the sfz importer invocation with the pack's library/license/url", () => {
        const {command, args} = importCommandFor(manifest.packs[0], "/intake/pack-a", "/data/factory", "/app/scripts")
        expect(command).toBe("node")
        expect(args[0]).toBe(join("/app/scripts", "import-sfz-instruments.mjs"))
        expect(args).toContain("/intake/pack-a")
        expect(args.join(" ")).toContain("--library Pack A")
        expect(args.join(" ")).toContain("--license CC0-1.0")
        expect(args.join(" ")).toContain("--root /data/factory")
        expect(args.join(" ")).toContain(`--url ${manifest.packs[0].source.url}`)
    })

    it("builds the soundfont importer invocation with --folder", () => {
        const {args} = importCommandFor(manifest.packs[1], "/intake/pack-b", "/data/factory", "/app/scripts")
        expect(args[0]).toBe(join("/app/scripts", "import-soundfonts.mjs"))
        expect(args.join(" ")).toContain("--folder B-Folder")
        expect(args.join(" ")).not.toContain("--library")
    })
})

describe("installed-state and uuid snapshot", () => {
    it("detects sfz packs by library folder in the catalog, at any nesting depth", () => {
        const root = tempDir()
        mkdirSync(join(root, "sfz"), {recursive: true})
        writeFileSync(join(root, "sfz", "index.json"), JSON.stringify({
            version: 1,
            folders: [{name: "VCSL", folders: [{name: "Pack A", instruments: [{uuid: "u-1", name: "X"}]}]}]
        }))
        expect(isPackInstalled(manifest.packs[0], root)).toBe(true)
        expect(isPackInstalled(manifest.packs[1], root)).toBe(false) // no such sfz library folder
    })

    it("detects soundfont packs by their catalog folder entry", () => {
        const root = tempDir()
        mkdirSync(join(root, "soundfonts"), {recursive: true})
        writeFileSync(join(root, "soundfonts", "index.json"), JSON.stringify({
            version: 1, folders: [{name: "B-Folder", soundfonts: [{uuid: "u-2"}]}]
        }))
        expect(isPackInstalled(manifest.packs[1], root)).toBe(true)
        expect(isPackInstalled(manifest.packs[0], root)).toBe(false)
    })

    it("snapshots every catalog instrument uuid for the before/after import diff", () => {
        const root = tempDir()
        mkdirSync(join(root, "sfz"), {recursive: true})
        writeFileSync(join(root, "sfz", "index.json"), JSON.stringify({
            version: 1,
            folders: [
                {name: "VCSL", instruments: [{uuid: "u-1"}, {uuid: "u-2"}]},
                {name: "Other", folders: [{name: "Nested", instruments: [{uuid: "u-3"}]}]}
            ]
        }))
        expect([...sfzInstrumentUuids(root)].sort()).toEqual(["u-1", "u-2", "u-3"])
    })

    it("treats a missing factory root as nothing installed", () => {
        const root = join(tempDir(), "absent")
        expect(isPackInstalled(manifest.packs[0], root)).toBe(false)
        expect(existsSync(root)).toBe(false)
        expect(sfzInstrumentUuids(root).size).toBe(0)
    })
})