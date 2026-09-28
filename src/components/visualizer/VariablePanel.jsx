import { fmtAddr } from '../../services/interpreter'
import { ArrowRight } from 'lucide-react'

function fmt(v) {
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`
  if (v === undefined) return 'undefined'
  if (v && typeof v === 'object' && v.__struct) {
    return `${v.type} { ${Object.entries(v.fields || {}).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ')} }`
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return String(v)
}

// Renders the current stack frame. Pointer rows show the address they hold
// (their arrow's target is drawn by the parent Visualizer, which owns the
// shared row-ref map so it can connect stack -> stack or stack -> heap).
export default function VariablePanel({ stack, prevStack, showAddresses, registerRef, danglingSet }) {
  if (!stack || stack.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-text-faint">
        No variables declared yet
      </div>
    )
  }

  const prevByName = new Map((prevStack || []).map((v) => [v.name, v]))

  return (
    <div className="space-y-1">
      {stack.map((v) => {
        const prev = prevByName.get(v.name)
        const changed = prev && prev.value !== v.value
        const dangling = v.isPointer && danglingSet?.has(v.value)
        const displayValue = v.isPointer ? fmtAddr(v.value) : fmt(v.value)
        const longValue = displayValue.length > 3
        return (
          <div
            key={v.name}
            ref={(el) => registerRef?.(v.address, el)}
            className={`border-b border-border-soft last:border-b-0 px-2 py-1.5 text-[11px] transition-colors sm:px-2.5 sm:py-2 sm:text-sm ${
              changed ? 'bg-amber-soft' : ''
            }`}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="min-w-0 break-all font-mono-tight text-text-muted">{v.name}</span>
              <span className={`ml-2 min-w-0 max-w-[65%] flex items-center justify-end gap-0.5 whitespace-nowrap overflow-visible text-right font-mono-tight font-medium sm:gap-1 ${longValue ? 'text-[8px] leading-none' : 'text-[10px] sm:text-sm'}`}>
                {v.isPointer && <ArrowRight size={10} className={dangling ? 'text-red' : 'text-blue'} />}
                {changed && !v.isPointer && (
                  <span className="mr-0.5 text-[9px] text-text-faint line-through sm:text-xs">{fmt(prev.value)}</span>
                )}
                <span className={`min-w-0 whitespace-nowrap overflow-visible ${dangling ? 'text-red' : ''}`}>
                  {displayValue}
                </span>
              </span>
            </div>
            {showAddresses && (
              <div className="mt-0.5 text-right font-mono-tight text-[9px] text-text-faint sm:text-[10px]">
                @ {fmtAddr(v.address)}
              </div>
            )}
            {dangling && (
              <div className="mt-0.5 text-right text-[10px] font-medium text-red">dangling — points to freed memory</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
