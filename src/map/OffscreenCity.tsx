import type { Map as MlMap, MapLibreEvent } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { useTrip } from '../store/trip'
import { DRAWER_WIDTH } from '../ui/layout'
import { isPhone } from '../ui/usePhone'

/**
 * How the open city looks on the map (set by MapView as it draws it): a stop's circle with its colour, number and
 * rain ring, or a city's dot. `ink`: the base map's colours for the selection ring, arrow and rain.
 */
export type CityNode = {
  color: string; radius: number; text?: string; textSize?: number; rain?: number; stop: boolean
  ink: { text: string; halo: string; outline: string; rain: string }
}

/** The part of the map nothing covers, in pixels from its top left. */
type Area = { left: number; top: number; right: number; bottom: number }
/** The node's middle, at the side of the area the city lies beyond, and the direction to the city (degrees). */
type Mark = { x: number; y: number; angle: number; area: Area; lon: number }

/** Room past the outline for the selection ring, the arrow's length, and the gap from the area's sides. */
const RING = 4.5
const ARROW = 8
const GAP = 6

/**
 * The open city, while it's out of sight (panned away from after opening it): its node at the side of the map it lies
 * beyond, with an arrow pointing at it and its name, bringing it back into view when clicked.
 */
export function OffscreenCity({ map, node }: { map: MlMap; node: CityNode | null }) {
  const selected = useTrip((s) => s.selected)
  const city = selected?.type === 'city' ? ds.cities[selected.id] : undefined
  const reach = (node ? halfSize(node) : 0) + GAP
  const [mark, setMark] = useState<Mark | null>(null)

  useEffect(() => {
    if (!city) return
    const update = () => setMark(markFor(map, city.lon, city.lat, reach))
    // Follows the map as it's dragged or zoomed; hidden while the app moves it (to this city, say), placed once it stops.
    const moved = (e: MapLibreEvent<unknown>) => void (e.originalEvent && update())
    const started = (e: MapLibreEvent<unknown>) => void (e.originalEvent || setMark(null))
    update()
    const subs = [map.on('move', moved), map.on('movestart', started), map.on('moveend', update), map.on('resize', update)]
    return () => subs.forEach((s) => s.unsubscribe())
  }, [map, city, reach])

  if (!city || !node || !mark) return null
  const { x, y, angle, area, lon } = mark
  const { width, height } = map.getContainer().getBoundingClientRect()
  // Into the middle of the uncovered part.
  const back = () => map.easeTo({
    center: [lon, city.lat],
    offset: [(area.left + area.right - width) / 2, (area.top + area.bottom - height) / 2],
    duration: 700,
  })
  const half = halfSize(node)
  // The name on the side towards the middle of the map, as the map's names sit beside their stops.
  const nameLeft = x > (area.left + area.right) / 2
  return (
    <button
      onClick={back}
      title={`Back to ${city.name}`}
      aria-label={`Back to ${city.name}`}
      className={`group absolute z-10 flex items-center ${nameLeft ? 'flex-row-reverse' : ''}`}
      style={{ left: x, top: y, transform: `translate(${nameLeft ? `calc(-100% + ${half}px)` : `${-half}px`}, -50%)` }}
    >
      <NodeMark node={node} angle={angle} half={half} />
      <span
        // On a box like the legend's, so it isn't taken for one of the map's own names.
        className="max-w-36 truncate rounded-md border border-line bg-panel px-1.5 py-0.5 text-[12px] font-semibold text-ink shadow-sm group-hover:border-accent"
        style={{ margin: `0 ${-ARROW + 3}px` }}
      >
        {city.name}
      </span>
    </button>
  )
}

