// Procedural 3D models the topic kits put in a scene instead of its icon. Each fits the unit box an icon fills at
// scale 1 (the hero's scale then sizes it like the icon it replaces), is built from plain geometry with no
// downloads, and is the same every time it is built. Parts that move carry `userData.motion` for the stage to pose.
import {
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  type Object3D,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  BoxGeometry,
} from 'three'
import type { ModelName } from '../kits'
import type { Molecule } from '../kits/molecule'
import { solidMaterial, type StagePalette } from './materials'

export const MODEL_NAMES: ModelName[] = ['black-hole', 'galaxy', 'planet', 'star', 'volcano', 'water-cycle', 'strata', 'cell', 'dna', 'virus', 'antibody', 'prism', 'scatter', 'globe']

/** How a part moves with time (moveModel): a steady turn about y, a steady turn in its own plane (z), a sway, or a drift down. */
export type ModelMotion = 'spin' | 'twirl' | 'roll' | 'fall'

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
/** In the optics models the colour is the content (blue scatters, red passes, a prism spreads a spectrum), so they keep it on every theme. */
const LIGHT = { sun: '#fff1b8', blue: '#4c8dff', red: '#ff5a3c', spectrum: ['#ff4d4d', '#ff9f1c', '#ffe14d', '#3ddc84', '#4c8dff', '#9b5cff'] }

function mesh(geometry: Mesh['geometry'], material: Material, at: [number, number, number] = [0, 0, 0], motion?: ModelMotion): Mesh {
  const m = new Mesh(geometry, material)
  m.position.set(...at)
  m.castShadow = true
  if (motion) m.userData.motion = motion
  return m
}

const glow = (p: StagePalette, color = p.accent) => solidMaterial(color, { emissive: color, baseGlow: 0.9 })
const series = (p: StagePalette, i: number) => p.series[i % p.series.length]
/** Points spread evenly over a sphere of radius r (a golden spiral), so the same n gives the same points. */
const spherePoints = (n: number, r: number) =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const ring = Math.sqrt(1 - y * y)
    return new Vector3(Math.cos(GOLDEN * i) * ring * r, y * r, Math.sin(GOLDEN * i) * ring * r)
  })
/** A thin rod from a to b. */
function rod(a: Vector3, b: Vector3, radius: number, material: Material): Mesh {
  const m = mesh(new CylinderGeometry(radius, radius, a.distanceTo(b), 8), material)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}

