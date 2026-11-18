// Builds the app and copies it into the portfolio site at public/reelix/, which GitHub Pages serves at
// https://sheng-yan.com/reelix/. Usage: node scripts/deploy-to-site.mjs [path-to-site]
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const site = path.resolve(process.argv[2] ?? path.join(homedir(), 'cool-website'))
const dest = path.join(site, 'public', 'reelix')
const MARKER = '.reelix-build'

if (!existsSync(path.join(site, 'package.json'))) {
  console.error(`No site found at ${site}. Pass the site folder as the first argument.`)
  process.exit(1)
}
// Only ever replace a folder this script created.
if (existsSync(dest) && !existsSync(path.join(dest, MARKER))) {
  console.error(`${dest} exists but was not created by this script. Move it away first.`)
  process.exit(1)
}

execSync('npm run build', { cwd: root, stdio: 'inherit' })

rmSync(dest, { recursive: true, force: true })
cpSync(path.join(root, 'dist'), dest, {
  recursive: true,
  // The ONNX runtime wasm is fetched from jsDelivr at run time (transformers.js sets that path), so the
  // 21 MB local copy Vite emits is never requested. Leaving it out keeps the site repo small.
  filter: (src) => !src.endsWith('.wasm'),
})
writeFileSync(path.join(dest, MARKER), `Built from project-reelix on ${new Date().toISOString()}\n`)
const files = readdirSync(path.join(dest, 'assets')).length
console.log(`Copied the build to ${dest} (${files} assets). Commit public/reelix in the site repo to publish.`)
