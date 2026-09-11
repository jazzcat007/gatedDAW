// Single-pack fetch step. Mirrors the pattern of factory-intake/ingest.sh's fetch_soundfont_pack /
// fetch_sample_pack bash functions: clone --depth 1 into the intake tree once, then `pull --ff-only`
// on every later run, so a failed or interrupted install resumes instead of re-downloading.
// The `run` option exists so tests can record commands instead of executing git.
import {existsSync, mkdirSync} from "node:fs"
import {execFile as execFileCallback} from "node:child_process"
import {dirname, join} from "node:path"
import {promisify} from "node:util"

const execFileAsync = promisify(execFileCallback)

export const defaultRunner = async (command, args) => {
    const {stdout, stderr} = await execFileAsync(command, args)
    return `${stdout}${stderr}`
}

export const fetchPack = async (pack, cacheDir, {run = defaultRunner} = {}) => {
    if (pack.source?.type !== "git") {
        throw new Error(`Archive pack sources are not yet implemented: ${pack.id} (${pack.source?.type ?? "no source"})`)
    }
    if (typeof pack.source.url !== "string" || !pack.source.url.startsWith("https://")) {
        throw new Error(`Refusing to fetch pack ${pack.id}: unsupported source url`)
    }
    if (existsSync(join(cacheDir, ".git"))) {
        await run("git", ["-C", cacheDir, "pull", "--ff-only"])
        return {dir: cacheDir, cloned: false}
    }
    mkdirSync(dirname(cacheDir), {recursive: true})
    const args = ["clone", "--depth", "1"]
    if (typeof pack.source.ref === "string" && pack.source.ref !== "" && pack.source.ref !== "HEAD") {
        args.push("--branch", pack.source.ref)
    }
    args.push(pack.source.url, cacheDir)
    await run("git", args)
    return {dir: cacheDir, cloned: true}
}