const BUILDERS: Record<ModelName, (p: StagePalette) => Group> = {
  globe: (p) => {
    const g = new Group()
    const earth = new Group()
    earth.userData.motion = 'spin'
    earth.add(mesh(new SphereGeometry(0.4, 48, 24), solidMaterial(series(p, 0), { roughness: 0.7 })))
    // Land as low domes on the sphere, then a graticule: three parallels and four meridians.
    for (const [lat, lon, r] of [[0.5, 0.3, 0.16], [-0.3, 1.2, 0.13], [0.2, 2.6, 0.18], [-0.6, 3.8, 0.1], [0.9, 4.9, 0.12]] as const) {
      const at = new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(0.36)
      earth.add(mesh(new SphereGeometry(r, 16, 8), solidMaterial(series(p, 2), { roughness: 0.9 }), at.toArray() as [number, number, number]))
    }
    for (const lat of [-0.6, 0, 0.6]) {
      const parallel = mesh(new TorusGeometry(0.41 * Math.cos(lat), 0.004, 4, 64), solidMaterial(p.muted), [0, 0.41 * Math.sin(lat), 0])
      parallel.rotation.x = Math.PI / 2
      earth.add(parallel)
    }
    for (let i = 0; i < 4; i++) {
      const meridian = mesh(new TorusGeometry(0.41, 0.004, 4, 64), solidMaterial(p.muted))
      meridian.rotation.y = (i * Math.PI) / 4
      earth.add(meridian)
    }
    g.add(earth)
    // A pin on the front of the globe, where the camera sees it.
    g.add(rod(new Vector3(0.12, 0.2, 0.36), new Vector3(0.16, 0.34, 0.46), 0.012, solidMaterial(p.ink)))
    g.add(mesh(new SphereGeometry(0.05, 16, 8), glow(p), [0.16, 0.36, 0.47]))
    return g
  },
  'black-hole': (p) => {
    const g = new Group()
    g.add(mesh(new SphereGeometry(0.2, 32, 16), new MeshBasicMaterial({ color: '#000000' })))
    const disk = mesh(new RingGeometry(0.25, 0.52, 64, 2), glow(p), [0, 0, 0], 'twirl')
    ;(disk.material as Material).side = DoubleSide
    disk.rotation.x = -Math.PI * 0.42
    g.add(disk)
    g.add(mesh(new TorusGeometry(0.27, 0.02, 8, 64), glow(p, p.ink)))
    return g
  },
  galaxy: (p) => {
    const g = new Group()
    const arms = new Group()
    arms.userData.motion = 'spin'
    const star = new SphereGeometry(0.022, 6, 4)
    for (let i = 0; i < 90; i++) {
      const arm = i % 2
      const t = i / 90
      const angle = t * Math.PI * 3 + arm * Math.PI
      const r = 0.06 + t * 0.46
      arms.add(mesh(star, glow(p, i % 5 ? p.ink : p.accent), [Math.cos(angle) * r, Math.sin(i * 1.7) * 0.03, Math.sin(angle) * r]))
    }
    g.add(arms, mesh(new SphereGeometry(0.09, 16, 8), glow(p)))
    g.rotation.x = Math.PI * 0.18
    return g
  },
  planet: (p) => {
    const g = new Group()
    g.add(mesh(new SphereGeometry(0.3, 32, 16), solidMaterial(series(p, 0)), [0, 0, 0], 'spin'))
    const ring = mesh(new RingGeometry(0.38, 0.52, 64), solidMaterial(p.muted, { baseOpacity: 0.85 }))
    ;(ring.material as Material).side = DoubleSide
    ring.rotation.x = -Math.PI * 0.4
    const orbit = new Group()
    orbit.userData.motion = 'spin'
    orbit.add(mesh(new SphereGeometry(0.06, 16, 8), solidMaterial(p.object), [0.48, 0.12, 0]))
    g.add(ring, orbit)
    return g
  },
  star: (p) => {
    const g = new Group()
    g.add(mesh(new SphereGeometry(0.34, 32, 16), glow(p), [0, 0, 0], 'spin'))
    g.add(mesh(new SphereGeometry(0.46, 32, 16), solidMaterial(p.accent, { emissive: p.accent, baseGlow: 0.5, baseOpacity: 0.25 })))
    return g
  },
  volcano: (p) => {
    const g = new Group()
    g.add(mesh(new CylinderGeometry(0.1, 0.5, 0.55, 32, 1), solidMaterial(p.object, { roughness: 0.9 }), [0, -0.22, 0]))
    g.add(mesh(new CylinderGeometry(0.09, 0.09, 0.02, 24), glow(p), [0, 0.06, 0]))
    const plume = new Group()
    plume.userData.motion = 'spin'
    for (let i = 0; i < 6; i++) plume.add(mesh(new SphereGeometry(0.05 + i * 0.012, 12, 8), glow(p), [Math.sin(i * 2.1) * 0.06, 0.14 + i * 0.055, Math.cos(i * 2.1) * 0.06]))
    g.add(plume)
    return g
  },
  'water-cycle': (p) => {
    const g = new Group()
    g.add(mesh(new CylinderGeometry(0.5, 0.5, 0.06, 48), solidMaterial(series(p, 0)), [0, -0.42, 0]))
    g.add(mesh(new SphereGeometry(0.1, 16, 8), glow(p), [-0.38, 0.38, 0]))
    for (const [x, r] of [[0.05, 0.13], [0.2, 0.15], [0.35, 0.11]] as const) g.add(mesh(new SphereGeometry(r, 16, 8), solidMaterial(p.ink), [x, 0.3, 0]))
    const rain = new Group()
    rain.userData.motion = 'fall'
    for (let i = 0; i < 8; i++) rain.add(mesh(new CapsuleGeometry(0.012, 0.06, 2, 6), solidMaterial(series(p, 0)), [0.02 + (i % 4) * 0.1, 0.1 - Math.floor(i / 4) * 0.18, ((i * 3) % 4) * 0.04 - 0.06]))
    g.add(rain)
    return g
  },
  strata: (p) => {
    const g = new Group()
    for (let i = 0; i < 4; i++) g.add(mesh(new BoxGeometry(1, 0.2, 0.6), solidMaterial(i % 2 ? p.muted : series(p, i), { roughness: 0.85 }), [i % 2 ? 0.04 : -0.04, -0.3 + i * 0.2, 0]))
    return g
  },
  cell: (p) => {
    const g = new Group()
    g.add(mesh(new SphereGeometry(0.5, 32, 16), solidMaterial(series(p, 1), { baseOpacity: 0.3 })))
    g.add(mesh(new SphereGeometry(0.16, 24, 12), glow(p), [0.05, 0.04, 0]))
    const inside = new Group()
    inside.userData.motion = 'spin'
    for (const at of spherePoints(5, 0.3)) {
      const m = mesh(new CapsuleGeometry(0.04, 0.1, 4, 8), solidMaterial(series(p, 2)), at.toArray() as [number, number, number])
      m.rotation.z = at.x * 4
      inside.add(m)
    }
    g.add(inside)
    return g
  },
  dna: (p) => {
    const g = new Group()
    g.userData.motion = 'spin'
    const turns = 2
    const strand = (phase: number) =>
      new CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => new Vector3(Math.cos((i / 32) * turns * Math.PI * 2 + phase) * 0.22, -0.48 + (i / 32) * 0.96, Math.sin((i / 32) * turns * Math.PI * 2 + phase) * 0.22)))
    const a = strand(0)
    const b = strand(Math.PI)
    g.add(mesh(new TubeGeometry(a, 96, 0.03, 8), solidMaterial(series(p, 0))), mesh(new TubeGeometry(b, 96, 0.03, 8), solidMaterial(series(p, 1))))
    for (let i = 1; i < 12; i++) g.add(rod(a.getPoint(i / 12), b.getPoint(i / 12), 0.012, i % 2 ? glow(p) : solidMaterial(p.ink)))
    return g
  },
  virus: (p) => {
    const g = new Group()
    g.userData.motion = 'spin'
    g.add(mesh(new SphereGeometry(0.3, 32, 16), solidMaterial(series(p, 2))))
    const head = new SphereGeometry(0.045, 12, 8)
    for (const at of spherePoints(24, 1)) {
      g.add(rod(at.clone().multiplyScalar(0.28), at.clone().multiplyScalar(0.44), 0.015, solidMaterial(p.object)))
      g.add(mesh(head, glow(p), at.clone().multiplyScalar(0.46).toArray() as [number, number, number]))
    }
    return g
  },
  antibody: (p) => {
    const g = new Group()
    const body = solidMaterial(series(p, 0))
    const fork = new Vector3(0, 0, 0)
    g.add(rod(new Vector3(0, -0.46, 0), fork, 0.06, body))
    for (const side of [-1, 1]) {
      const tip = new Vector3(side * 0.34, 0.4, 0)
      g.add(rod(fork, tip, 0.06, body))
      g.add(mesh(new SphereGeometry(0.08, 16, 8), glow(p), tip.toArray() as [number, number, number]))
    }
    g.userData.motion = 'roll'
    return g
  },
  prism: (p) => {
    const g = new Group()
    const glass = mesh(new CylinderGeometry(0.3, 0.3, 0.42, 3), solidMaterial(p.ink, { baseOpacity: 0.35, roughness: 0.1 }))
    glass.rotation.x = Math.PI / 2
    g.add(glass)
    g.add(rod(new Vector3(-0.54, -0.2, 0), new Vector3(-0.12, 0, 0), 0.015, glow(p, p.ink)))
    LIGHT.spectrum.forEach((colour, i) => g.add(rod(new Vector3(0.14, 0, 0), new Vector3(0.54, -0.02 - i * 0.06, 0), 0.014, glow(p, colour))))
    return g
  },
  scatter: (p) => {
    const g = new Group()
    g.add(mesh(new SphereGeometry(0.11, 16, 8), glow(p, LIGHT.sun), [-0.42, 0.38, 0]))
    const air = new Group()
    air.userData.motion = 'spin'
    const molecule = new SphereGeometry(0.035, 12, 8)
    for (let i = 0; i < 9; i++) air.add(mesh(molecule, solidMaterial(p.muted), [-0.15 + (i % 3) * 0.17, -0.05 - Math.floor(i / 3) * 0.17, ((i * 2) % 3) * 0.08 - 0.08]))
    g.add(air)
    // Red passes straight through; blue scatters every way from the air.
    g.add(rod(new Vector3(-0.34, 0.3, 0), new Vector3(0.54, -0.45, 0), 0.012, glow(p, LIGHT.red)))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      g.add(rod(new Vector3(0.02, -0.22, 0), new Vector3(0.02 + Math.cos(a) * 0.3, -0.22 + Math.sin(a) * 0.3, 0), 0.01, glow(p, LIGHT.blue)))
    }
    return g
  },
}

