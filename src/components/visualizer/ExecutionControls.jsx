import { SkipBack, Play, Pause, SkipForward, RotateCcw } from 'lucide-react'

export default function ExecutionControls({
  onPrev,
  onNext,
  onTogglePlay,
  onRestart,
  isPlaying,
  disablePrev,
  disableNext,
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-border-soft bg-panel-raised p-1">
      <button
        type="button"
        onClick={onRestart}
        title="Restart"
        className="rounded p-1.5 text-text-muted hover:bg-panel hover:text-text"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        onClick={onPrev}
        disabled={disablePrev}
        title="Previous step"
        className="rounded p-1.5 text-text-muted hover:bg-panel hover:text-text disabled:opacity-30"
      >
        <SkipBack size={15} />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        title={isPlaying ? 'Pause' : 'Play'}
        className="rounded-md bg-amber p-1.5 text-bg hover:brightness-110"
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disableNext}
        title="Next step"
        className="rounded p-1.5 text-text-muted hover:bg-panel hover:text-text disabled:opacity-30"
      >
        <SkipForward size={15} />
      </button>
    </div>
  )
}
