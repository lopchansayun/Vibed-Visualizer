import { Play, Square, GitBranch, RotateCcw, Sun, Moon, Braces, TerminalSquare } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { LANGUAGES, LANGUAGE_ORDER } from '../../config/languages'
import IconButton from '../ui/IconButton'

export default function Header({ onRun, onRunAndVisualize, onStop, onReset }) {
  const language = useEditorStore((s) => s.language)
  const setLanguage = useEditorStore((s) => s.setLanguage)
  const status = useEditorStore((s) => s.status)
  const theme = useEditorStore((s) => s.theme)
  const toggleTheme = useEditorStore((s) => s.toggleTheme)
  const visualizerOpen = useEditorStore((s) => s.visualizerOpen)
  const toggleVisualizer = useEditorStore((s) => s.toggleVisualizer)
  const consoleOpen = useEditorStore((s) => s.consoleOpen)
  const toggleConsole = useEditorStore((s) => s.toggleConsole)

  const isBusy = status === 'compiling' || status === 'running'
  const visualizationAvailable = language === 'c'

  return (
    <header className="flex min-h-13 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-bg-soft px-2 py-2 sm:gap-3 sm:px-3">
      <div className="flex shrink-0 items-center gap-2 pr-1 sm:pr-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber text-bg">
          <Braces size={16} strokeWidth={2.5} />
        </div>
        <span className="hidden font-mono-tight text-[15px] font-semibold tracking-tight sm:inline">vibedvisualizer</span>
      </div>

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
        <IconButton
          icon={GitBranch}
          label={visualizationAvailable ? 'Visualize' : 'Visualization only available for C'}
          active={visualizerOpen}
          onClick={onRunAndVisualize}
          disabled={isBusy || !visualizationAvailable}
          title={visualizationAvailable ? 'Visualize C execution' : 'Visualization only available for C'}
          showLabel={false}
        />
        <span className="hidden sm:inline-flex"><IconButton icon={RotateCcw} label="Reset" onClick={onReset} showLabel={false} /></span>
      </div>

      <div className="min-w-0 flex-1" />

      <button
        type="button"
        onClick={toggleConsole}
        aria-pressed={consoleOpen}
        className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-text-muted hover:text-text sm:px-2.5 sm:text-xs"
      >
        <TerminalSquare size={13} />
        <span className="hidden sm:inline">{consoleOpen ? 'Hide console' : 'Show console'}</span>
        <span className="sm:hidden">Console</span>
      </button>

      <button
        type="button"
        onClick={visualizationAvailable ? toggleVisualizer : undefined}
        aria-pressed={visualizerOpen}
        disabled={!visualizationAvailable}
        title={visualizationAvailable ? 'Show or hide visualizer' : 'Visualization only available for C'}
        className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-text-muted hover:text-text sm:px-2.5 sm:text-xs"
      >
        <GitBranch size={13} />
        <span className="hidden sm:inline">{visualizerOpen ? 'Hide visualizer' : 'Show visualizer'}</span>
        <span className="sm:hidden">{visualizerOpen ? 'Hide' : 'Show'}</span>
      </button>

      <span className="hidden sm:inline-flex">
        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={toggleTheme}
          showLabel={false}
        />
      </span>
    </header>
  )
}
