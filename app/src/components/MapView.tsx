import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, LngLatBoundsLike, Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import type { CycloneInfo, LiveStatus, Report, TrackCollection, WaterStatusLive } from '../data/liveTypes'
import { stormCentre } from '../data/storm'
import { waterLevel } from '../data/water'
import './MapView.css'

// MapLibre 6 loads its worker as a separate module; point it at the file Vite serves/bundles.
maplibregl.setWorkerUrl(workerUrl)

// Free vector basemap (OpenStreetMap data), no API key.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const MAURITIUS_BOUNDS: LngLatBoundsLike = [
  [57.29, -20.53],
  [57.81, -19.97],
]

export interface MapLayers {
  cyclone: boolean
  reservoirs: boolean
  reports: boolean
}

export interface MapLabels {
  capacity: string
  noFigure: string
  levelOn: (pct: number, date: string) => string
  source: string
  reportKind: (kind: Report['kind']) => string
  reportedAgo: (iso: string) => string
  cyclone: (c: CycloneInfo) => string
}

interface Props {
  live?: LiveStatus
  water?: WaterStatusLive
  reports?: Report[]
  layers?: MapLayers
  /** 'cyclone' zooms out to show the storm and Mauritius together. */
  focus?: 'mauritius' | 'cyclone'
  labels: MapLabels
  /** Location picker mode (report form): tap to choose a point. */
  pick?: { value?: [number, number]; onPick: (lngLat: [number, number]) => void }
  className?: string
  interactive?: boolean
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const LEVEL_COLOR = { ok: '#1d6fd1', below: '#3f78c4', low: '#b45309', critical: '#b91c1c', unknown: '#8a96a3' }
const REPORT_COLOR: Record<Report['kind'], string> = {
  flood: '#1d6fd1',
  tree: '#15803d',
  power: '#ca8a04',
  landslide: '#92400e',
  water: '#0e7490',
  blocked: '#b91c1c',
  other: '#6b7280',
}

/** Point `km` away from (lat, lon) along `bearing` degrees. */
function destination(lat: number, lon: number, bearing: number, km: number): [number, number] {
  const R = 6371
  const d = km / R
  const b = (bearing * Math.PI) / 180
  const p1 = (lat * Math.PI) / 180
  const l1 = (lon * Math.PI) / 180
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [(l2 * 180) / Math.PI, (p2 * 180) / Math.PI]
}

function cycloneFeatures(live?: LiveStatus): TrackCollection {
  const features: TrackCollection['features'] = (live?.tracks ?? []).flatMap((t) => t.features)
  const c = live?.cyclone
  if (c?.movement?.bearing !== undefined) {
    // Arrow showing where the storm is heading over the next 12 hours at its current speed.
    const km = Math.max(c.movement.speedKmh * 12, 60)
    const tip = destination(c.lat, c.lon, c.movement.bearing, km)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[c.lon, c.lat], tip] },
      properties: { kind: 'track', forecast: false, category: 'heading', name: c.name ?? '' },
    })
    const left = destination(tip[1], tip[0], c.movement.bearing + 150, km * 0.18)
    const right = destination(tip[1], tip[0], c.movement.bearing - 150, km * 0.18)
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[tip, left, right, tip]] },
      properties: { kind: 'wind', level: 'heading', label: '', name: c.name ?? '' },
    })
  }
  return { type: 'FeatureCollection', features }
}

function reservoirFeatures(water?: WaterStatusLive) {
  return {
    type: 'FeatureCollection' as const,
    features: (water?.reservoirs ?? []).map((r) => {
      const last = r.readings[r.readings.length - 1]
      const level = last ? waterLevel(last.pct) : 'unknown'
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
        properties: {
          id: r.id,
          name: r.name,
          label: last ? `${r.name}\n${last.pct.toFixed(last.pct % 1 ? 1 : 0)}%` : r.name,
          color: LEVEL_COLOR[level],
          hasLevel: !!last,
          capacityNum: parseFloat(r.capacity) || 1,
        },
      }
    }),
  }
}

function reportFeatures(reports?: Report[]) {
  return {
    type: 'FeatureCollection' as const,
    features: (reports ?? []).map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
      properties: { id: r.id, color: REPORT_COLOR[r.kind] },
    })),
  }
}

