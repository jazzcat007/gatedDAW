// Pack manifest handling and the admin install-endpoint decision logic. Everything here is pure
// with respect to pack input: the only files ever read are ones the server itself passes paths to
// (the committed packs.json and the factory indexes), so an unknown or malicious pack id can never
// make this code touch the network or an attacker-chosen filesystem path. The client sends ids only.
import {readFileSync, statfsSync} from "node:fs"

// Refusing an install that would leave less than max(5 GB, 2x the largest pack in the batch) free.
// Projects, rooms, and server state share the factory volume, so a dry volume breaks saves for
// everyone, not just the install.
export const MIN_FREE_SPACE_BYTES = 5_000_000_000

export const emptyPackManifest = () => ({version: 1, packs: []})

export const readPackManifest = (file) => JSON.parse(readFileSync(file, "utf8"))

export const resolvePacks = (manifest, packIds) => {
    const byId = new Map((manifest?.packs ?? [])
        .filter(pack => typeof pack?.id === "string")
        .map(pack => [pack.id, pack]))
    const packs = []
    const unknown = []
    const blocked = []
    const seen = new Set()
    for (const id of Array.isArray(packIds) ? packIds : [packIds]) {
        if (typeof id !== "string" || seen.has(id)) {
            if (typeof id !== "string") {unknown.push(String(id))}
            continue
        }
        seen.add(id)
        const pack = byId.get(id)
        if (pack === undefined) {
            unknown.push(id)
            continue
        }
        if (pack.installable !== true) {
            blocked.push({id: pack.id, reason: pack.blockedReason ?? "not installable"})
            continue
        }
        packs.push(pack)
    }
    return {packs, unknown, blocked}
}

export const freeSpaceBytes = (path) => {
    const {bavail, bsize} = statfsSync(path)
    return bavail * bsize
}

export const freeSpaceMarginBytes = (packs) =>
    Math.max(MIN_FREE_SPACE_BYTES, 2 * packs.reduce((largest, pack) => Math.max(largest, pack.rawSizeBytes ?? 0), 0))

export const checkFreeSpace = (packs, freeBytes) => {
    const totalBytes = packs.reduce((sum, pack) => sum + (pack.rawSizeBytes ?? 0), 0)
    const marginBytes = freeSpaceMarginBytes(packs)
    const remainingBytes = freeBytes - totalBytes
    return remainingBytes < marginBytes
        ? {ok: false, freeBytes, totalBytes, marginBytes, shortfallBytes: marginBytes - remainingBytes}
        : {ok: true, freeBytes, totalBytes, marginBytes}
}

// The whole install-endpoint decision in one pure function: docker-server.mjs reads the manifest
// and the disk numbers, then calls this. Nothing here reads a file or spawns a process, which is
// what keeps the trust boundary testable: an unknown id is rejected before any stage could run.
export const decideInstall = ({manifest, packIds, freeBytes, jobRunning, offlineInstallDisabled}) => {
    if (offlineInstallDisabled) {
        return {status: 403, error: "Pack installs are disabled while OPENDAW_FACTORY_OFFLINE_ONLY is on"}
    }
    if (!Array.isArray(packIds) || packIds.length === 0) {
        return {status: 400, error: "packIds must be a non-empty array"}
    }
    const {packs, unknown, blocked} = resolvePacks(manifest, packIds)
    if (unknown.length > 0) {
        return {status: 400, error: `Unknown pack id(s): ${unknown.join(", ")}`}
    }
    if (blocked.length > 0) {
        return {status: 400, error: blocked.map(({id, reason}) => `Not installable: ${id} (${reason})`).join("; ")}
    }
    if (jobRunning) {
        return {status: 409, error: "Another asset import job is already running"}
    }
    const space = checkFreeSpace(packs, freeBytes)
    if (!space.ok) {
        return {
            status: 409,
            error: `Insufficient free space: need ${space.marginBytes} free after installing `
                + `${space.totalBytes} bytes, but only ${space.freeBytes} available `
                + `(short by ${space.shortfallBytes})`,
            freeSpace: space
        }
    }
    return {status: 202, packs, freeSpace: space}
}