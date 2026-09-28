export default function CurrentLineIndicator({ step }) {
  if (!step) return null
  return (
    <div className="rounded-md border border-border-soft bg-panel-raised px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-faint">
        Line {step.line}
      </div>
      <div className="mt-0.5 text-sm text-text-muted">{step.note}</div>
    </div>
  )
}
