// Extracts a curated set of Phosphor duotone icons (MIT) into src/motion/icons.json for canvas drawing.
// Run: node scripts/build-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { icons } from '@phosphor-icons/core'

const root = fileURLToPath(new URL('../node_modules/@phosphor-icons/core/', import.meta.url))

const NAMES = `
drop drop-half waves wave-sine globe globe-hemisphere-west globe-hemisphere-east snowflake mountains tree tree-evergreen plant leaf flower sun moon cloud cloud-rain lightning wind fire thermometer thermometer-hot thermometer-cold umbrella rainbow planet atom flask dna microscope test-tube
users user users-three user-circle student graduation-cap chalkboard-teacher baby person person-simple-run person-simple-walk hand-heart handshake heart heartbeat brain bed tooth pill first-aid syringe hospital virus barbell bicycle
currency-dollar currency-eur currency-gbp money coins piggy-bank wallet bank credit-card receipt chart-line-up chart-line-down chart-bar chart-pie chart-pie-slice trend-up trend-down percent calculator scales briefcase buildings building storefront shopping-cart shopping-bag tag package truck factory
bread cake coffee cookie pizza hamburger fork-knife cooking-pot carrot orange apple-logo egg fish wine beer-bottle ice-cream
device-mobile laptop desktop monitor television video video-camera camera headphones music-notes microphone speaker-high game-controller chat-circle chat-circle-dots chats envelope phone wifi-high cpu robot code database cloud-arrow-up bell
book book-open books notebook newspaper pencil-simple article lightbulb puzzle-piece target flag trophy medal star rocket compass map-pin map-trifold airplane train car bus boat house house-line city road-horizon
clock timer hourglass calendar calendar-check alarm repeat arrows-clockwise arrow-circle-up arrow-circle-down check-circle x-circle warning info question shield-check lock key eye magnifying-glass gear wrench hammer
recycle battery-charging plug lightning-a solar-panel gas-pump drop-simple paw-print bird butterfly cat dog fish-simple
lightbulb-filament megaphone microphone-stage film-strip palette paint-brush sparkle confetti gift ticket handshake scales
`.split(/\s+/).filter(Boolean)

const byName = new Map(icons.map((i) => [i.name, i]))
const out = []
const missing = []
for (const name of [...new Set(NAMES)]) {
  const meta = byName.get(name)
  if (!meta) { missing.push(name); continue }
  const svg = readFileSync(path.join(root, 'assets', 'duotone', `${name}-duotone.svg`), 'utf8')
  const paths = [...svg.matchAll(/<path d="([^"]+)"(\s+opacity="[^"]+")?\/>/g)]
  const bg = paths.filter((p) => p[2]).map((p) => p[1]).join(' ')
  const fg = paths.filter((p) => !p[2]).map((p) => p[1]).join(' ')
  if (!fg) { missing.push(name + '(no paths)'); continue }
  out.push({ n: name, t: [...new Set([...name.split('-'), ...meta.tags.map((t) => t.toLowerCase())])].join(' '), b: bg, f: fg })
}
writeFileSync(new URL('../src/motion/icons.json', import.meta.url), JSON.stringify(out))
console.log(`${out.length} icons written, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`)
if (missing.length) console.log('missing:', missing.join(', '))
