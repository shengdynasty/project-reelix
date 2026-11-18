export type ToWorker =
  | { type: 'load'; threads: number }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }

export type FromWorker =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; message: string }
  | { type: 'log'; message: string }
