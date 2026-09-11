// Builds the per-pack import/bake commands and answers "is this pack already installed?" from the
// factory indexes. Command construction only — the installer CLI decides when to run them.
import {existsSync, readFileSync} from "node:fs"
import {join} from "node:path"

const readJsonOr = (path, fallback) => {
    if (!existsSync(path)) {return fallback}
    try {
        return JSON.parse(readFileSync(path, "utf8"))
    } catch {
        return fallback
    }
}

const collectFolderNames = (folder, names = new Set()) => {
    names.add(folder.name)
    folder.folders?.forEach(child => collectFolderNames(child, names))
    return names
}

export const isPackInstalled = (pack, factoryRoot) => {
    if (pack.kind === "soundfont") {
        const catalog = readJsonOr(join(factoryRoot, "soundfonts", "index.json"), {folders: []})
        const folderName = pack.folder ?? pack.name
        return catalog.folders.some(folder =>
            folder.name === folderName && Array.isArray(folder.soundfonts) && folder.soundfonts.length > 0)
    }
    const catalog = readJsonOr(join(factoryRoot, "sfz", "index.json"), {folders: []})
    const names = new Set()
    catalog.folders.forEach(folder => collectFolderNames(folder, names))
    return names.has(pack.name)
}

// Every instrument uuid currently in the SFZ catalog. The installer snapshots this before an import
// and diffs after, which yields exactly the instruments that import just added — the set the bake
// step gets via --uuids, so a name collision with an unrelated library can never re-bake it.
export const sfzInstrumentUuids = (factoryRoot) => {
    const catalog = readJsonOr(join(factoryRoot, "sfz", "index.json"), {folders: []})
    const uuids = new Set()
    const collect = folder => {
        folder.instruments?.forEach(entry => {
            if (typeof entry?.uuid === "string") {uuids.add(entry.uuid)}
        })
        folder.folders?.forEach(collect)
    }
    catalog.folders.forEach(collect)
    return uuids
}

export const importCommandFor = (pack, sourceDir, factoryRoot, scriptDir) => {
    const script = join(scriptDir, pack.kind === "soundfont" ? "import-soundfonts.mjs" : "import-sfz-instruments.mjs")
    const args = [script, sourceDir, "--root", factoryRoot, "--license", pack.license ?? "unknown", "--url", pack.source?.url ?? ""]
    if (pack.kind === "soundfont") {
        args.push("--folder", pack.folder ?? pack.name)
    } else {
        args.push("--library", pack.name)
    }
    return {command: "node", args}
}