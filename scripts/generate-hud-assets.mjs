import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const heartPath = 'M16 27.2 5.7 18.4C1.5 14.8 3.1 8 8.4 7.4c3-.4 5.5 1.3 7.6 4 2.1-2.7 4.6-4.4 7.6-4 5.3.6 6.9 7.4 2.7 11L16 27.2Z'

const iconSvg = (content) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">\n${content}\n</svg>\n`

const half = (content) => `<defs><clipPath id="left-half"><rect x="0" y="0" width="16" height="32"/></clipPath></defs><g clip-path="url(#left-half)">${content}</g>`

const heartSvg = ({ fill, light, detail = '', isHalf = false, empty = false }) => {
  const emptyShape = `<path d="${heartPath}" fill="#27313d" stroke="#9aa5b2" stroke-width="2"/><path d="M7.3 12.1c.4-1.8 1.8-2.9 3.6-2.8" fill="none" stroke="#647181" stroke-width="1.5"/>`
  if (empty) {
    return iconSvg(emptyShape)
  }
  const filledShape = `<path d="${heartPath}" fill="${fill}" stroke="#38243b" stroke-width="1.5"/><path d="M6.7 14.3c.1-3.1 2.3-5.2 5.3-4.8 1.2.2 2.2.8 3.2 1.8l-3.1.2-2.5 2.1-1.2 2.7-1.7-1.1Z" fill="${light}"/>${detail}`
  return iconSvg(isHalf ? `${emptyShape}${half(filledShape)}` : filledShape)
}

const foodSvg = ({ fill, light, isHalf = false, empty = false }) => {
  const emptyShape = '<path d="M9 5h11l6 6v10l-5 6H10l-5-6v-9Z" fill="#30363b" stroke="#a3a08b" stroke-width="2"/><path d="m9 10 2-2h8" fill="none" stroke="#666b64" stroke-width="1.5"/>'
  if (empty) {
    return iconSvg(emptyShape)
  }
  const filledShape = `<path d="M9 5h11l6 6v10l-5 6H10l-5-6v-9Z" fill="${fill}" stroke="#40372e" stroke-width="1.7"/><path d="m9 8 2-2h7l-4 4-4 2-2 4Z" fill="${light}"/><path d="m20 13 2 2m-8 7 2-1m6-3 1-1" fill="none" stroke="#79533b" stroke-width="1.5"/>`
  return iconSvg(isHalf ? `${emptyShape}${half(filledShape)}` : filledShape)
}

const armorSvg = ({ fill, light, isHalf = false, empty = false }) => {
  const emptyShape = '<path d="M16 3 27 7v8c0 6-4.5 10.8-11 14C9.5 25.8 5 21 5 15V7Z" fill="#29333d" stroke="#a7b4c0" stroke-width="2"/><path d="M9 10 16 7l7 3" fill="none" stroke="#647483" stroke-width="1.5"/>'
  if (empty) {
    return iconSvg(emptyShape)
  }
  const filledShape = `<path d="M16 3 27 7v8c0 6-4.5 10.8-11 14C9.5 25.8 5 21 5 15V7Z" fill="${fill}" stroke="#273540" stroke-width="1.8"/><path d="M8 9 16 6l5 2-5 7-8 2Z" fill="${light}"/><path d="m16 15 8-5v6c0 4.1-3.1 8-8 10Z" fill="#496778"/>`
  return iconSvg(isHalf ? `${emptyShape}${half(filledShape)}` : filledShape)
}

const oxygenArtwork = (fill, edge, glint) =>
  `<g stroke="${edge}" stroke-width="1.6"><circle cx="10" cy="17" r="6" fill="${fill}"/><circle cx="21" cy="13" r="5" fill="${fill}"/><circle cx="21" cy="23" r="3.2" fill="${fill}"/></g><path d="M7.5 14.5a2.5 2.5 0 0 1 3-1M19 10.5a2 2 0 0 1 2.5-.3" fill="none" stroke="${glint}" stroke-width="1.5"/>`

