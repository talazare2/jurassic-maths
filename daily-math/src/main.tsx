import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MathJaxContext } from 'better-react-mathjax'

import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MathJaxContext version={3}>
      <App />
    </MathJaxContext>
  </StrictMode>
)