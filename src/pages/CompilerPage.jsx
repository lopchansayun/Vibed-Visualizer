import { useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { useEditorStore } from '../store/useEditorStore'
import { compileAndRun } from '../services/judge0/compilerService'
import { buildExecutionTrace } from '../services/visualizerService'
import { LANGUAGES } from '../config/languages'
import Header from '../components/layout/Header'
import Workspace from '../components/layout/Workspace'
import { baseName } from '../utils/paths'
import { analyzeAndFixC, formatAnalyzerReport } from '../services/cCodeAnalyzer'
import { codeNeedsInput } from '../services/inputDetection'

export default function CompilerPage() {
  const runTokenRef = useRef(0)

  const run = useCallback(async ({ withVisualizer }) => {
    const token = ++runTokenRef.current
    const { language, code, files, input, setStatus, setOutput, setActiveConsoleTab, setTrace } = useEditorStore.getState()
    // Always open the console when execution starts.
    useEditorStore.setState({ consoleOpen: true })
    const needsInput = codeNeedsInput(language, code[language] || '')
    if (needsInput) {
      useEditorStore.setState({ consoleOpen: true, activeConsoleTab: 'input' })
      if (!input.trim()) {
        toast('Insert input before executing/running code', { icon: '⌨️' })
        return
      }
    }

    const projectFiles = files[language] || []
    const entryName = LANGUAGES[language]?.fileName || 'main.c'
    const activeName = useEditorStore.getState().activeFile[language]
    const entryFile = projectFiles.find((f) => f.name === entryName)
      || projectFiles.find((f) => baseName(f.name) === entryName)
      || projectFiles.find((f) => f.name === activeName)
      || projectFiles[0]
    const source = entryFile?.content || code[language]
    const visualizationAvailable = LANGUAGES[language]?.visualizable === true

    setActiveConsoleTab('output')
    setStatus('compiling')

    let result
    try {
      result = await compileAndRun({ language, code: source, files: files[language], entryName: entryFile?.name, stdin: input })
    } catch {
      if (runTokenRef.current !== token) return
      setStatus('network-error')
      toast.error('Unable to connect to compiler server.')
      return
    }
    if (runTokenRef.current !== token) return

    setOutput(result)
    if (result.success) {
      setStatus('success')
    } else {
      setStatus('compile-error')
      setActiveConsoleTab('errors')
      toast.error('Compilation failed')
    }

    if (withVisualizer) {
      if (!visualizationAvailable) {
        useEditorStore.setState({ visualizerOpen: false })
        setTrace({ steps: [], available: false, message: 'Visualization only available for C.' })
        toast('Visualization only available for C', { icon: 'ℹ️' })
        return
      }
      useEditorStore.setState({ visualizerOpen: true })
      if (!result.success) {
        setTrace({ steps: [], available: false, message: 'Visualization was skipped because the program did not execute successfully.' })
        return
      }
      try {
        const trace = await buildExecutionTrace({ language, code: source, files: projectFiles, entryName: entryFile?.name, stdin: input })
        if (runTokenRef.current !== token) return
        setTrace(trace)
        if (!trace.available) toast('Program ran, but this source is outside the visualizer subset.', { icon: 'ℹ️' })
      } catch {
        if (runTokenRef.current !== token) return
        setTrace({ steps: [], available: false, message: 'The program ran, but a source-level execution trace could not be built.' })
      }
    }
  }, [])

  const handleRun = () => run({ withVisualizer: false })
  const handleAnalyzeC = () => {
    const state = useEditorStore.getState()
    if (state.language !== 'c') {
      toast('Code analysis is currently available for C only.', { icon: 'ℹ️' })
      return
    }
    const source = state.code.c || ''
    const result = analyzeAndFixC(source)
    if (result.changed) state.setCode(result.code)
    state.setOutput({
      stdout: formatAnalyzerReport(result),
      stderr: '',
      exitCode: null,
      executionTime: null,
      memory: null,
      engine: 'c-analyzer',
    })
    state.setActiveConsoleTab('output')
    state.setStatus('idle')
    useEditorStore.setState({ consoleOpen: true })
    toast.success(result.changed ? `Analysis complete — ${result.fixes.length} safe fix(s) applied.` : 'Analysis complete — no automatic fixes were needed.')
  }
  const handleRunAndVisualize = () => run({ withVisualizer: true })
  const handleStop = () => {
    runTokenRef.current++
    useEditorStore.getState().setStatus('idle')
    toast('Stopped', { icon: '⏹' })
  }
  const handleReset = () => {
    useEditorStore.getState().resetCode()
    useEditorStore.getState().clearConsole()
    useEditorStore.getState().setTrace(null)
    toast.success('Reset to starter code')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        onRun={handleRun}
        onAnalyzeC={handleAnalyzeC}
        onRunAndVisualize={handleRunAndVisualize}
        onStop={handleStop}
        onReset={handleReset}
      />
      <Workspace onRun={handleRun} onRunAndVisualize={handleRunAndVisualize} />
    </div>
  )
}
