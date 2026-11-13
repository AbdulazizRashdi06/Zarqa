import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts so the installed PWA works offline.
import '@fontsource/anton/latin-400.css'
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

// iOS Safari only shows :active (the press feedback in motion.css) when something listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
