import { useMemo } from 'react'

function fmt(value) {
  if (value === undefined || value === null) return 'NULL'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (Array.isArray(value)) return `[${value.map(fmt).join(', ')}]`
  return String(value)
}

function pointerAddress(value) {
  return typeof value === 'number' && value > 0 ? value : null
}

function stackValue(step, name) {
  return step?.stack?.find((v) => v.name === name)?.value
}

function algorithmName(step) {
  const frames = (step?.callStack || []).join(' ').toLowerCase()
  if (frames.includes('selectionsort')) return 'Selection sort'
  if (frames.includes('bubblesort')) return 'Bubble sort'
  if (frames.includes('insertionsort')) return 'Insertion sort'
  if (frames.includes('shellsort')) return 'Shell sort'
  if (frames.includes('mergesort') || frames.includes('merge')) return 'Merge sort'
  if (frames.includes('quicksort') || frames.includes('partition')) return 'Quick sort'
  if (frames.includes('binarysearch')) return 'Binary search'
  if (frames.includes('sequentialsearch') || frames.includes('linearsearch')) return 'Sequential search'
  if (frames.includes('dfs')) return 'DFS'
  if (frames.includes('bfs')) return 'BFS'
  return null
}

function isStructNode(block) {
  const value = block?.value
  return value && typeof value === 'object' && value.__struct && value.fields
}

function isPointerField(value) {
  return typeof value === 'number' && value > 0
}

function StructGraph({ step, mode }) {
  const nodes = (step.heap || []).filter((b) => !b.freed && isStructNode(b))
  if (!nodes.length) return null

  const byAddress = new Map(nodes.map((b) => [b.address, b]))
  const rootCandidates = (step.stack || [])
    .filter((v) => v.isPointer && byAddress.has(v.value))
    .filter((v) => /head|root|top|start|front|rear|node|tree|graph/i.test(v.name))
  const roots = rootCandidates.length ? rootCandidates : (nodes[0] ? [{ name: 'root', value: nodes[0].address }] : [])

  const edges = []
  nodes.forEach((b) => {
    Object.entries(b.value.fields || {}).forEach(([field, value]) => {
      if (isPointerField(value) && byAddress.has(value)) edges.push({ from: b.address, to: value, field })
    })
  })

  const seen = new Set()
  const chain = []
  const walk = (address, depth = 0) => {
    if (!address || seen.has(`${address}:${depth}`) || depth > 32) return
    const node = byAddress.get(address)
    if (!node) return
    seen.add(`${address}:${depth}`)
    chain.push(node)
    const next = node.value.fields?.next
    if (isPointerField(next)) walk(next, depth + 1)
  }
  if (mode === 'linked-list') walk(roots[0]?.value)

  const treeNodes = []
  const walkTree = (address, depth = 0, path = '0') => {
    if (!address || depth > 8) return
    const node = byAddress.get(address)
    if (!node) return
    treeNodes.push({ node, depth, path })
    const left = node.value.fields?.left
    const right = node.value.fields?.right
    if (isPointerField(left)) walkTree(left, depth + 1, `${path}L`)
    if (isPointerField(right)) walkTree(right, depth + 1, `${path}R`)
  }
  if (mode === 'tree') walkTree(roots[0]?.value)

  const display = mode === 'linked-list' ? chain : mode === 'tree' ? treeNodes.map((x) => x.node) : nodes
  if (!display.length) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {display.map((node, index) => {
          const value = node.value
          const label = Object.entries(value.fields || {}).filter(([k]) => !['next', 'prev', 'left', 'right'].includes(k)).slice(0, 2).map(([k, v]) => `${k}=${fmt(v)}`).join(' · ')
          const outgoing = edges.filter((e) => e.from === node.address)
          return (
            <div key={`${node.address}-${index}`} className="min-w-[96px] rounded-md border border-border-soft bg-panel-raised px-2 py-2 text-center">
              <div className="text-[9px] font-mono-tight text-text-faint">{value.type}</div>
              <div className="mt-1 text-xs font-semibold text-text-muted">{label || fmt(value.fields)}</div>
              <div className="mt-1 text-[8px] font-mono-tight text-text-faint">{outgoing.length ? outgoing.map((e) => `${e.field} → ${String(e.to)}`).join(' · ') : 'leaf / NULL'}</div>
            </div>
          )
        })}
      </div>
      {mode === 'tree' && (
        <div className="text-[9px] text-text-faint">Tree links are derived from `left` / `right` pointer fields; recursion depth is shown by the execution call stack.</div>
      )}
    </div>
  )
}

