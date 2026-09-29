function fmt(value) {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return String(value)
}

export default function QueuePanel({ step }) {
  const vars = step?.stack || []
  const queueVar = vars.find(v => v.name === 'queue' && Array.isArray(v.value))
  const frontVar = vars.find(v => v.name === 'front' && typeof v.value === 'number')
  const rearVar = vars.find(v => v.name === 'rear' && typeof v.value === 'number')

  if (!queueVar || !frontVar || !rearVar) return null

  const front = Math.trunc(frontVar.value)
  const rear = Math.trunc(rearVar.value)
  const empty = front === -1
  const circular = !empty && rear < front
  const items = empty
    ? []
    : circular
      ? [...queueVar.value.slice(front), ...queueVar.value.slice(0, rear + 1)]
      : queueVar.value.slice(Math.max(0, front), Math.min(queueVar.value.length, rear + 1))

  return (
    <section className="shrink-0 rounded-lg border border-border bg-panel p-2.5 sm:p-3">
      <div className="mb-2 flex items-center justify-between border-b border-border-soft pb-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Queue</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-text-faint">FIFO · front → rear</div>
        </div>
        <div className="font-mono-tight text-[9px] text-text-faint">{empty ? 'EMPTY' : `${items.length} item${items.length === 1 ? '' : 's'}`}</div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono-tight text-text-faint">
        <span>front = <b className="text-text-muted">{fmt(front)}</b></span>
        <span>rear = <b className="text-text-muted">{fmt(rear)}</b></span>
      </div>

      {empty ? (
        <div className="rounded-md border border-dashed border-border-soft px-3 py-4 text-center text-xs text-text-faint">
          Queue is empty
        </div>
      ) : (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {items.map((value, offset) => {
            const index = circular ? (front + offset) % queueVar.value.length : front + offset
            return (
              <div key={index} className="min-w-[64px] rounded-md border border-border-soft bg-panel-raised px-2 py-2 text-center">
                <div className="text-[9px] font-mono-tight text-text-faint">[{index}]</div>
                <div className="mt-1 text-sm font-semibold font-mono-tight text-text-muted">{fmt(value)}</div>
                <div className="mt-1 text-[8px] uppercase tracking-wider text-text-faint">
                  {index === front ? 'front' : index === rear ? 'rear' : 'item'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
