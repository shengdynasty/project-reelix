// The online step after planning (structures and photos) is a bonus: when its code cannot load or a source fails,
// the video goes ahead without it. Only a cancel stops the video.
import type { IngestedImage } from '../ingest/types'
import type { Storyboard } from '../model/storyboard'

type PhotosModule = Pick<typeof import('../photos'), 'attachMolecules' | 'attachPhotos'>

export async function addOnlineVisuals(
  sb: Storyboard,
  opts: { article: string; searchScenes: boolean; exclude: string[]; signal?: AbortSignal },
  load: () => Promise<PhotosModule> = () => import('../photos'),
): Promise<{ storyboard: Storyboard; images: IngestedImage[] }> {
  try {
    const { attachMolecules, attachPhotos } = await load()
    // Structures first: a scene that shows a molecule is not given a photo it would not show. Only for text from the
    // Wikipedia article: a term from the user's own files never leaves the device.
    const withMolecules = opts.searchScenes ? await attachMolecules(sb, { signal: opts.signal }) : sb
    return await attachPhotos(withMolecules, opts)
  } catch (err) {
    if (opts.signal?.aborted) throw err
    return { storyboard: sb, images: [] }
  }
}