function ArrayView({ value, name }) {
  if (!Array.isArray(value) || value.length > 64) return null
  const isMatrix = value.some(Array.isArray)
  if (isMatrix) {
    return (
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px] font-mono-tight">
          <tbody>{value.map((row, i) => (
            <tr key={i}>{(Array.isArray(row) ? row : [row]).map((cell, j) => <td key={j} className="border border-border-soft bg-panel-raised px-2 py-1">{fmt(cell)}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
      {value.map((cell, i) => (
        <div key={i} className="min-w-[52px] rounded border border-border-soft bg-panel-raised px-1.5 py-1.5 text-center">
          <div className="text-[8px] text-text-faint">[{i}]</div>
          <div className="mt-0.5 text-[11px] font-semibold font-mono-tight text-text-muted">{fmt(cell)}</div>
        </div>
      ))}
    </div>
  )
}

export default function DSAOverview({ step }) {
  const info = useMemo(() => {
    if (!step) return null
    const arrays = (step.stack || []).filter((v) => Array.isArray(v.value) && v.value.length <= 64)
    const names = arrays.map((v) => v.name.toLowerCase())
    const hasStructs = (step.heap || []).some(isStructNode)
    const hasList = (step.heap || []).some((b) => isStructNode(b) && Object.prototype.hasOwnProperty.call(b.value.fields || {}, 'next'))
    const hasTree = (step.heap || []).some((b) => isStructNode(b) && (Object.prototype.hasOwnProperty.call(b.value.fields || {}, 'left') || Object.prototype.hasOwnProperty.call(b.value.fields || {}, 'right')))
    const hasGraphMatrix = arrays.some((v) => Array.isArray(v.value) && v.value.some(Array.isArray))
    const algorithm = algorithmName(step)
    const hash = names.some((n) => /hash|table|bucket/.test(n)) || (hasStructs && names.some((n) => /item|array/.test(n)))
    const mode = hasList ? 'linked-list' : hasTree ? 'tree' : null
    return { arrays, names, hasStructs, hasList, hasTree, hasGraphMatrix, algorithm, hash, mode }
  }, [step])

  if (!info) return null
  const interesting = info.arrays.length || info.hasStructs || info.algorithm || info.hash
  if (!interesting) return null

  return (
    <section className="shrink-0 rounded-lg border border-border bg-panel p-2.5 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">DSA visualization</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-text-faint">derived from the current C execution state</div>
        </div>
        <div className="text-[9px] font-mono-tight text-text-faint">{info.algorithm || (info.hasList ? 'Linked list' : info.hasTree ? 'Tree' : info.hasGraphMatrix ? 'Graph matrix' : info.hash ? 'Hash table' : 'Array')}</div>
      </div>

      {info.algorithm && info.arrays.length > 0 && (
        <div className="mb-2 space-y-2">
          {info.arrays.slice(0, 2).map((v) => <div key={v.name}><div className="mb-1 text-[9px] font-mono-tight text-text-faint">{v.name}</div><ArrayView value={v.value} name={v.name} /></div>)}
        </div>
      )}

      {info.hasGraphMatrix && !info.algorithm && (
        <div className="mb-2 space-y-2">{info.arrays.filter((v) => v.value.some(Array.isArray)).slice(0, 1).map((v) => <div key={v.name}><div className="mb-1 text-[9px] font-mono-tight text-text-faint">{v.name} · adjacency / matrix state</div><ArrayView value={v.value} name={v.name} /></div>)}</div>
      )}

      {info.mode && <StructGraph step={step} mode={info.mode} />}

      {info.hash && !info.mode && info.arrays.filter((v) => /hash|table|bucket/i.test(v.name)).map((v) => (
        <div key={v.name} className="mt-2"><div className="mb-1 text-[9px] font-mono-tight text-text-faint">{v.name} · buckets</div><ArrayView value={v.value} name={v.name} /></div>
      ))}

      {info.hasStructs && !info.mode && !info.algorithm && <StructGraph step={step} mode="struct" />}
    </section>
  )
}
