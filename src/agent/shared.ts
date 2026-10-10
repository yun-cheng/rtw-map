// What the user shares from the screen with a message to the trip assistant (see view.ts, which builds it in the
// browser): the types and the text the assistant gets, without the app's store, so a run on the server can use them.
import type { CostKind } from '../planner'
import type { CityTab, MapLayer, NearbyKind } from '../store/trip'

/** What a view item points at, for get_shared_view. */
export type ViewRef =
  | { kind: 'city'; id: string; tab: CityTab }
  | { kind: 'journey'; from: string; to: string; index: number }
  | { kind: 'map'; layer: MapLayer; month: number; nearbyKind?: NearbyKind; costKind?: CostKind; weatherBy?: 'high' | 'low' }

export type ViewItem = {
  /** Changes when the view changes, so a chip the user removed comes back for something new. */
  key: string
  ref: ViewRef
  /** Short text for the chip. */
  label: string
  /** The overview the assistant gets: what is open and what it shows. */
  text: string
}

/** The shared items as one block for the assistant's context. */
export const viewText = (items: ViewItem[]) =>
  items.length
    ? `What the user was looking at in the app when they asked:\n${items.map((v) => `- ${v.text}`).join('\n')}\nCall get_shared_view for the values shown, if you need them.`
    : ''