export default function MapView({ live, water, reports, layers = { cyclone: true, reservoirs: true, reports: true }, focus = 'mauritius', labels, pick, className, interactive = true }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const pickMarker = useRef<maplibregl.Marker | null>(null)
  const stormMarker = useRef<maplibregl.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Latest props for event handlers registered once.
  const latest = useRef({ water, reports, labels, pick, live })
  latest.current = { water, reports, labels, pick, live }

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      bounds: MAURITIUS_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      interactive,
      cooperativeGestures: !pick && interactive,
    })
    map.current = m
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('error', (e) => {
      if (!m.isStyleLoaded() && /style|fetch/i.test(String(e.error?.message))) setFailed(true)
    })

    m.on('load', () => {
      m.addSource('cyclone', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'cyc-wind', type: 'fill', source: 'cyclone', filter: ['all', ['==', ['get', 'kind'], 'wind'], ['!=', ['get', 'level'], 'heading']], paint: { 'fill-color': ['match', ['get', 'level'], 'red', '#dc2626', 'orange', '#f97316', '#eab308'], 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'cyc-cone', type: 'fill', source: 'cyclone', filter: ['==', ['get', 'kind'], 'cone'], paint: { 'fill-color': '#7f1d1d', 'fill-opacity': 0.1 } })
      m.addLayer({ id: 'cyc-cone-line', type: 'line', source: 'cyclone', filter: ['==', ['get', 'kind'], 'cone'], paint: { 'line-color': '#7f1d1d', 'line-opacity': 0.4, 'line-width': 1 } })
      m.addLayer({ id: 'cyc-track', type: 'line', source: 'cyclone', filter: ['all', ['==', ['get', 'kind'], 'track'], ['!=', ['get', 'category'], 'heading'], ['==', ['get', 'forecast'], false]], paint: { 'line-color': '#7f1d1d', 'line-width': 2.5 }, layout: { 'line-cap': 'round' } })
      m.addLayer({ id: 'cyc-forecast', type: 'line', source: 'cyclone', filter: ['all', ['==', ['get', 'kind'], 'track'], ['==', ['get', 'forecast'], true]], paint: { 'line-color': '#7f1d1d', 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'cyc-points', type: 'circle', source: 'cyclone', filter: ['==', ['get', 'kind'], 'point'], paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-color': '#7f1d1d', 'circle-stroke-width': 1.5 } })
      m.addLayer({ id: 'cyc-heading', type: 'line', source: 'cyclone', filter: ['==', ['get', 'category'], 'heading'], paint: { 'line-color': '#dc2626', 'line-width': 3 } })
      m.addLayer({ id: 'cyc-heading-tip', type: 'fill', source: 'cyclone', filter: ['==', ['get', 'level'], 'heading'], paint: { 'fill-color': '#dc2626' } })

      m.addSource('reservoirs', { type: 'geojson', data: reservoirFeatures() })
      m.addLayer({
        id: 'res-circle',
        type: 'circle',
        source: 'reservoirs',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'capacityNum'], 0.5, 6, 26, 13],
          'circle-color': ['case', ['get', 'hasLevel'], ['get', 'color'], '#ffffff'],
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
        },
      })
      m.addLayer({
        id: 'res-label',
        type: 'symbol',
        source: 'reservoirs',
        // Reservoirs with a known level are labelled from island-wide zoom; the rest once zoomed in.
        minzoom: 8.5,
        filter: ['any', ['get', 'hasLevel'], ['all', ['>=', ['get', 'capacityNum'], 5], ['>=', ['zoom'], 10.5]]],
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#14202e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })

      m.addSource('reports', { type: 'geojson', data: reportFeatures() })
      m.addLayer({ id: 'rep-circle', type: 'circle', source: 'reports', paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })

      const popup = (lngLat: maplibregl.LngLatLike, html: string) => new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(lngLat).setHTML(html).addTo(m)

      m.on('click', 'res-circle', (e) => {
        const id = e.features?.[0]?.properties?.id
        const r = latest.current.water?.reservoirs.find((x) => x.id === id)
        if (!r) return
        const L = latest.current.labels
        const last = r.readings[r.readings.length - 1]
        popup(
          [r.lon, r.lat],
          `<strong>${esc(r.name)}</strong><br/>${last ? `<span class="pop-big">${last.pct}%</span> ${esc(L.levelOn(last.pct, last.date))}<br/><a href="${esc(last.source.url)}" target="_blank" rel="noreferrer">${esc(L.source)}: ${esc(last.source.name)}</a>` : esc(L.noFigure)}<br/><span class="pop-muted">${esc(L.capacity)}: ${esc(r.capacity)}${r.purpose ? ` · ${esc(r.purpose)}` : ''}</span>`,
        )
      })
      m.on('click', 'rep-circle', (e) => {
        const id = e.features?.[0]?.properties?.id
        const r = latest.current.reports?.find((x) => x.id === id)
        if (!r) return
        const L = latest.current.labels
        popup(
          [r.lon, r.lat],
          `<strong>${esc(L.reportKind(r.kind))}</strong><br/><span class="pop-muted">${esc(L.reportedAgo(r.createdAt))}</span>${r.note ? `<p>${esc(r.note)}</p>` : ''}${r.photo ? `<img src="${esc(r.photo)}" alt="" class="pop-photo"/>` : ''}`,
        )
      })
      for (const id of ['res-circle', 'rep-circle']) {
        m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''))
      }
      m.on('click', (e) => {
        const p = latest.current.pick
        if (!p) return
        if (m.queryRenderedFeatures(e.point, { layers: ['res-circle', 'rep-circle'] }).length) return
        p.onPick([Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))])
      })
      setReady(true)
    })
    return () => {
      m.remove()
      map.current = null
    }
    // The map is created once; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data updates
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    ;(m.getSource('cyclone') as GeoJSONSource).setData(cycloneFeatures(layers.cyclone ? live : undefined) as Parameters<GeoJSONSource['setData']>[0])
    ;(m.getSource('reservoirs') as GeoJSONSource).setData(reservoirFeatures(layers.reservoirs ? water : undefined))
    ;(m.getSource('reports') as GeoJSONSource).setData(reportFeatures(layers.reports ? reports : undefined))

    stormMarker.current?.remove()
    stormMarker.current = null
    const centre = layers.cyclone ? stormCentre(live) : undefined
    if (centre) {
      const node = document.createElement('div')
      node.className = 'storm-marker'
      node.innerHTML = '<svg viewBox="0 0 64 64" width="34" height="34" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M32 26a6 6 0 1 1-6 6"/><path d="M14 22c6-10 20-14 30-8"/><path d="M50 42c-6 10-20 14-30 8"/></svg>'
      if (live?.cyclone) node.title = labels.cyclone(live.cyclone)
      stormMarker.current = new maplibregl.Marker({ element: node }).setLngLat(centre).addTo(m)
    }
  }, [ready, live, water, reports, layers.cyclone, layers.reservoirs, layers.reports, labels])

  // Focus
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    const centre = stormCentre(live)
    if (focus === 'cyclone' && centre) {
      const b = new maplibregl.LngLatBounds([57.3, -20.5], [57.8, -20.0]).extend(centre)
      for (const t of live?.tracks ?? [])
        for (const f of t.features) if (f.properties.kind === 'track') for (const c of (f.geometry as { coordinates: number[][] }).coordinates) b.extend(c as [number, number])
      m.fitBounds(b, { padding: 40, maxZoom: 8, duration: 800 })
    } else m.fitBounds(MAURITIUS_BOUNDS, { padding: 20, duration: 800 })
  }, [ready, focus, live])

  // Picker marker
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    pickMarker.current?.remove()
    pickMarker.current = null
    if (pick?.value) {
      pickMarker.current = new maplibregl.Marker({ color: '#003087' }).setLngLat(pick.value).addTo(m)
      m.easeTo({ center: pick.value, zoom: Math.max(m.getZoom(), 12) })
    }
  }, [ready, pick?.value])

  return (
    <div className={`map-wrap ${className ?? ''}`}>
      <div ref={el} className="map-canvas" />
      {failed && <div className="map-failed">Map tiles could not load. Check your connection.</div>}
    </div>
  )
}
