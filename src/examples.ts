export interface Example {
  id: string
  label: string
  prompt: string
  /** Files attached with the prompt, made in the browser so the example needs no download. */
  files?: () => File[]
}

const BAKERY_CSV = `Year, Revenue ($)
2019, 48200
2020, 51900
2021, 67400
2022, 88300
2023, 109600
2024, 131700`

/**
 * Short topics show the app filling in from limited information (via Wikipedia). The spreadsheet sample is a
 * fictional bakery, labeled as a sample in the interface.
 */
export const EXAMPLES: Example[] = [
  { id: 'vaccines', label: 'How do vaccines work?', prompt: 'How do vaccines work?' },
  { id: 'black-holes', label: 'Black holes', prompt: 'Black holes' },
  { id: 'sky', label: 'Why is the sky blue?', prompt: 'Why is the sky blue?' },
  {
    id: 'bakery',
    label: 'Sample spreadsheet',
    prompt:
      'Maple Street Bakery opened in 2019 as a two person stall selling sourdough at a weekend market. The biggest jump came after the bakery launched a weekday bread subscription, which now has 412 members. Online orders went from 9% of sales to 37% of sales in three years. Cinnamon rolls are the best seller, while seasonal pies bring in the most money per order.',
    files: () => [new File([BAKERY_CSV], 'maple-street-bakery-revenue.csv', { type: 'text/csv' })],
  },
]
