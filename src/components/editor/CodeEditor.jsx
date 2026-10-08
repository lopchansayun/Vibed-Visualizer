import { useRef, useEffect } from 'react'
import { X, CheckSquare, Copy, Trash2, ClipboardPaste, ListPlus, ListX } from 'lucide-react'
import toast from 'react-hot-toast'
import Editor from '@monaco-editor/react'
import { useEditorStore } from '../../store/useEditorStore'
import { LANGUAGES } from '../../config/languages'
import { formatSource } from '../../services/codeFormatter'

export default function CodeEditor({ onRun, onRunAndVisualize }) {
  const language = useEditorStore((s) => s.language)
  const code = useEditorStore((s) => s.code[s.language])
  const tabs = useEditorStore((s) => s.openTabs[s.language])
  const activeFile = useEditorStore((s) => s.activeFile[s.language])
  const switchFile = useEditorStore((s) => s.switchFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const setCode = useEditorStore((s) => s.setCode)
  const theme = useEditorStore((s) => s.theme)
  const trace = useEditorStore((s) => s.trace)
  const editorSettings = useEditorStore((s) => s.editorSettings)
  const currentStep = useEditorStore((s) => s.currentStep)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])

  const currentLine = trace?.steps?.[currentStep]?.line ?? null
  const resolvedEditorTheme = editorSettings.theme === 'app'
    ? (theme === 'dark' ? 'codeviz-dark' : 'codeviz-light')
    : (editorSettings.theme === 'dark' ? 'codeviz-dark' : 'codeviz-light')

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

  const withEditor = (callback) => {
    const editor = editorRef.current
    if (!editor) return
    callback(editor, monacoRef.current)
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Clipboard access was blocked by the browser.')
    }
  }

  const selectAll = () => withEditor((editor) => editor.getAction('editor.action.selectAll')?.run())
  const copyAll = () => withEditor(async (editor) => {
    const model = editor.getModel()
    editor.setSelection(model.getFullModelRange())
    await copyText(editor.getValue())
    editor.focus()
  })
  const deleteAll = () => withEditor((editor) => {
    editor.executeEdits('mobile-delete-all', [{
      range: editor.getModel().getFullModelRange(),
      text: '',
    }])
  })
  const selectCurrentLine = () => withEditor((editor, monaco) => {
    const model = editor.getModel()
    const line = editor.getPosition()?.lineNumber || 1
    const lastLine = model.getLineCount()
    const endColumn = model.getLineMaxColumn(line)
    const endLine = line < lastLine ? line + 1 : line
    const finalColumn = line < lastLine ? 1 : endColumn
    editor.setSelection(new monaco.Selection(line, 1, endLine, finalColumn))
    editor.focus()
  })
  const copyCurrentLine = () => withEditor(async (editor) => {
    const model = editor.getModel()
    const line = editor.getPosition()?.lineNumber || 1
    await copyText(model.getLineContent(line))
  })
  const deleteCurrentLine = () => withEditor((editor) => {
    const model = editor.getModel()
    const line = editor.getPosition()?.lineNumber || 1
    const lastLine = model.getLineCount()
    const range = line < lastLine
      ? new monacoRef.current.Range(line, 1, line + 1, 1)
      : new monacoRef.current.Range(line, 1, line, model.getLineMaxColumn(line))
    editor.executeEdits('mobile-delete-line', [{ range, text: '' }])
  })
  const pasteLine = async () => {
    try {
      const text = await navigator.clipboard.readText()
      withEditor((editor) => {
        const model = editor.getModel()
        const line = editor.getPosition()?.lineNumber || 1
        const eol = model.getEOL()
        const endColumn = model.getLineMaxColumn(line)
        // Insert a real line break after the current line.
        editor.executeEdits('mobile-paste-line', [{
          range: new monacoRef.current.Range(line, endColumn, line, endColumn),
          text: `${eol}${text}`,
        }])
        editor.setPosition({ lineNumber: line + 1, column: 1 })
        editor.focus()
      })
    } catch {
      toast.error('Clipboard paste was blocked by the browser.')
    }
  }

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return
    editorRef.current.updateOptions({
      fontFamily: `'${editorSettings.fontFamily}', monospace`,
      fontSize: Number(editorSettings.fontSize),
      minimap: { enabled: editorSettings.minimap },
      lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
      wordWrap: editorSettings.wordWrap,
    })
    monacoRef.current.editor.setTheme(resolvedEditorTheme)
  }, [editorSettings, resolvedEditorTheme])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-panel px-2 py-1 sm:hidden">
        <button type="button" title="Select all" aria-label="Select all" onClick={selectAll} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><CheckSquare size={15} /></button>
        <button type="button" title="Copy all" aria-label="Copy all" onClick={copyAll} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><Copy size={15} /></button>
        <button type="button" title="Delete all" aria-label="Delete all" onClick={deleteAll} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><Trash2 size={15} /></button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button type="button" title="Select line" aria-label="Select line" onClick={selectCurrentLine} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><ListPlus size={15} /></button>
        <button type="button" title="Copy line" aria-label="Copy line" onClick={copyCurrentLine} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><Copy size={15} /></button>
        <button type="button" title="Delete line" aria-label="Delete line" onClick={deleteCurrentLine} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><ListX size={15} /></button>
        <button type="button" title="Paste line" aria-label="Paste line" onClick={pasteLine} className="rounded p-2 text-text-muted hover:bg-bg-soft hover:text-text"><ClipboardPaste size={15} /></button>
      </div>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-panel px-2 py-1.5">
        {(tabs || [activeFile]).map((name) => (
          <button key={name} type="button" title={name} onClick={() => switchFile(name)} className={`group flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono-tight ${name === activeFile ? 'bg-bg-soft text-text' : 'text-text-muted hover:bg-bg-soft hover:text-text'}`}>
            <span>{name.slice(name.lastIndexOf('/') + 1)}</span>
            {(tabs?.length || 0) > 1 && <span role="button" aria-label={`Close ${name}`} tabIndex={0} onClick={(e) => { e.stopPropagation(); closeFile(name) }} className="rounded p-0.5 hover:bg-border"><X size={11} /></span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          key={`${language}:${activeFile}`}
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
            monaco.editor.setTheme(resolvedEditorTheme)
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
              () => { if (LANGUAGES[useEditorStore.getState().language]?.visualizable) onRunAndVisualize?.() }
            )
            highlightLine(editor, monaco, currentLine)
          }}
          options={{
            fontFamily: `'${editorSettings.fontFamily}', monospace`,
            fontSize: Number(editorSettings.fontSize),
            minimap: { enabled: editorSettings.minimap },
            lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
            lineNumbersMinChars: 2,
            glyphMargin: false,
            automaticLayout: true,
            // Render Monaco's floating widgets outside clipped editor containers so
            // Find/Replace controls and their tooltips keep a stable stacking context.
            fixedOverflowWidgets: true,
            padding: { top: 12 },
            bracketPairColorization: { enabled: true },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
          }}
        />
      </div>
    </div>
  )
}
