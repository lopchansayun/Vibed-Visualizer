import { useEffect, useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react'
import { GitBranch } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import ExecutionControls from './ExecutionControls'
import ExecutionTimeline from './ExecutionTimeline'
import VariablePanel from './VariablePanel'
import QueuePanel from './QueuePanel'
import DSAOverview from './DSAOverview'
import MemoryPanel from './MemoryPanel'
import CallStack from './CallStack'
import CurrentLineIndicator from './CurrentLineIndicator'
import Switch from '../ui/Switch'

const PLAY_INTERVAL_MS = 700

function getOffset(el, ancestor) {
  const elRect = el.getBoundingClientRect()
  const ancestorRect = ancestor.getBoundingClientRect()

  // Convert viewport coordinates into the scrollable memory content
  // coordinates. Adding scrollTop/scrollLeft keeps the pointer anchored to
  // the actual memory row even after the memory area has been scrolled.
  return {
    top: elRect.top - ancestorRect.top + ancestor.scrollTop,
    left: elRect.left - ancestorRect.left + ancestor.scrollLeft,
  }
}

export default function Visualizer() {
  const trace = useEditorStore((s) => s.trace)
  const traceError = useEditorStore((s) => s.traceError)
  const currentStep = useEditorStore((s) => s.currentStep)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const showAddresses = useEditorStore((s) => s.showAddresses)
  const toggleShowAddresses = useEditorStore((s) => s.toggleShowAddresses)
  const showStack = useEditorStore((s) => s.showStack)
  const showHeap = useEditorStore((s) => s.showHeap)
  const toggleShowStack = useEditorStore((s) => s.toggleShowStack)
  const toggleShowHeap = useEditorStore((s) => s.toggleShowHeap)
  const setCurrentStep = useEditorStore((s) => s.setCurrentStep)
  const stepNext = useEditorStore((s) => s.stepNext)
  const stepPrev = useEditorStore((s) => s.stepPrev)
  const restartTrace = useEditorStore((s) => s.restartTrace)
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying)

  const intervalRef = useRef(null)
  const steps = trace?.steps
  const memoryRef = useRef(null)
  const rowRefs = useRef(new Map())
  const [arrows, setArrows] = useState([])
  const [box, setBox] = useState({ width: 0, height: 0 })

  const registerRef = useCallback((address, el) => {
    if (el) rowRefs.current.set(address, el)
    else rowRefs.current.delete(address)
  }, [])

  useEffect(() => {
    if (isPlaying && steps) {
      intervalRef.current = setInterval(() => {
        const { currentStep: cur, trace: t } = useEditorStore.getState()
        if (!t || cur >= t.steps.length - 1) {
          setIsPlaying(false)
          return
        }
        stepNext()
      }, PLAY_INTERVAL_MS)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, steps, stepNext, setIsPlaying])

  const step = steps?.[currentStep]
  const prevStep = steps && currentStep > 0 ? steps[currentStep - 1] : null

  const danglingSet = useMemo(
    () => new Set((step?.heap || []).filter((b) => b.freed).map((b) => b.address)),
    [step]
  )

  const recomputeArrows = useCallback(() => {
    const container = memoryRef.current
    if (!container || !step || !showStack || !showHeap) {
      setArrows([])
      return
    }

    setBox({ width: container.clientWidth, height: container.scrollHeight })

    const next = []
    const isTwoColumn = container.clientWidth >= 640
    for (const v of step.stack) {
      if (!v.isPointer) continue
      const sourceEl = rowRefs.current.get(v.address)
      const targetEl = rowRefs.current.get(v.value)
      if (!sourceEl || !targetEl) continue
      const s = getOffset(sourceEl, container)
      const t = getOffset(targetEl, container)
      const stackToHeap = true

      next.push({
        key: v.name + v.address,
        // Both layouts use Stack -> Heap. The layout itself still changes
        // based on the actual Memory panel width.
        x1: s.left + sourceEl.offsetWidth - 4,
        y1: s.top + sourceEl.offsetHeight / 2,
        x2: t.left,
        y2: t.top + targetEl.offsetHeight / 2,
        stackToHeap,
        dangling: danglingSet.has(v.value),
      })
    }
    setArrows(next)
  }, [step, danglingSet, showStack, showHeap])

  useLayoutEffect(() => {
    recomputeArrows()
  }, [recomputeArrows, showAddresses, currentStep])

  useEffect(() => {
    const container = memoryRef.current
    if (!container) return

    const handleScroll = () => recomputeArrows()
    container.addEventListener('scroll', handleScroll, { passive: true })

    if (typeof ResizeObserver === 'undefined') {
      return () => container.removeEventListener('scroll', handleScroll)
    }

    const ro = new ResizeObserver(() => recomputeArrows())
    ro.observe(container)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      ro.disconnect()
    }
  }, [recomputeArrows])

  if (!steps || steps.length === 0) {
    const unavailable = Boolean(trace?.available === false || traceError)
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center">
        <GitBranch size={22} className="text-text-faint" />
        <p className="text-sm text-text-muted">{unavailable ? 'Visualization not available' : 'No execution trace yet'}</p>
        <p className="max-w-[420px] text-xs text-text-faint">
          {unavailable
            ? (trace?.message || traceError || 'This program is valid for the compiler, but uses a feature outside the educational visualizer subset.')
            : <>Click <span className="font-medium text-text-muted">Visualize</span> to step through how your program runs, line by line — including pointers and heap allocations.</>}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3">
      <div className="shrink-0">
        <CurrentLineIndicator step={step} />
      </div>

      <div className="shrink-0">
        <ExecutionControls
          isPlaying={isPlaying}
          onPrev={() => { setIsPlaying(false); stepPrev() }}
          onNext={() => { setIsPlaying(false); stepNext() }}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onRestart={() => restartTrace()}
          disablePrev={currentStep === 0}
          disableNext={currentStep === steps.length - 1}
        />
      </div>

      <div className="min-h-0 shrink-0">
        <ExecutionTimeline steps={steps} currentStep={currentStep} onSelect={(idx) => { setIsPlaying(false); setCurrentStep(idx) }} />
      </div>

      <DSAOverview step={step} />
      <QueuePanel step={step} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Memory</div>
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={showStack} onChange={toggleShowStack} label="Stack" />
          <Switch checked={showHeap} onChange={toggleShowHeap} label="Heap" />
          <Switch checked={showAddresses} onChange={toggleShowAddresses} label="Addresses" />
        </div>
      </div>

      <div ref={memoryRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10 block"
          width={box.width}
          height={box.height}
          viewBox={`0 0 ${box.width} ${box.height}`}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-blue)" />
            </marker>
            <marker id="arrowhead-dangling" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-red)" />
            </marker>
          </defs>
          {arrows.map((a) => {
            const isNarrow = box.width < 640
            const laneX = Math.max(12, box.width - 12)
            const midX = isNarrow ? laneX : (a.x1 + a.x2) / 2
            const d = isNarrow
              ? `M ${a.x1} ${a.y1} C ${laneX} ${a.y1}, ${laneX} ${a.y2}, ${a.x2} ${a.y2}`
              : `M ${a.x1} ${a.y1} C ${midX} ${a.y1}, ${midX} ${a.y2}, ${a.x2 - 6} ${a.y2}`
            return (
              <path
                key={a.key}
                d={d}
                fill="none"
                stroke={a.dangling ? 'var(--color-red)' : 'var(--color-blue)'}
                strokeWidth={box.width < 640 ? "1.75" : "1.5"}
                strokeDasharray={a.dangling ? '3,3' : undefined}
                markerEnd={a.dangling ? 'url(#arrowhead-dangling)' : 'url(#arrowhead)'}
              />
            )
          })}
        </svg>

        <div className={`grid min-w-0 gap-4 ${showStack && showHeap && box.width >= 640 ? 'grid-cols-2 lg:gap-6' : 'grid-cols-1'}`}>
          {showStack && <section className="min-w-0 rounded-lg border border-border bg-panel p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between border-b border-border-soft pb-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Stack</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wider text-text-faint">local memory · grows ↓</div>
              </div>
              <div className="font-mono-tight text-[9px] text-text-faint">LIFO</div>
            </div>
            <div className="mb-1 grid grid-cols-[1fr_auto] gap-2 px-2 text-[9px] uppercase tracking-wider text-text-faint">
              <span>Variable / value</span><span>Address</span>
            </div>
            <div className="min-w-0 overflow-hidden rounded-md border border-border-soft bg-panel-raised">
              <VariablePanel
                stack={step.stack}
                prevStack={prevStep?.stack}
                showAddresses={showAddresses}
                registerRef={registerRef}
                danglingSet={danglingSet}
              />
            </div>
          </section>}

          {showHeap && <section className="min-w-0 rounded-lg border border-border bg-panel p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between border-b border-border-soft pb-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Heap {step.heap.length > 0 && <span className="text-text-faint">· {step.heap.length}</span>}
                </div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wider text-text-faint">dynamic memory · grows ↑</div>
              </div>
              <div className="font-mono-tight text-[9px] text-text-faint">ALLOC</div>
            </div>
            <div className="mb-1 grid grid-cols-[1fr_auto] gap-2 px-2 text-[9px] uppercase tracking-wider text-text-faint">
              <span>Block / value</span><span>Address</span>
            </div>
            <div className="min-w-0 overflow-hidden rounded-md border border-border-soft bg-panel-raised">
              <MemoryPanel heap={step.heap} showAddresses={showAddresses} registerRef={registerRef} />
            </div>
          </section>}
        </div>
        {!showStack && !showHeap && (
          <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border p-6 text-xs text-text-faint">
            Stack and heap are hidden. Enable either memory view above.
          </div>
        )}
      </div>

      <section className="min-h-0 shrink-0 max-h-[22%] overflow-y-auto">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-faint">Call stack</div>
        <CallStack frames={step.callStack} />
      </section>
    </div>
  )
}
