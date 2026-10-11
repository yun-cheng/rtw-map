import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the device has a connection, as the browser knows it (it may say yes on a network without the internet;
 *  never no while there is one). */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
