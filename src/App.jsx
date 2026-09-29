import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEditorStore } from './store/useEditorStore'
import CompilerPage from './pages/CompilerPage'
import CProjectSupportPage from './pages/CProjectSupportPage'

export default function App() {
  const theme = useEditorStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CompilerPage />} />
        <Route path="/c-support" element={<CProjectSupportPage />} />
      </Routes>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-panel-raised)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            fontSize: '13px',
          },
        }}
      />
    </BrowserRouter>
  )
}
