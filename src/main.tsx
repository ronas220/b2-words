import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Variable fonts bundled locally (offline PWA); index.css includes latin + cyrillic subsets
import '@fontsource-variable/manrope/index.css'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
