import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { CityProvider } from './lib/cityStore.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { warmBackend } from './lib/api.js'
import './index.css'

// Wake the backend the instant the page loads: a cold Cloud Run container
// starts booting (and pre-warms the default city on startup) while the user
// reads the landing page, so the first search returns fast. Best-effort only.
warmBackend()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CityProvider>
          <App />
        </CityProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
