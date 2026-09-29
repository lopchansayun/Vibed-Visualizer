import { useRef, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { useEditorStore } from '../../store/useEditorStore'
import { LANGUAGES } from '../../config/languages'
import { formatSource } from '../../services/codeFormatter'

export default function CodeEditor({ onRun, onRunAndVisualize }) {
  const language = useEditorStore((s) => s.language)
  const code = useEditorStore((s) => s.code[s.language])
  const files = useEditorStore((s) => s.files[s.language] || [])
  const activeFile = useEditorStore((s) => s.activeFile[s.language])
  const switchFile = useEditorStore((s) => s.switchFile)
  const createFile = useEditorStore((s) => s.createFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const setCode = useEditorStore((s) => s.setCode)
  const theme = useEditorStore((s) => s.theme)
  const trace = useEditorStore((s) => s.trace)
  const currentStep = useEditorStore((s) => s.currentStep)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])

  const currentLine = trace?.steps?.[currentStep]?.line ?? null
  const visualizationAvailable = LANGUAGES[language]?.visualizable === true
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const cancelCreating = () => {
    setNewName('')
    setCreating(false)
  }

  const highlightLine = (editor, monaco, line) => {
    if (!editor || !monaco) return
    if (!line) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      return
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'codeviz-current-line',
          glyphMarginClassName: 'codeviz-current-line-glyph',
        },
      },
    ])
  }

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      highlightLine(editorRef.current, monacoRef.current, currentLine)
      if (currentLine) {
        editorRef.current.revealLineInCenter(currentLine)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-panel px-2 py-1.5">
        {files.map((file) => (
          <button key={file.name} type="button" onClick={() => switchFile(file.name)} className={`group flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono-tight ${file.name === activeFile ? 'bg-bg-soft text-text' : 'text-text-muted hover:bg-bg-soft hover:text-text'}`}>
            <span>{file.name}</span>
            {files.length > 1 && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); closeFile(file.name) }} className="rounded p-0.5 hover:bg-border"><X size={11} /></span>}
          </button>
        ))}
        {creating ? (
          <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { createFile(newName.trim()); setNewName(''); setCreating(false) } }} className="flex shrink-0 items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && cancelCreating()} placeholder="filename" className="h-7 w-28 rounded border border-border bg-bg px-2 text-xs outline-none focus:border-blue" />
            <button type="submit" className="rounded bg-blue px-2 py-1 text-xs text-white">Create</button>
            <button type="button" onClick={cancelCreating} className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:bg-bg-soft hover:text-text">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-soft hover:text-text" title="Create new file"><Plus size={13} /> New</button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          language={LANGUAGES[language].monacoLanguage}
          value={code}
          theme={theme === 'dark' ? 'codeviz-dark' : 'codeviz-light'}
          onChange={(value) => setCode(value ?? '')}
          onMount={(editor, monaco) => {
            editorRef.current = editor
            monacoRef.current = monaco
            monaco.editor.defineTheme('codeviz-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#1c1f25',
                'editor.lineHighlightBackground': '#21252c',
                'editorGutter.background': '#1c1f25',
              },
            })
            monaco.editor.defineTheme('codeviz-light', {
              base: 'vs',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#ffffff',
                'editor.lineHighlightBackground': '#f6f5f2',
              },
            })
            monaco.editor.setTheme(theme === 'dark' ? 'codeviz-dark' : 'codeviz-light')
            const formatCode = () => {
              const model = editor.getModel()
              if (!model) return
              const original = model.getValue()
              const formatted = formatSource(original, language)
              if (formatted !== original) {
                editor.executeEdits('codeviz-format', [{
                  range: model.getFullModelRange(),
                  text: formatted,
                }])
                return
              }
              editor.getAction('editor.action.formatDocument')?.run()
            }
            editor.addAction({
              id: 'codeviz.format-code',
              label: 'Format Code',
              contextMenuGroupId: '1_modification',
              contextMenuOrder: 1,
              run: formatCode,
            })
            editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Alt | monaco.KeyCode.KeyF, formatCode)
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun?.())
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
              () => { if (visualizationAvailable) onRunAndVisualize?.() }
            )
            highlightLine(editor, monaco, currentLine)
          }}
          options={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13.5,
            minimap: { enabled: false },
            automaticLayout: true,
            // Render Monaco's floating widgets outside clipped editor containers so
            // Find/Replace controls and their tooltips keep a stable stacking context.
            fixedOverflowWidgets: true,
            padding: { top: 12 },
            bracketPairColorization: { enabled: true },
            scrollBeyondLastLine: false,
            glyphMargin: true,
            renderLineHighlight: 'all',
          }}
        />
      </div>
    </div>
  )
}
