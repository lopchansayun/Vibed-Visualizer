import { useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useEditorStore } from '../../store/useEditorStore'
import { LANGUAGES } from '../../config/languages'

export default function CodeEditor({ onRun, onRunAndVisualize }) {
  const language = useEditorStore((s) => s.language)
  const code = useEditorStore((s) => s.code[s.language])
  const setCode = useEditorStore((s) => s.setCode)
  const theme = useEditorStore((s) => s.theme)
  const trace = useEditorStore((s) => s.trace)
  const currentStep = useEditorStore((s) => s.currentStep)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])

  const currentLine = trace?.steps?.[currentStep]?.line ?? null

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
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft bg-panel px-3 py-1.5">
        <span className="font-mono-tight text-xs text-text-muted">{LANGUAGES[language].fileName}</span>
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
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun?.())
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
              () => onRunAndVisualize?.()
            )
            highlightLine(editor, monaco, currentLine)
          }}
          options={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13.5,
            minimap: { enabled: false },
            automaticLayout: true,
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
