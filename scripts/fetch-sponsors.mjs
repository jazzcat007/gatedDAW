import {writeFileSync, mkdirSync} from "node:fs"
import {dirname} from "node:path"

const TOKEN = process.env.GH_TOKEN
const LOGIN = "andremichelle"
const OUTPUT_PATH = "packages/app/studio/public/sponsors.json"
const writeOutput = output => {
    mkdirSync(dirname(OUTPUT_PATH), {recursive: true})
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n")
    console.log(`Wrote ${output.totalCount} sponsors to ${OUTPUT_PATH}`)
}

if (!TOKEN) {
    console.warn("GH_TOKEN is not configured; writing an empty sponsors list")
    writeOutput({fetchedAt: new Date().toISOString(), totalCount: 0, sponsors: []})
    process.exit(0)
}

const query = `
query($login: String!) {
  user(login: $login) {
    sponsors(first: 100) {
      totalCount
      nodes {
        __typename
        ... on User { login name avatarUrl url }
        ... on Organization { login name avatarUrl url }
      }
    }
  }
}
`

const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "openDAW-sponsors-fetcher"
    },
    body: JSON.stringify({query, variables: {login: LOGIN}})
})

if (!response.ok) {
    console.error(`HTTP ${response.status} ${response.statusText}`)
    console.error(await response.text())
    process.exit(1)
}

const json = await response.json()
if (json.errors) {
    console.error("GraphQL errors:")
    console.error(JSON.stringify(json.errors, null, 2))
    process.exit(1)
}

const sponsorsField = json.data?.user?.sponsors
if (!sponsorsField) {
    console.error("No sponsors field in response")
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
}

const output = {
    fetchedAt: new Date().toISOString(),
    totalCount: sponsorsField.totalCount,
    sponsors: sponsorsField.nodes.map(node => ({
        type: node.__typename,
        login: node.login,
        name: node.name,
        avatarUrl: node.avatarUrl,
        url: node.url
    }))
}

writeOutput(output)
