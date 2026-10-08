import { Play, Square, GitBranch, RotateCcw, Sun, Moon, Braces, FileCode2, PanelLeft, Menu, X, Settings, ChevronDown, SearchCode } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { LANGUAGES, LANGUAGE_ORDER } from '../../config/languages'
import IconButton from '../ui/IconButton'
import ImportExportMenu from './ImportExportMenu'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

export default function Header({ onRun, onRunAndVisualize, onStop, onReset, onAnalyzeC }) {
  const language = useEditorStore((s) => s.language)
  const setLanguage = useEditorStore((s) => s.setLanguage)
  const status = useEditorStore((s) => s.status)
  const theme = useEditorStore((s) => s.theme)
  const toggleTheme = useEditorStore((s) => s.toggleTheme)
  const editorSettings = useEditorStore((s) => s.editorSettings)
  const setEditorSetting = useEditorStore((s) => s.setEditorSetting)
  const visualizerOpen = useEditorStore((s) => s.visualizerOpen)
  const toggleVisualizer = useEditorStore((s) => s.toggleVisualizer)
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const mobileMenuRef = useRef(null)

  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const close = (event) => {
      if (!mobileMenuRef.current?.contains(event.target)) { setMobileMenuOpen(false); setSettingsOpen(false) }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setMobileMenuOpen(false); setSettingsOpen(false) }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileMenuOpen])

  const isBusy = status === 'compiling' || status === 'running'
  const visualizationAvailable = LANGUAGES[language]?.visualizable === true

  return (
    <header className="flex min-h-13 shrink-0 items-center gap-1.5 overflow-visible border-b border-border bg-bg-soft px-2 py-2 sm:gap-3 sm:px-3">
      <div className="flex shrink-0 items-center gap-2 pr-1 sm:pr-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber text-bg">
          <Braces size={16} strokeWidth={2.5} />
        </div>
        <span className="hidden font-mono-tight text-[15px] font-semibold tracking-tight sm:inline">vibedvisualizer</span>
      </div>

      <IconButton icon={PanelLeft} label={sidebarOpen ? 'Hide file sidebar' : 'Show file sidebar'} active={sidebarOpen} onClick={toggleSidebar} showLabel={false} />

      <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        aria-label="Language"
        className="min-w-0 max-w-[112px] shrink rounded-md border border-border bg-panel px-2 py-1.5 text-xs font-medium text-text outline-none focus-visible:border-blue sm:max-w-none sm:px-2.5 sm:text-sm"
      >
        {LANGUAGE_ORDER.map((key) => (
          <option key={key} value={key}>{LANGUAGES[key].label}</option>
        ))}
      </select>

      <div className="ml-0.5 flex shrink-0 items-center gap-1 sm:ml-1 sm:gap-1.5">
        <IconButton
          icon={isBusy ? Square : Play}
          label={isBusy ? 'Stop' : 'Run'}
          variant={isBusy ? 'danger' : 'primary'}
          onClick={isBusy ? onStop : onRun}
          showLabel={false}
        />
        {visualizationAvailable && (
          <IconButton
            icon={GitBranch}
            label="Visualize C execution"
            active={visualizerOpen}
            onClick={onRunAndVisualize}
            disabled={isBusy}
            showLabel={false}
          />
        )}
        <IconButton icon={RotateCcw} label="Reset" onClick={onReset} showLabel={false} />
      </div>

      <div className="hidden shrink-0 sm:block">
        <ImportExportMenu />
      </div>

      <div className="min-w-0 flex-1" />

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Link
          to="/support"
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-text-muted hover:text-text sm:px-2.5 sm:text-xs"
          title="See language and C/DSA support"
        >
          <FileCode2 size={13} />
          <span>Support</span>
        </Link>

        {visualizationAvailable && (
          <button
            type="button"
            onClick={toggleVisualizer}
            aria-pressed={visualizerOpen}
            title="Show or hide visualizer"
            className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-text-muted hover:text-text sm:px-2.5 sm:text-xs"
          >
            <GitBranch size={13} />
            <span>{visualizerOpen ? 'Hide visualizer' : 'Show visualizer'}</span>
          </button>
        )}

        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={toggleTheme}
          showLabel={false}
        />
      </div>

      <div ref={mobileMenuRef} className="relative shrink-0 sm:hidden">
        <button
          type="button"
          onClick={() => { setMobileMenuOpen((open) => !open); setSettingsOpen(false) }}
          aria-label="Open header menu"
          aria-haspopup="menu"
          aria-expanded={mobileMenuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted hover:bg-panel-raised hover:text-text"
        >
          {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>

        {mobileMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-56 overflow-y-auto rounded-lg border border-border bg-panel-raised p-1.5 shadow-2xl"
          >
            <div className="border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Workspace
            </div>

            <div className="py-1">
              <ImportExportMenu showLabels />
            </div>

            {language === 'c' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { onAnalyzeC?.(); setMobileMenuOpen(false) }}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-text-muted hover:bg-bg-soft hover:text-text"
              >
                <SearchCode size={15} />
                Analyze & fix C code
              </button>
            )}

            <Link
              to="/support"
              role="menuitem"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-text-muted hover:bg-bg-soft hover:text-text"
            >
              <FileCode2 size={15} />
              Support
            </Link>

            {visualizationAvailable && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { toggleVisualizer(); setMobileMenuOpen(false) }}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-text-muted hover:bg-bg-soft hover:text-text"
              >
                <GitBranch size={15} />
                {visualizerOpen ? 'Hide visualizer' : 'Show visualizer'}
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => { toggleTheme(); setMobileMenuOpen(false) }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-text-muted hover:bg-bg-soft hover:text-text"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-text-muted hover:bg-bg-soft hover:text-text"
            >
              <Settings size={15} />
              <span className="flex-1">Editor settings</span>
              <ChevronDown size={14} className={settingsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {settingsOpen && (
              <div className="mt-1 space-y-2 rounded-md border border-border bg-bg-soft p-2" onClick={(event) => event.stopPropagation()}>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  Text size
                  <select
                    value={editorSettings.fontSize}
                    onChange={(e) => setEditorSetting('fontSize', Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-border bg-panel px-2 text-xs text-text outline-none"
                  >
                    {[11, 12, 13, 13.5, 14, 15, 16, 18, 20].map((size) => <option key={size} value={size}>{size}px</option>)}
                  </select>
                </label>

                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  Font
                  <select
                    value={editorSettings.fontFamily}
                    onChange={(e) => setEditorSetting('fontFamily', e.target.value)}
                    className="mt-1 h-8 w-full rounded border border-border bg-panel px-2 text-xs text-text outline-none"
                  >
                    {['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'SF Mono'].map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                </label>

                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  Editor theme
                  <select
                    value={editorSettings.theme}
                    onChange={(e) => setEditorSetting('theme', e.target.value)}
                    className="mt-1 h-8 w-full rounded border border-border bg-panel px-2 text-xs text-text outline-none"
                  >
                    <option value="app">Follow app theme</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>

                <label className="flex h-8 items-center justify-between rounded px-1 text-xs text-text-muted hover:bg-panel">
                  Line numbers
                  <input type="checkbox" checked={editorSettings.lineNumbers} onChange={(e) => setEditorSetting('lineNumbers', e.target.checked)} />
                </label>
                <label className="flex h-8 items-center justify-between rounded px-1 text-xs text-text-muted hover:bg-panel">
                  Minimap
                  <input type="checkbox" checked={editorSettings.minimap} onChange={(e) => setEditorSetting('minimap', e.target.checked)} />
                </label>
                <label className="flex h-8 items-center justify-between rounded px-1 text-xs text-text-muted hover:bg-panel">
                  Word wrap
                  <input type="checkbox" checked={editorSettings.wordWrap === 'on'} onChange={(e) => setEditorSetting('wordWrap', e.target.checked ? 'on' : 'off')} />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
