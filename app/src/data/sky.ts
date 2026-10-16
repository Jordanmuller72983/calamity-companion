// Sky words and wind thresholds for the town cards, from Open-Meteo values.

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'heavyRain' | 'showers' | 'thunder'

// WMO weather codes (used by Open-Meteo) → a short sky word.
export function skyOf(code: number): Sky {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return code >= 65 ? 'heavyRain' : 'rain'
  if (code >= 80 && code <= 82) return code === 82 ? 'heavyRain' : 'showers'
  if (code >= 95) return 'thunder'
  return 'cloudy'
}

/** Breezy enough to show wind streaks on the card. Strong-wind warnings stay with the gust figure (≥ 60 km/h). */
export const isWindy = (windKmh: number, gustKmh: number) => windKmh >= 25 || gustKmh >= 45

export const isWet = (sky: Sky) => sky === 'drizzle' || sky === 'rain' || sky === 'heavyRain' || sky === 'showers' || sky === 'thunder'
