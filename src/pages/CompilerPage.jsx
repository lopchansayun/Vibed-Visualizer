import { useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { useEditorStore } from '../store/useEditorStore'
import { compileAndRun } from '../services/compilerService'
import { buildExecutionTrace } from '../services/visualizerService'
import Header from '../components/layout/Header'
import Workspace from '../components/layout/Workspace'

export default function CompilerPage() {
  const runTokenRef = useRef(0)

  const run = useCallback(async ({ withVisualizer }) => {
    const token = ++runTokenRef.current
    const { language, code, files, input, setStatus, setOutput, setActiveConsoleTab, setTrace } = useEditorStore.getState()
    // Always open the console when execution starts.
    useEditorStore.setState({ consoleOpen: true })
    const projectFiles = files[language] || []
    const entryName = 'main.c'
    const entryFile = projectFiles.find((f) => f.name === entryName) || projectFiles[0]
    const source = entryFile?.content || code[language]
    const visualizationAvailable = projectFiles.some((file) => /\.c$/i.test(file.name))

    setActiveConsoleTab('output')
    setStatus('compiling')

    let result
    try {
      result = await compileAndRun({ language, code: source, files: files[language], stdin: input })
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
        const trace = await buildExecutionTrace({ language, code: source, files: projectFiles, stdin: input })
        if (runTokenRef.current !== token) return
        setTrace(trace)
        if (!trace.available) toast('Program ran, but this source is outside the visualizer subset.', { icon: 'ℹ️' })
      } catch (err) {
        if (runTokenRef.current !== token) return
        setTrace({ steps: [], available: false, message: 'The program ran, but a source-level execution trace could not be built.' })
      }
    }
  }, [])

  const handleRun = () => run({ withVisualizer: false })
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
        onRunAndVisualize={handleRunAndVisualize}
        onStop={handleStop}
        onReset={handleReset}
      />
      <Workspace onRun={handleRun} onRunAndVisualize={handleRunAndVisualize} />
    </div>
  )
}