const oxygenSvg = (empty = false, isHalf = false) => {
  const filled = oxygenArtwork('#76d9e6', '#173b55', '#e9ffff')
  if (empty) {
    return iconSvg(oxygenArtwork('#26343f', '#a0b5bd', '#647781'))
  }
  if (!isHalf) {
    return iconSvg(filled)
  }
  const emptyBubbles = oxygenArtwork('#26343f', '#a0b5bd', '#647781')
  const leftHalfClip = '<defs><clipPath id="oxygen-left-half"><rect x="0" y="0" width="16" height="32"/></clipPath></defs>'
  return iconSvg(`${emptyBubbles}${leftHalfClip}<g clip-path="url(#oxygen-left-half)">${filled}</g>`)
}

const icons = [
  { name: 'health-full', description: 'Filled health mark.', svg: heartSvg({ fill: '#e85267', light: '#ffaaa0' }) },
  { name: 'health-half', description: 'Half-filled health mark.', svg: heartSvg({ fill: '#e85267', light: '#ffaaa0', isHalf: true }) },
  { name: 'health-empty', description: 'Outlined empty health mark.', svg: heartSvg({ empty: true }) },
  { name: 'absorption-full', description: 'Filled golden health mark with a small glint.', svg: heartSvg({ fill: '#efb93f', light: '#fff0a0', detail: '<path d="m22 9 1.2 2.4 2.5 1.1-2.5 1.2-1.2 2.4-1.1-2.4-2.5-1.2 2.5-1.1Z" fill="#fff7c5"/>' }) },
  { name: 'absorption-half', description: 'Half-filled golden health mark with a small glint.', svg: heartSvg({ fill: '#efb93f', light: '#fff0a0', detail: '<path d="m22 9 1.2 2.4 2.5 1.1-2.5 1.2-1.2 2.4-1.1-2.4-2.5-1.2 2.5-1.1Z" fill="#fff7c5"/>', isHalf: true }) },
  { name: 'poison-full', description: 'Filled violet health mark with three bubbles.', svg: heartSvg({ fill: '#a55fd1', light: '#dba4ee', detail: '<circle cx="20" cy="15" r="1.3" fill="#f2d2ff"/><circle cx="23.5" cy="18" r="1" fill="#f2d2ff"/><circle cx="19" cy="20" r=".8" fill="#f2d2ff"/>' }) },
  { name: 'poison-half', description: 'Half-filled violet health mark with three bubbles.', svg: heartSvg({ fill: '#a55fd1', light: '#dba4ee', detail: '<circle cx="20" cy="15" r="1.3" fill="#f2d2ff"/><circle cx="23.5" cy="18" r="1" fill="#f2d2ff"/><circle cx="19" cy="20" r=".8" fill="#f2d2ff"/>', isHalf: true }) },
  { name: 'wither-full', description: 'Filled slate health mark crossed by a pale fracture.', svg: heartSvg({ fill: '#59636c', light: '#909aa3', detail: '<path d="m18 12 2 3-1 2 3 2-2 1-1 3" fill="none" stroke="#e0e6e8" stroke-width="1.5"/>' }) },
  { name: 'wither-half', description: 'Half-filled slate health mark crossed by a pale fracture.', svg: heartSvg({ fill: '#59636c', light: '#909aa3', detail: '<path d="m18 12 2 3-1 2 3 2-2 1-1 3" fill="none" stroke="#e0e6e8" stroke-width="1.5"/>', isHalf: true }) },
  { name: 'hunger-full', description: 'Filled warm food mark with crumb details.', svg: foodSvg({ fill: '#dc9a4d', light: '#ffe0a0' }) },
  { name: 'hunger-half', description: 'Half-filled warm food mark with crumb details.', svg: foodSvg({ fill: '#dc9a4d', light: '#ffe0a0', isHalf: true }) },
  { name: 'hunger-empty', description: 'Outlined empty food mark.', svg: foodSvg({ empty: true }) },
  { name: 'armor-full', description: 'Filled blue-steel shield.', svg: armorSvg({ fill: '#729bb0', light: '#d5f0f2' }) },
  { name: 'armor-half', description: 'Half-filled blue-steel shield.', svg: armorSvg({ fill: '#729bb0', light: '#d5f0f2', isHalf: true }) },
  { name: 'armor-empty', description: 'Outlined empty shield.', svg: armorSvg({ empty: true }) },
  { name: 'oxygen-full', description: 'Three filled air bubbles.', svg: oxygenSvg() },
  { name: 'oxygen-half', description: 'Three half-filled air bubbles.', svg: oxygenSvg(false, true) },
  { name: 'oxygen-empty', description: 'Three outlined air bubbles.', svg: oxygenSvg(true) },
  { name: 'effect-positive', description: 'Leaf and rising mark for a helpful effect.', svg: iconSvg('<path d="M6 22c1-9 8-15 20-15-1 12-7 19-17 18" fill="#83cf76" stroke="#264d46" stroke-width="2"/><path d="M8 25 21 11m-7 8-1-5m5 1 5-1" fill="none" stroke="#e5ffd0" stroke-width="1.7"/>') },
  { name: 'effect-negative', description: 'Jagged spark for a harmful effect.', svg: iconSvg('<path d="m18 2-3 10H7l7 5-3 13 14-18h-8l3-10Z" fill="#e77668" stroke="#522d3c" stroke-width="2"/><path d="m16 14-3 2 3 1-1 5 6-8h-4l1-3Z" fill="#ffe1a0"/>') },
  { name: 'effect-neutral', description: 'Balanced ring and dots for a neutral effect.', svg: iconSvg('<circle cx="16" cy="16" r="11" fill="#8095a6" stroke="#34485a" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#d9e8e9"/><circle cx="16" cy="16" r="2" fill="#536b7b"/><path d="M16 2v3m0 22v3M2 16h3m22 0h3" stroke="#f3fbf7" stroke-width="1.5"/>') },
  { name: 'time-day', description: 'Daylight sun with eight clear rays.', svg: iconSvg('<circle cx="16" cy="16" r="7" fill="#ffd463" stroke="#765132" stroke-width="2"/><path d="M16 2v5m0 18v5M2 16h5m18 0h5M6 6l4 4m12 12 4 4m0-20-4 4m-12 12-4 4" stroke="#f4a84b" stroke-width="2.5" stroke-linecap="square"/><circle cx="14" cy="14" r="2" fill="#fff4be"/>') },
  { name: 'time-dusk', description: 'Sun setting behind a stepped horizon.', svg: iconSvg('<path d="M5 19a11 11 0 0 1 22 0" fill="#ef8c5a" stroke="#603d50" stroke-width="2"/><path d="M4 20h24v3H4z" fill="#64788a"/><path d="M3 25h8m3 0h4m3 0h8" stroke="#dce8e2" stroke-width="2"/><path d="M16 4v4m-9 1 3 3m15-3-3 3" stroke="#ffd77c" stroke-width="2"/>') },
  { name: 'time-night', description: 'Crescent moon above two stars.', svg: iconSvg('<path d="M21 5a12 12 0 1 0 6 18A10 10 0 0 1 21 5Z" fill="#b9d4e8" stroke="#34475f" stroke-width="2"/><path d="m9 5 1 2 2 1-2 1-1 2-1-2-2-1 2-1Zm12 15 .8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z" fill="#ffe18a"/>') },
  { name: 'sunset-warning', description: 'Setting sun with an attention ray.', svg: iconSvg('<path d="M6 20a10 10 0 0 1 20 0" fill="#f09b62" stroke="#5b3c4c" stroke-width="2"/><path d="M4 21h24v3H4zM7 27h5m4 0h3m4 0h3" stroke="#d8e5df" stroke-width="2"/><path d="m16 3 1.2 3 3 .4-2.4 2 1 3-2.8-1.7-2.7 1.7.8-3-2.3-2 3-.4Z" fill="#ffe484"/><path d="M16 15v3m0-12v1" stroke="#fff2bf" stroke-width="1.5"/>') },
  { name: 'hit-idle', description: 'Open centered sight with four short arms.', svg: iconSvg('<path d="M14 4h4v8h-4zM14 20h4v8h-4zM4 14h8v4H4zM20 14h8v4h-8z" fill="#edf5ee" stroke="#30404d" stroke-width="1.5"/><circle cx="16" cy="16" r="2" fill="#edf5ee" stroke="#30404d" stroke-width="1.5"/>') },
  { name: 'hit-confirm', description: 'Four radiating marks around a clear center.', svg: iconSvg('<path d="M13 2h6v8h-6zM13 22h6v8h-6zM2 13h8v6H2zM22 13h8v6h-8z" fill="#ffe17a" stroke="#5b4050" stroke-width="1.5"/><path d="m16 11 1.6 3.4L21 16l-3.4 1.6L16 21l-1.6-3.4L11 16l3.4-1.6Z" fill="#fff8da" stroke="#453f50" stroke-width="1.2"/>') },
]

