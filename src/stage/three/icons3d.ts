import { ExtrudeGeometry, Vector2, Vector3, type BufferGeometry, type Shape } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import DATA from '../../motion/icons.json'

export interface IconGeometry {
  /** The line drawing (`f`), a bevelled solid. */
  front: BufferGeometry
  /** The duotone background (`b`) as a thin slab behind the front, or null when the icon has none. */
  back: BufferGeometry | null
}

interface IconDef {
  n: string
  t: string
  b: string
  f: string
}

const BY_NAME = new Map((DATA as IconDef[]).map((i) => [i.n, i]))
const FALLBACK = 'sparkle'

/** Thickness of the front solid, of its bevel and of the back slab, world units. */
export const ICON_DEPTH = 0.16
export const ICON_BEVEL = 0.03
export const ICON_SLAB = 0.04
/** Gap between the front's back face and the slab, so the two never share a plane. */
const SLAB_GAP = 0.01
const BEVEL_SEGMENTS = 3
const CURVE_SEGMENTS = 8

const cache = new Map<string, IconGeometry>()

/** The solids (with their holes) of one Phosphor path on the 256 grid. */
function shapesOf(d: string): Shape[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="${d}"/></svg>`
  return new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes())
}

function size(shapes: Shape[]): Vector2 {
  const min = new Vector2(Infinity, Infinity)
  const max = new Vector2(-Infinity, -Infinity)
  for (const shape of shapes) {
    for (const p of shape.getPoints()) {
      min.min(p)
      max.max(p)
    }
  }
  return max.sub(min)
}

function build(def: IconDef): IconGeometry {
  const shapes = shapesOf(def.f)
  const extent = size(shapes)
  // World units per grid unit. The bevel widens the body by ICON_BEVEL on every side, so the drawing itself
  // spans 1 - 2 * ICON_BEVEL and the finished solid exactly 1.
  const s = (1 - 2 * ICON_BEVEL) / Math.max(extent.x, extent.y)
  const front = new ExtrudeGeometry(shapes, {
    depth: ICON_DEPTH / s,
    bevelEnabled: true,
    bevelThickness: ICON_BEVEL / s,
    bevelSize: ICON_BEVEL / s,
    bevelOffset: 0,
    bevelSegments: BEVEL_SEGMENTS,
    curveSegments: CURVE_SEGMENTS,
  })
  front.scale(s, s, s)
  // SVG y runs down. A half turn about x puts it up without mirroring, so the faces keep their winding.
  front.rotateX(Math.PI)
  front.computeBoundingBox()
  const c = front.boundingBox!.getCenter(new Vector3())
  front.translate(-c.x, -c.y, -c.z)
  front.userData.shared = true

  const backShapes = def.b ? shapesOf(def.b) : []
  let back: BufferGeometry | null = null
  if (backShapes.length) {
    back = new ExtrudeGeometry(backShapes, { depth: ICON_SLAB / s, bevelEnabled: false, curveSegments: CURVE_SEGMENTS })
    back.scale(s, s, s)
    // After the half turn the slab spans z from -ICON_SLAB to 0; it then moves behind the front's back face.
    back.rotateX(Math.PI)
    back.translate(-c.x, -c.y, -(ICON_DEPTH / 2 + ICON_BEVEL + SLAB_GAP))
    back.userData.shared = true
  }
  return { front, back }
}

/**
 * The geometry of a Phosphor icon: the line drawing extruded ICON_DEPTH with an ICON_BEVEL bevel, and the duotone
 * background as an ICON_SLAB thick slab behind it. Both are y up, share one scale (the front's larger side is 1
 * unit, bevel included) and are centred on the front. Built once per name and shared by every actor that uses it
 * (`userData.shared`), so disposing an actor must leave it alone. An unknown name gets the `sparkle` icon.
 */
export function iconGeometry(name: string): IconGeometry {
  let g = cache.get(name)
  if (!g) {
    const def = BY_NAME.get(name) ?? BY_NAME.get(FALLBACK)!
    g = cache.get(def.n) ?? build(def)
    cache.set(def.n, g)
    cache.set(name, g)
  }
  return g
}
