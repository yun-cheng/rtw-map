import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../ui/theme' // applies the saved light/dark theme
import { ReviewApp } from './ReviewApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReviewApp />
  </StrictMode>,
)
