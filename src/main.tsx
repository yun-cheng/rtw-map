import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startOfflineMap } from './offline/download'
import { registerServiceWorker } from './pwa'
import { openShared } from './store/shared'
import { syncUrl } from './store/url'

syncUrl()
void openShared()
registerServiceWorker()
startOfflineMap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
