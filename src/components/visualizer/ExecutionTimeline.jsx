export default function ExecutionTimeline({ steps, currentStep, onSelect }) {
  if (!steps || steps.length === 0) return null
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, idx) => (
        <div key={idx} className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSelect(idx)}
            title={`Line ${step.line}: ${step.note}`}
            className={`h-6 min-w-6 rounded px-1.5 font-mono-tight text-[11px] transition-colors ${
              idx === currentStep
                ? 'bg-amber text-bg font-semibold'
                : idx < currentStep
                  ? 'bg-panel-raised text-text-muted'
                  : 'bg-bg-soft text-text-faint'
            }`}
          >
            {idx + 1}
          </button>
          {idx < steps.length - 1 && <div className="h-px w-3 bg-border" />}
        </div>
      ))}
    </div>
  )
}
