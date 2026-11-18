// Whether this browser can run the 3D stage, and which renderer a video uses.

let cached: boolean | null = null

function probe(): boolean {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false
  if (new URLSearchParams(location.search).get('visuals') === '2d') return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    // Browsers allow only a few live contexts; the probe gives its own back at once.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** True when a WebGL2 context can be created here, checked once. `?visuals=2d` in the URL forces false, for testing. */
export function supportsWebGL2(): boolean {
  cached ??= probe()
  return cached
}

/** The renderer a video uses: 3D only when the viewer wants it and the browser supports it. */
export const renderMode = (setting: boolean, supported: boolean): '3d' | '2d' => (setting && supported ? '3d' : '2d')
