// Post effects for the 3D stage, with postprocessing: depth of field at the camera's focus, a little bloom on the
// brightest things, a vignette, film grain and ACES filmic tone mapping as the last step. A frame is a function of the
// scene and of the time the stage passes in (which seeds the grain), never of the frames rendered before it, so the
// same time always gives the same pixels.
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type EffectMaterial,
} from 'postprocessing'
import { HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three'
import { HOLD_DISTANCE } from '../layout'

export interface Fx {
  /** Depth of field focus distance, world units. */
  setFocus(distance: number): void
  /** Renders the scene with the effects. `time` (seconds) seeds the grain, so the same time gives the same frame. */
  render(time?: number): void
  setSize(width: number, height: number): void
  dispose(): void
}

/** Depth either side of the focus that stays sharp, world units: the piece on screen, not its neighbours 14 units away. */
const FOCUS_RANGE = 5
const BOKEH_SCALE = 2
const BLOOM_INTENSITY = 0.35
const BLOOM_THRESHOLD = 0.85
const BLOOM_SMOOTHING = 0.1
const VIGNETTE_DARKNESS = 0.35
const VIGNETTE_OFFSET = 0.3
const NOISE_OPACITY = 0.04
/** Multisample antialiasing of the frame buffer, capped by what the GPU allows. */
const MSAA_SAMPLES = 4

/** `depthOfField: false` (the medium tier) leaves the depth of field out; every other effect stays. */
export function createFx(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: 'preview' | 'export', opts: { depthOfField?: boolean } = {}): Fx {
  // Half float buffers keep the bloom's highlights and avoid banding in the fog; MSAA keeps edges and text clean.
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: Math.min(MSAA_SAMPLES, renderer.capabilities.maxSamples) })
  const dof =
    opts.depthOfField === false
      ? null
      : new DepthOfFieldEffect(camera, {
          focusDistance: HOLD_DISTANCE,
          focusRange: FOCUS_RANGE,
          bokehScale: BOKEH_SCALE,
          resolutionScale: quality === 'export' ? 0.75 : 0.5,
        })
  const bloom = new BloomEffect({ intensity: BLOOM_INTENSITY, luminanceThreshold: BLOOM_THRESHOLD, luminanceSmoothing: BLOOM_SMOOTHING, mipmapBlur: true })
  const vignette = new VignetteEffect({ darkness: VIGNETTE_DARKNESS, offset: VIGNETTE_OFFSET })
  // Grain that scales with the pixel, like film: blended in the linear HDR buffer, additive noise at this opacity would
  // lift black to about 50/255 once encoded, while premultiplied noise leaves black black and brings a little life to the lit parts.
  const noise = new NoiseEffect({ premultiply: true })
  noise.blendMode.opacity.value = NOISE_OPACITY
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
  const pass = dof ? new EffectPass(camera, dof, bloom, vignette, noise, tone) : new EffectPass(camera, bloom, vignette, noise, tone)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(pass)
  return {
    setFocus(distance) {
      if (dof) dof.cocMaterial.focusDistance = distance
    },
    render(time = 0) {
      // The grain reads the pass's time uniform; set from the frame time, with no delta, it depends on nothing else.
      ;(pass.fullscreenMaterial as EffectMaterial).time = time
      composer.render(0)
    },
    setSize(width, height) {
      composer.setSize(width, height)
    },
    dispose() {
      composer.dispose()
    },
  }
}
