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

const ResizeHandleH = () => (
  <PanelResizeHandle className="group relative h-1.5 shrink-0 bg-transparent">
    <div className="my-auto h-px w-full bg-border transition-colors group-hover:bg-amber group-data-[resize-handle-state=drag]:bg-amber" />
  </PanelResizeHandle>
)

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

  const consolePane = (
    <div className="h-full min-h-0 overflow-hidden rounded-[var(--radius-panel)] border border-border-soft bg-panel">
      <OutputConsole />
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

        {consoleOpen && (
          <div className="absolute inset-x-2 bottom-2 z-30 h-[42%] min-h-[220px] overflow-hidden rounded-[var(--radius-panel)] border border-border bg-panel shadow-2xl">
            {consolePane}
          </div>
        )}

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
          <PanelGroup direction="vertical">
            <Panel defaultSize={consoleOpen ? 76 : 100} minSize={35}>
              {editorPane}
            </Panel>
            {consoleOpen && (
              <>
                <ResizeHandleH />
                <Panel defaultSize={24} minSize={14} maxSize={45}>
                  {consolePane}
                </Panel>
              </>
            )}
          </PanelGroup>
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
