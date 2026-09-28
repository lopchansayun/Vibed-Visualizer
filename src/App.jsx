import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useEditorStore } from './store/useEditorStore'
import CompilerPage from './pages/CompilerPage'

export default function App() {
  const theme = useEditorStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <>
      <CompilerPage />
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
    </>
  )
}
