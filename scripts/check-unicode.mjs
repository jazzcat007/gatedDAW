import {execFileSync} from "node:child_process"
import {readFileSync} from "node:fs"
import {extname} from "node:path"

const TextExtensions = new Set([
    ".c", ".cc", ".cjs", ".cpp", ".css", ".h", ".hpp", ".html", ".js", ".json", ".jsx",
    ".example", ".glsl", ".lock", ".map", ".md", ".mjs", ".ps1", ".py",
    ".rs", ".sass", ".scss", ".sfz", ".sh", ".snap", ".svg", ".toml", ".ts", ".tsv", ".tsx",
    ".txt", ".wat", ".xml", ".yaml", ".yml"
])
const TextNames = new Set([".dockerignore", ".gitattributes", ".gitignore", ".htaccess", "Dockerfile", "LICENSE"])
const decoder = new TextDecoder("utf-8", {fatal: true})

const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
}).split("\0").filter(Boolean).filter(path => TextExtensions.has(extname(path).toLowerCase())
    || TextNames.has(path.split(/[\\/]/).at(-1)))

const findings = []
const report = (path, text, index, message) => {
    const line = text.slice(0, index).split("\n").length
    findings.push(`${path}:${line}: ${message}`)
}

for (const path of paths) {
    let text
    try {
        text = decoder.decode(readFileSync(path))
    } catch {
        findings.push(`${path}: invalid UTF-8`)
        continue
    }

    for (const match of text.matchAll(/[\u0080-\u009F]/gu)) {
        report(path, text, match.index, `C1 control character U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
    }
    for (const match of text.matchAll(/\uFFFD/gu)) {
        report(path, text, match.index, "literal replacement character U+FFFD")
    }
    for (const match of text.matchAll(/\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2(?:[\u0080-\u00BF\u20AC\u2018-\u2122]){1,2}|\u00F0\u0178|\u00EF\u00BF\u00BD/gu)) {
        report(path, text, match.index, `possible mojibake marker ${JSON.stringify(match[0])}`)
    }
}

if (findings.length > 0) {
    console.error("Unicode integrity check failed:\n" + findings.map(finding => `  ${finding}`).join("\n"))
    process.exitCode = 1
} else {
    console.log(`Unicode integrity check passed (${paths.length} text files scanned).`)
}
