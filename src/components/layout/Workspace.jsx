import { useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useEditorStore } from '../../store/useEditorStore'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import CodeEditor from '../editor/CodeEditor'
import Visualizer from '../visualizer/Visualizer'
import OutputConsole from '../console/OutputConsole'
import FileExplorer from './FileExplorer'
import { LANGUAGES } from '../../config/languages'

const ResizeHandleV = () => (
  <PanelResizeHandle className="group relative w-1.5 shrink-0 bg-transparent">
    <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-amber group-data-[resize-handle-state=drag]:bg-amber" />
  </PanelResizeHandle>
)

// Height of the console header strip that stays visible while collapsed.
const CONSOLE_COLLAPSED_PX = 42
const CONSOLE_MIN_PX = 140

function ConsoleDock({ open, className = '', style }) {
  const [height, setHeight] = useState(240)
  const [dragging, setDragging] = useState(false)
  const dockRef = useRef(null)

  const startDrag = (event) => {
    if (!open) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const maxHeight = Math.max(CONSOLE_MIN_PX, (dockRef.current?.parentElement?.clientHeight || 600) - 160)
    setDragging(true)
    const onMove = (e) => setHeight(Math.min(maxHeight, Math.max(CONSOLE_MIN_PX, startHeight + (startY - e.clientY))))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={dockRef}
      className={`flex shrink-0 flex-col ${className}`}
      style={{
        height: open ? height : CONSOLE_COLLAPSED_PX,
        transition: dragging ? 'none' : 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...style,
      }}
    >
      <div
        onPointerDown={startDrag}
        style={{ touchAction: 'none' }}
        className={`group relative h-1.5 shrink-0 ${open ? 'cursor-row-resize' : 'pointer-events-none'}`}
      >
        <div className="my-auto h-px w-full bg-border transition-colors group-hover:bg-amber" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-panel)] border border-border-soft bg-panel">
        <OutputConsole />
      </div>
    </div>
  )
}

export default function Workspace({ onRun, onRunAndVisualize }) {
  const visualizerOpen = useEditorStore((s) => s.visualizerOpen && LANGUAGES[s.language]?.visualizable === true)
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)
  const consoleOpen = useEditorStore((s) => s.consoleOpen)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const editorPane = (
    <div className="h-full min-h-0 overflow-hidden rounded-[var(--radius-panel)] border border-border-soft bg-panel">
      <CodeEditor onRun={onRun} onRunAndVisualize={onRunAndVisualize} />
    </div>
  )

  const visualizerPane = (
    <div className="h-full min-h-0 overflow-hidden rounded-[var(--radius-panel)] border border-border-soft bg-panel shadow-2xl">
      <Visualizer />
    </div>
  )

  if (!isDesktop) {
    return (
      <div className="relative min-h-0 flex-1 overflow-hidden p-2">
        <div className="h-full min-h-0">{editorPane}</div>

        {sidebarOpen && (
          <>
            <button type="button" aria-label="Close file sidebar" onClick={toggleSidebar} className="absolute inset-0 z-20 bg-black/40" />
            <div className="absolute inset-y-2 left-2 z-30 w-[min(280px,85%)] overflow-hidden rounded-[var(--radius-panel)] border border-border bg-panel shadow-2xl">
              <FileExplorer />
            </div>
          </>
        )}

        <ConsoleDock
          open={consoleOpen}
          className="absolute inset-x-2 bottom-2 z-30 rounded-[var(--radius-panel)] shadow-2xl"
        />

        {visualizerOpen && (
          <div className="absolute inset-0 z-40 overflow-hidden bg-bg p-0">
            {visualizerPane}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 p-2">
      <PanelGroup direction="horizontal">
        {sidebarOpen && (
          <>
            <Panel id="sidebar" order={1} defaultSize={20} minSize={14} maxSize={40}>
              <div className="h-full min-h-0 overflow-hidden rounded-[var(--radius-panel)] border border-border-soft bg-panel">
                <FileExplorer />
              </div>
            </Panel>
            <ResizeHandleV />
          </>
        )}
        <Panel id="main" order={2} defaultSize={visualizerOpen ? 62 : 100} minSize={30}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">{editorPane}</div>
            <ConsoleDock open={consoleOpen} />
          </div>
        </Panel>

        {visualizerOpen && (
          <>
            <ResizeHandleV />
            <Panel id="visualizer" order={3} defaultSize={38} minSize={28}>
              {visualizerPane}
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  )
}
