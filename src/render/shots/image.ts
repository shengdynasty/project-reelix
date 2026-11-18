import type { ShotEnv } from './env'
import { SANS, fitText, font } from '../text'
import { clamp01, ease, easeOutBack, lerp, progress } from '../easing'
import { fillRound, roundRect } from '../draw'

/** The image in a rounded frame with a slow push in, a light sweep, and a lower third caption. */
export function drawImageShot(env: ShotEnv) {
  const { ctx, t, theme, scene, dur } = env
  if (scene.visual.kind !== 'image') return
  const v = scene.visual
  const img = env.images.get(v.imageId)
  const areaW = 1640
  const areaH = 720
  const cy = -60
  const k = easeOutBack(progress(t, -100, 800))
  if (k <= 0) return
  if (!img) {
    fillRound(ctx, -areaW / 2, cy - areaH / 2, areaW, areaH, 28, theme.surface)
    font(ctx, 36, 500, SANS)
    ctx.fillStyle = theme.muted
    ctx.textAlign = 'center'
    ctx.fillText('Image unavailable', 0, cy)
    return
  }
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height
  const scale = Math.min(areaW / iw, areaH / ih)
  const w = iw * scale
  const h = ih * scale
  const zoom = lerp(1, 1.07, progress(t, 0, dur))
  ctx.save()
  ctx.translate(0, cy + (1 - k) * 80)
  ctx.globalAlpha *= clamp01(k * 1.4)
  fillRound(ctx, -w / 2 - 14, -h / 2 - 14, w + 28, h + 28, 34, theme.surface)
  ctx.save()
  roundRect(ctx, -w / 2, -h / 2, w, h, 22)
  ctx.clip()
  ctx.scale(zoom, zoom)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  ctx.restore()
  // Light sweep across the frame once it lands.
  const sp = progress(t, 500, 900)
  if (sp > 0 && sp < 1) {
    ctx.save()
    roundRect(ctx, -w / 2, -h / 2, w, h, 22)
    ctx.clip()
    const x = lerp(-w / 2 - 300, w / 2 + 300, ease(sp))
    const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.restore()

  if (v.caption) {
    const ck = easeOutBack(progress(t, 650, 700))
    const f = fitText(ctx, v.caption, Math.min(w - 120, 1100), 2, 42, 30, 600)
    font(ctx, f.size, 600, SANS)
    const boxW = Math.max(...f.lines.map((l) => ctx.measureText(l).width)) + 72
    const boxH = f.lines.length * f.size * 1.25 + 44
    const bx = -w / 2 + 40
    const by = cy + h / 2 - boxH - 40
    ctx.save()
    ctx.globalAlpha *= clamp01(ck)
    ctx.translate((1 - ck) * -60, 0)
    fillRound(ctx, bx, by, boxW, boxH, 18, theme.bg)
    fillRound(ctx, bx, by, 10, boxH, [18, 0, 0, 18], theme.accent)
    ctx.fillStyle = theme.ink
    ctx.textBaseline = 'middle'
    f.lines.forEach((l, i) => ctx.fillText(l, bx + 40, by + 22 + f.size * 0.62 + i * f.size * 1.25))
    ctx.restore()
  }
}