/** The node drawn as on the map, selected, with an arrow off its rim pointing `angle` degrees (0 = right, 90 = down). */
function NodeMark({ node, angle, half: c }: { node: CityNode; angle: number; half: number }) {
  const { color, radius: r, text, textSize, rain, stop, ink } = node
  const size = 2 * c
  const outline = outlineOf(node)
  const ring = (radius: number, stroke: string, width: number, share = 1) => {
    const around = 2 * Math.PI * radius
    return (
      <circle
        cx={c} cy={c} r={radius} fill="none" stroke={stroke} strokeWidth={width}
        strokeDasharray={share < 1 ? `${around * share} ${around}` : undefined}
        transform={share < 1 ? `rotate(-90 ${c} ${c})` : undefined}
      />
    )
  }
  const tip = c - 1
  return (
    <svg width={size} height={size} className="shrink-0 transition-transform group-hover:scale-110" aria-hidden>
      <circle cx={c} cy={c} r={r} fill={color} />
      {ring(r + outline / 2, stop ? '#ffffff' : ink.outline, outline)}
      {rain !== undefined && rain > 0 && ring(r + outline / 2, ink.rain, outline, rain)}
      {ring(r + outline + 2.25, ink.text, 2.5)}
      {text && (
        <text x={c} y={c} fill="#ffffff" fontSize={textSize} fontWeight={700} textAnchor="middle" dominantBaseline="central">{text}</text>
      )}
      <polygon
        points={`${c + tip},${c} ${c + tip - ARROW + 1},${c - 4.5} ${c + tip - ARROW + 1},${c + 4.5}`}
        fill={ink.text} stroke={ink.halo} strokeWidth={1} strokeLinejoin="round"
        transform={`rotate(${angle} ${c} ${c})`}
      />
    </svg>
  )
}

/** As MapView's layers: a stop's white outline (or rain ring, see drawRing) and a city dot's thin one. */
const outlineOf = (node: CityNode) => (node.stop ? 2 : 1)
/** From the node's middle to the tip of its arrow, past the outline and the selection ring. */
const halfSize = (node: CityNode) => node.radius + outlineOf(node) + RING + ARROW + 1

/**
 * Where the node goes for a city at lon/lat, its middle `reach` inside the uncovered part's sides, or nowhere while
 * the city is in sight (or the part is too small to hold it).
 */
function markFor(map: MlMap, cityLon: number, lat: number, reach: number): Mark | null {
  const box = map.getContainer().getBoundingClientRect()
  const area = uncovered(map, box)
  if (area.right - area.left < 4 * reach || area.bottom - area.top < 4 * reach) return null
  // The city's copy of the world nearest the middle of the map (it repeats sideways).
  const lon = cityLon + 360 * Math.round((map.getCenter().lng - cityLon) / 360)
  const p = map.project([lon, lat])
  if (p.x > area.left && p.x < area.right && p.y > area.top && p.y < area.bottom) return null
  // Out along the line from the area's middle to the city, as far as the area's sides allow.
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  const dx = p.x - cx
  const dy = p.y - cy
  const t = Math.min(dx ? ((area.right - area.left) / 2 - reach) / Math.abs(dx) : Infinity, dy ? ((area.bottom - area.top) / 2 - reach) / Math.abs(dy) : Infinity)
  return { x: cx + dx * t, y: cy + dy * t, angle: (Math.atan2(dy, dx) * 180) / Math.PI, area, lon }
}

/**
 * The part of the map nothing covers: below the controls along the top (marked `data-map-top`, see MapControls; on a
 * phone also its settings button), left of the city panel, or on a phone above its sheet and the row of dropdowns
 * just above that.
 */
function uncovered(map: MlMap, box: DOMRect): Area {
  const holder = map.getContainer().parentElement
  const phone = isPhone()
  const tops = [...(holder?.querySelectorAll('[data-map-top]') ?? [])].map((e) => e.getBoundingClientRect().bottom - box.top)
  const sheet = parseFloat(holder?.style.getPropertyValue('--sheet-height') || '0') || 0
  return {
    left: 0,
    top: Math.max(phone ? 48 : 0, ...tops),
    right: box.width - (phone ? 0 : DRAWER_WIDTH),
    bottom: box.height - (phone ? sheet + 48 : 0),
  }
}