/** Keeps a model's moving parts at their built pose, which moveModel offsets, inside an outer group the stage poses. */
function wrap(inner: Group, name: string): Group {
  inner.traverse((o) => {
    if (o.userData.motion) o.userData.base = { ry: o.rotation.y, rz: o.rotation.z, py: o.position.y }
  })
  const outer = new Group()
  outer.add(inner)
  outer.userData.model = name
  return outer
}

/** The model `name` built for `palette`, centred at the origin inside the unit box. */
export function buildModel(name: ModelName, palette: StagePalette): Group {
  return wrap(BUILDERS[name](palette), name)
}

/** Radians a second for a turn, how far and how fast a sway goes, and how fast and far rain drifts down. */
const SPIN_RATE = 0.6
const SWAY = 0.15
const SWAY_HZ = 0.25
const FALL_RATE = 0.25
const FALL_SPAN = 0.18
/** Reduced motion keeps the movement, slower. */
const CALM = 0.3

/** Poses a model's moving parts at time `t` ms from their built pose alone, so any frame can be drawn in any order. */
export function moveModel(model: Object3D, t: number, reducedMotion: boolean): void {
  const s = (t / 1000) * (reducedMotion ? CALM : 1)
  model.traverse((o) => {
    const base = o.userData.base as { ry: number; rz: number; py: number } | undefined
    if (!base) return
    switch (o.userData.motion as ModelMotion) {
      case 'spin':
        o.rotation.y = base.ry + SPIN_RATE * s
        break
      case 'twirl':
        o.rotation.z = base.rz + SPIN_RATE * s
        break
      case 'roll':
        o.rotation.z = base.rz + SWAY * Math.sin(2 * Math.PI * SWAY_HZ * s)
        break
      case 'fall':
        o.position.y = base.py - ((FALL_RATE * s) % FALL_SPAN)
        break
    }
  })
}

