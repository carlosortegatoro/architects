import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App.tsx'
import { AuthGuard } from './components/AuthGuard.tsx'
import { LoginScreen } from './components/LoginScreen.tsx'
import { ShareView } from './components/ShareView.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/s/:token" element={<ShareView />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<App />} />
          <Route path="/d/:diagramId" element={<App />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
