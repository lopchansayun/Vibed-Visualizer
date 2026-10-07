import { Copy, Trash2, Loader2, CheckCircle2, XCircle, WifiOff, Info, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useEditorStore } from '../../store/useEditorStore'

const TABS = [
  { key: 'output', label: 'Output' },
  { key: 'errors', label: 'Errors' },
  { key: 'input', label: 'Input' },
]

function StatusLine({ status, output }) {
  if (status === 'compiling') {
    return (
      <div className="flex items-center gap-1.5 text-blue">
        <Loader2 size={13} className="animate-spin" /> Compiling…
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div className="flex items-center gap-1.5 text-blue">
        <Loader2 size={13} className="animate-spin" /> Running…
      </div>
    )
  }
  if (status === 'success') {
    return (
      <div className="flex items-center gap-1.5 text-green">
        <CheckCircle2 size={13} /> Program finished successfully
      </div>
    )
  }
  if (status === 'compile-error') {
    return (
      <div className="flex items-center gap-1.5 text-red">
        <XCircle size={13} /> Compilation failed
      </div>
    )
  }
  if (status === 'runtime-error') {
    return (
      <div className="flex items-center gap-1.5 text-red">
        <XCircle size={13} /> Runtime error
      </div>
    )
  }
  if (status === 'network-error') {
    return (
      <div className="flex items-center gap-1.5 text-red">
        <WifiOff size={13} /> Unable to connect to compiler server. Please try again.
      </div>
    )
  }
  return <div className="text-text-faint">Ready — press Run to compile and execute.</div>
}

export default function OutputConsole() {
  const status = useEditorStore((s) => s.status)
  const output = useEditorStore((s) => s.output)
  const input = useEditorStore((s) => s.input)
  const setInput = useEditorStore((s) => s.setInput)
  const activeTab = useEditorStore((s) => s.activeConsoleTab)
  const setActiveTab = useEditorStore((s) => s.setActiveConsoleTab)
  const clearConsole = useEditorStore((s) => s.clearConsole)

  const clearInput = () => setInput('')

  const hasError = status === 'compile-error' || status === 'runtime-error' || status === 'network-error'

  const handleCopy = () => {
    const text = activeTab === 'errors' ? output.stderr : output.stdout
    navigator.clipboard?.writeText(text || '')
    toast.success('Copied to clipboard')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border-soft bg-panel px-2 py-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-panel-raised text-text'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
            {tab.key === 'errors' && hasError && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red" />
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          title="Copy output"
          className="rounded p-1.5 text-text-muted hover:bg-panel-raised hover:text-text"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={clearConsole}
          title="Clear console"
          className="rounded p-1.5 text-text-muted hover:bg-panel-raised hover:text-text"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono-tight text-[13px] leading-relaxed">
        {activeTab === 'output' && (
          <div>
            <StatusLine status={status} output={output} />
            {output.stdout && (
              <pre className="mt-2 whitespace-pre-wrap text-text">{output.stdout}</pre>
            )}
            {status === 'success' && (
              <div className="mt-2 flex gap-4 text-xs text-text-faint">
                <span>Execution time: {output.executionTime} ms</span>
                <span>Memory: {(output.memory / 1024).toFixed(1)} MB</span>
                <span>Exit code: {output.exitCode}</span>
                {output.engine && (
                  <span>Engine: {output.engine === 'judge0' ? 'Judge0' : output.engine === 'native-c' ? 'Native C' : output.engine}</span>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'errors' && (
          <div>
            {output.stderr ? (
              <pre className="whitespace-pre-wrap text-red">{output.stderr}</pre>
            ) : (
              <div className="text-text-faint">No errors.</div>
            )}
          </div>
        )}

        {activeTab === 'input' && (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex shrink-0 items-start gap-2 rounded-md border border-border-soft bg-panel px-2.5 py-2 text-xs text-text-muted">
              <Info size={14} className="mt-0.5 shrink-0 text-blue" />
              <div className="min-w-0">
                <div className="font-medium text-text">Program input (stdin)</div>
                <div className="mt-0.5 leading-relaxed">Enter the values your program should receive when it uses <code className="rounded bg-panel-raised px-1 text-text">scanf</code>, <code className="rounded bg-panel-raised px-1 text-text">cin</code>, or another stdin function. Values are supplied in order when you press Run.</div>
              </div>
              <button
                onClick={clearInput}
                title="Clear input"
                aria-label="Clear input"
                className="shrink-0 rounded p-1 text-text-muted hover:bg-panel-raised hover:text-text"
              >
                <RotateCcw size={13} />
              </button>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={'Example:\n10\n20'}
              spellCheck="false"
              aria-label="Program standard input"
              className="min-h-[90px] flex-1 w-full resize-none rounded-md border border-border-soft bg-panel-raised px-3 py-2 font-mono-tight text-[13px] leading-relaxed text-text outline-none placeholder:text-text-faint focus:border-blue"
            />
            <div className="shrink-0 text-[11px] text-text-faint">Tip: separate multiple values with spaces or new lines. For example, <span className="font-mono-tight text-text-muted">10 20</span> works for <span className="font-mono-tight text-text-muted">scanf("%d %d", &amp;a, &amp;b)</span>.</div>
          </div>
        )}
      </div>
    </div>
  )
}