/** Atoms fill a sphere this wide, so the longest molecule still fits the unit box with its balls. */
const MOLECULE_RADIUS = 0.42

/**
 * A ball and stick model of `mol`: hydrogen small and pale, carbon in the object colour, oxygen and nitrogen in the
 * theme's series, anything else in the accent; centred and scaled so it fits the unit box like the other models.
 */
export function buildMolecule(mol: Molecule, palette: StagePalette): Group {
  const g = new Group()
  g.userData.motion = 'spin'
  const n = mol.atoms.length
  const centre = mol.atoms.reduce((c, a) => c.add(new Vector3(a.x, a.y, a.z)), new Vector3()).divideScalar(n)
  const spread = Math.max(...mol.atoms.map((a) => new Vector3(a.x, a.y, a.z).distanceTo(centre)), 1e-6)
  const k = MOLECULE_RADIUS / spread
  const at = mol.atoms.map((a) => new Vector3(a.x, a.y, a.z).sub(centre).multiplyScalar(k))
  const ball = (e: string) => (e === 'H' ? 0.05 : 0.09)
  const colour = (e: string) => (e === 'H' ? palette.ink : e === 'C' ? palette.object : e === 'O' ? series(palette, 3) : e === 'N' ? series(palette, 0) : palette.accent)
  mol.atoms.forEach((a, i) => g.add(mesh(new SphereGeometry(Math.min(ball(a.element), 0.55 - MOLECULE_RADIUS), 16, 8), solidMaterial(colour(a.element)), at[i].toArray() as [number, number, number])))
  for (const b of mol.bonds) g.add(rod(at[b.a], at[b.b], 0.012 * b.order + 0.008, solidMaterial(palette.muted)))
  return wrap(g, 'molecule')
}