const compareNames = (left, right) => {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

const sortedIcons = [...icons].sort((left, right) => compareNames(left.name, right.name))

const domainTsModule = `/** Generated by scripts/generate-hud-assets.mjs. Do not edit. */
export type HudIconName =
${sortedIcons.map(({ name }) => `  | '${name}'`).join('\n')}
`

const manifest = {
  schemaVersion: 1,
  title: 'HUD vector symbols',
  authorship: 'Original vector artwork authored for this repository by project contributors.',
  provenance: 'Every symbol is drawn from geometric SVG paths and shapes in scripts/generate-hud-assets.mjs. No third-party artwork or upstream game assets were used as a source.',
  license: {
    name: 'MIT',
    notice: 'Distributed under the repository root LICENSE.',
  },
  generator: 'scripts/generate-hud-assets.mjs',
  outputs: [
    ...icons.map(({ name, description }) => ({ file: `${name}.svg`, name, description })),
    { file: '../../src/domain/hud-icons.generated.ts', name: 'HUD icon-name type', description: 'Generated shared icon-name union.' },
    { file: '../../src/application/hud-icons.generated.ts', name: 'HUD icon SVG module', description: 'Generated inline SVG strings and data URI helper.' },
  ],
}

const tsModule = `/** Generated by scripts/generate-hud-assets.mjs. Do not edit. */
import type { HudIconName } from '../domain/hud-icons.generated.js'
export type { HudIconName }

export const HUD_ICON_NAMES = [
${icons.map(({ name }) => `  '${name}',`).join('\n')}
] as const

export const HUD_ICON_SVG: Readonly<Record<HudIconName, string>> = {
${sortedIcons.map(({ name, svg }) => `  '${name}': ${JSON.stringify(svg)},`).join('\n')}
}

type HudIconDataUri = \`data:image/svg+xml,\${string}\`

export const hudIconDataUri = (name: HudIconName): HudIconDataUri =>
  \`data:image/svg+xml,\${encodeURIComponent(HUD_ICON_SVG[name])}\`
`

const outputs = new Map([
  ...icons.map(({ name, svg }) => [`assets/hud/${name}.svg`, svg]),
  ['assets/hud/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
  ['src/domain/hud-icons.generated.ts', domainTsModule],
  ['src/application/hud-icons.generated.ts', tsModule],
])

const checkOnly = process.argv.length === 3 && process.argv[2] === '--check'
if (process.argv.length > 2 && !checkOnly) {
  process.stderr.write('Usage: node scripts/generate-hud-assets.mjs [--check]\n')
  process.exitCode = 2
} else {
  if (checkOnly) {
    const results = await Promise.all([...outputs].map(async ([relativePath, expected]) => {
      const outputPath = resolve(root, relativePath)
      if (!existsSync(outputPath)) {
        return { relativePath, status: 'missing' }
      }
      const actual = await readFile(outputPath, 'utf8')
      return { relativePath, status: actual === expected ? 'current' : 'stale' }
    }))

    const staleCount = results.filter(({ status }) => status !== 'current').length
    for (const { relativePath, status } of results) {
      if (status === 'missing') {
        process.stderr.write(`Missing generated output: ${relativePath}\n`)
      } else if (status === 'stale') {
        process.stderr.write(`Stale generated output: ${relativePath}\n`)
      }
    }

    if (staleCount > 0) {
      process.exitCode = 1
    } else {
      process.stdout.write(`Verified ${outputs.size} generated outputs.\n`)
    }
  } else {
    await Promise.all([...outputs].map(async ([relativePath, expected]) => {
      const outputPath = resolve(root, relativePath)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, expected)
    }))
    process.stdout.write(`Generated ${outputs.size} deterministic HUD outputs.\n`)
  }
}
