export interface Theme {
  id: ThemeId
  label: string
  bg: string
  surface: string
  ink: string
  inkSoft: string
  muted: string
  grid: string
  axis: string
  accent: string
  /** Text drawn on an accent fill. */
  onAccent: string
  deemph: string
  /** Categorical order validated for adjacent pairs (lines, grouped bars). */
  series: string[]
  /** Three hues validated for all pairs, for pie slices. A fourth slice is always "Other". */
  pie: string[]
  other: string
  dot: string
}

export type ThemeId = 'night' | 'paper' | 'graphite'

// Every categorical set below passed the dataviz validator against its own background
// (CVD separation, normal vision floor, lightness band, contrast).
export const THEMES: Record<ThemeId, Theme> = {
  night: {
    id: 'night',
    label: 'Night',
    bg: '#000000',
    surface: '#181818',
    ink: '#F5F2EA',
    inkSoft: '#C3C2B7',
    muted: '#898781',
    grid: '#272727',
    axis: '#3A3A38',
    accent: '#2CA942',
    onAccent: '#000000',
    deemph: '#4A4944',
    series: ['#2CA942', '#3987e5', '#d95926', '#9085e9', '#d55181'],
    pie: ['#2CA942', '#3987e5', '#d55181'],
    other: '#6b6a64',
    dot: 'rgba(245,242,234,0.07)',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    bg: '#F5F2EA',
    surface: '#EBE8E1',
    ink: '#0A0A0A',
    inkSoft: '#4D4D4D',
    muted: '#666666',
    grid: '#DFDBD1',
    axis: '#C3C2B7',
    accent: '#1F7A30',
    onAccent: '#FFFFFF',
    deemph: '#C9C5BA',
    series: ['#1F7A30', '#2a78d6', '#eb6834', '#6250d6', '#e87ba4'],
    pie: ['#1F7A30', '#2a78d6', '#e87ba4'],
    other: '#9c9a92',
    dot: 'rgba(10,10,10,0.07)',
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    bg: '#1F1F1F',
    surface: '#272727',
    ink: '#F0EFEC',
    inkSoft: '#C3C2B7',
    muted: '#898781',
    grid: '#313131',
    axis: '#444441',
    accent: '#3987e5',
    onAccent: '#0A0A0A',
    deemph: '#4D4D4A',
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
    pie: ['#3987e5', '#d95926', '#199e70'],
    other: '#807e78',
    dot: 'rgba(240,239,236,0.06)',
  },
}
