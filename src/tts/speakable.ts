const SCALE: Record<string, string> = { k: 'thousand', m: 'million', b: 'billion', t: 'trillion' }
const CURRENCY: Record<string, string> = { $: 'dollars', '€': 'euros', '£': 'pounds', '¥': 'yen' }

/**
 * Rewrites on screen text into something a TTS model reads naturally:
 * "$4.2M" -> "4.2 million dollars", "37%" -> "37 percent", "1.1°C" -> "1.1 degrees Celsius".
 */
export function speakable(text: string): string {
  return text
    .replace(/([$€£¥])\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmMbBtT])\b/g, (_, c: string, n: string, s: string) => `${n} ${SCALE[s.toLowerCase()]} ${CURRENCY[c]}`)
    .replace(/([$€£¥])\s?(\d[\d,]*(?:\.\d+)?)\s?(thousand|million|billion|trillion)\b/gi, (_, c: string, n: string, s: string) => `${n} ${s} ${CURRENCY[c]}`)
    .replace(/([$€£¥])\s?(\d[\d,]*(?:\.\d+)?)/g, (_, c: string, n: string) => {
      const [whole, cents] = n.split('.')
      return cents && cents.length === 2 && Number(cents) > 0 && !n.includes(',')
        ? `${whole} ${CURRENCY[c]} and ${Number(cents)} cents`
        : `${n} ${CURRENCY[c]}`
    })
    .replace(/(\d)\s?([kKmMbB])\b/g, (_, d: string, s: string) => `${d} ${SCALE[s.toLowerCase()]}`)
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/(\d)\s?°\s?C\b/g, '$1 degrees Celsius')
    .replace(/(\d)\s?°\s?F\b/g, '$1 degrees Fahrenheit')
    .replace(/(\d)\s?×/g, '$1 times')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\bvs\.?\s/gi, 'versus ')
    .replace(/\be\.g\.,?\s/gi, 'for example, ')
    .replace(/\bi\.e\.,?\s/gi, 'that is, ')
    .replace(/\betc\.?/gi, 'and so on')
    .replace(/[→⟶]/g, ' to ')
    .replace(/·/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}
