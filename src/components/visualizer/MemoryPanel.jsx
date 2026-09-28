import { fmtAddr } from '../../services/interpreter'

function fmtValue(v) {
  if (Array.isArray(v)) return `[${v.map(fmtValue).join(', ')}]`
  if (v && typeof v === 'object' && v.__struct) {
    return `${v.type} { ${Object.entries(v.fields || {}).map(([k, x]) => `${k}: ${fmtValue(x)}`).join(', ')} }`
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v)
}

// Renders heap blocks (from malloc / new). Freed blocks stay visible but
// dimmed so a dangling pointer in the stack panel still has something to
// point an arrow at — that's the whole point of showing the bug.
export default function MemoryPanel({ heap, showAddresses, registerRef }) {
  if (!heap || heap.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[10px] text-text-faint sm:text-xs">
        No heap allocations yet
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {heap.map((block) => (
        <div
          key={block.address}
          ref={(el) => registerRef?.(block.address, el)}
          className={`border-b last:border-b-0 px-2 py-1.5 text-[11px] sm:px-2.5 sm:py-2 sm:text-sm ${
            block.freed
              ? 'border-dashed border-red/40 bg-red-soft'
              : 'border-border-soft bg-panel-raised'
          }`}
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="min-w-0 break-all font-mono-tight text-[9px] text-text-faint sm:text-[10px] sm:text-xs">
              {block.size > 1 ? `block[${block.size}]` : 'block'}
            </span>
            {block.freed && (
              <span className="rounded bg-red-soft px-1.5 py-0.5 text-[9px] font-medium sm:text-[10px] text-red">
                freed
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className={`min-w-0 max-w-full break-all font-mono-tight font-medium ${block.freed ? 'text-text-faint line-through' : ''}`}>
              {fmtValue(block.value)}
            </span>
          </div>
          {showAddresses && (
            <div className="mt-0.5 font-mono-tight text-[9px] text-text-faint sm:text-[10px]">{fmtAddr(block.address)}</div>
          )}
        </div>
      ))}
    </div>
  )
}
