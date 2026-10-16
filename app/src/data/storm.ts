import type { LiveStatus } from './liveTypes'

/** Current storm centre: official MMS position first, else the latest observed GDACS track point. */
export function stormCentre(live?: LiveStatus): [number, number] | undefined {
  if (live?.cyclone) return [live.cyclone.lon, live.cyclone.lat]
  for (const t of live?.tracks ?? []) {
    const observed = t.features.filter((f) => f.properties.kind === 'track' && !f.properties.forecast)
    const last = observed[observed.length - 1]
    if (last && last.geometry.type === 'LineString') return last.geometry.coordinates[last.geometry.coordinates.length - 1] as [number, number]
  }
  return undefined
}
