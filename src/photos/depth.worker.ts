// Runs Depth Anything V2 Small on one photo at a time and posts back an 8 bit depth map (larger is nearer).
import { RawImage, pipeline } from '@huggingface/transformers'
import type { DepthMap } from '../stage/types'

const MODEL = 'onnx-community/depth-anything-v2-small'

type Estimator = (image: RawImage) => Promise<{ depth: RawImage }>
let estimator: Promise<Estimator> | null = null

async function load(): Promise<Estimator> {
  const webgpu = 'gpu' in navigator && !!(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null))
  // q4f16 (19.1 MB) needs WebGPU's half floats; the WASM runtime gets the 8 bit model.
  return (await pipeline('depth-estimation', MODEL, { device: webgpu ? 'webgpu' : 'wasm', dtype: webgpu ? 'q4f16' : 'q8' })) as unknown as Estimator
}

self.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = e.data
  try {
    estimator ??= load()
    const run = await estimator
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    const { depth } = await run(new RawImage(pixels.data, bitmap.width, bitmap.height, 4))
    const map: DepthMap = { width: depth.width, height: depth.height, data: new Uint8Array(depth.data) }
    self.postMessage({ id, map }, { transfer: [map.data.buffer] })
  } catch (err) {
    estimator = null
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
