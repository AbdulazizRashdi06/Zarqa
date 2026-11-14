import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts so the installed PWA works offline. Anton is declared in index.css (font-display: block,
// preloaded by vite.config.ts) so headlines wait for it instead of reflowing.
import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/figtree/latin-600.css'
import '@fontsource/figtree/latin-700.css'
import '@fontsource/figtree/latin-800.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import './index.css'
import './motion.css'
import App from './App.tsx'
import { startPwa } from './lib/pwa'

// iOS Safari only shows :active (the press feedback in motion.css) when something listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
