import { useSyncExternalStore } from 'react'
import { PHONE_QUERY } from './layout'

const media = typeof window === 'undefined' ? null : window.matchMedia(PHONE_QUERY)

/** Whether the window is phone-sized now (see PHONE_QUERY). */
export const isPhone = () => !!media?.matches

const subscribe = (onChange: () => void) => {
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

/** Whether the window is phone-sized, updated as it resizes. */
export const usePhone = () => useSyncExternalStore(subscribe, isPhone)
