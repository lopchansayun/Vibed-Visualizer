export default function CallStack({ frames }) {
  const list = frames && frames.length ? frames : ['main()']
  return (
    <div className="space-y-1">
      {[...list].reverse().map((frame, idx) => (
        <div
          key={`${frame}-${idx}`}
          className="min-w-0 overflow-hidden rounded-md border border-border-soft bg-panel-raised px-2.5 py-1.5 font-mono-tight text-sm break-all"
          style={{ marginLeft: idx * 10 }}
        >
          {frame}
        </div>
      ))}
    </div>
  )
}
