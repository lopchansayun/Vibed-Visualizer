import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CircleAlert, CircleX, Code2, Database, GitBranch, Layers3, Search, Server, Boxes } from 'lucide-react'
import { C_SUPPORT_CATEGORIES, C_SUPPORT_FLAT, C_SUPPORT_STATS, STATUS, percent } from '../config/support/c'
import { LANGUAGES, LANGUAGE_ORDER } from '../config/languages'

const statusMeta = {
  supported: { label: 'Supported', icon: CheckCircle2, className: 'text-green border-green/30 bg-green-soft' },
  partial: { label: 'Partial', icon: CircleAlert, className: 'text-amber border-amber/30 bg-amber-soft' },
  unsupported: { label: 'Not supported', icon: CircleX, className: 'text-red border-red/30 bg-red-soft' },
}

const categoryIcons = {
  core: Code2,
  memory: Database,
  structs: Boxes,
  'arrays-strings': Layers3,
  dsa: GitBranch,
  algorithms: Search,
  stdlib: Server,
  projects: Code2,
}

function StatusBadge({ status }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}><Icon size={11} />{meta.label}</span>
}

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-bg-soft/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <div className="font-mono-tight text-sm font-semibold">Language & C/DSA Support</div>
            <div className="text-[11px] text-text-faint">Judge0 execution coverage and C source-level visualization</div>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
            <ArrowLeft size={13} /> Back to editor
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        <section className="grid gap-3 sm:grid-cols-4">
          <Stat label="Judge0 languages" value={LANGUAGE_ORDER.length} detail="active CodeViz presets" />
          <Stat label="C visualization" value="Enabled" detail="source-level trace runtime" tone="green" />
          <Stat label="Other languages" value="Run only" detail="Judge0 execution" tone="amber" />
          <Stat label="C/DSA features" value={C_SUPPORT_STATS.total} detail="tracked support entries" />
        </section>

        <section className="rounded-lg border border-border bg-panel p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">What you can practice</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">
                The visualizer is designed around real C DSA code: pointers, heap allocation, structs, recursion, arrays, linked structures, trees, graphs and algorithms. The native compiler remains the authoritative execution path.
              </p>
            </div>
            <div className="text-right text-[10px] text-text-faint">The C/DSA matrix is a feature inventory, not a claim that every possible C program can be visualized.</div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-soft">
            <div className="h-full bg-green" style={{ width: `${percent(C_SUPPORT_STATS.supported + C_SUPPORT_STATS.partial)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-faint">
            <span><b className="text-green">{C_SUPPORT_STATS.supported}</b> supported</span>
            <span><b className="text-amber">{C_SUPPORT_STATS.partial}</b> partial</span>
            <span><b className="text-green">{C_SUPPORT_STATS.supported + C_SUPPORT_STATS.partial}</b> covered</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-panel">
          <div className="border-b border-border-soft px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">Judge0 languages</h2>
            <p className="mt-0.5 text-[11px] text-text-faint">All configured languages use Judge0 for real execution. Only C has the source-level visualizer.</p>
          </div>
          <div className="divide-y divide-border-soft">
            {LANGUAGE_ORDER.map(key => {
              const language = LANGUAGES[key]
              return (
                <div key={key} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(190px,1fr)_auto_auto] sm:items-center sm:px-5">
                  <div className="text-xs font-medium">{language.label}</div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-mono-tight text-text-muted">Judge0 {language.judge0Id}</span>
                  <span className={`text-[10px] font-medium ${language.visualizable ? 'text-green' : 'text-text-faint'}`}>{language.visualizable ? 'Visualize + Run' : 'Run only'}</span>
                </div>
              )
            })}
          </div>
        </section>

        <div className="space-y-4">
          {C_SUPPORT_CATEGORIES.map(category => {
            const Icon = categoryIcons[category.id] || Code2
            const rows = category.items
            const supported = rows.filter(([, status]) => status === STATUS.supported).length
            const partial = rows.filter(([, status]) => status === STATUS.partial).length
            return (
              <section key={category.id} className="overflow-hidden rounded-lg border border-border bg-panel">
                <div className="border-b border-border-soft px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-soft text-text-muted"><Icon size={15} /></div>
                      <div>
                        <h2 className="text-sm font-semibold">{category.title}</h2>
                        <p className="mt-0.5 text-[11px] text-text-faint">{category.description}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-text-faint">{supported} supported{partial ? ` · ${partial} partial` : ''}</div>
                  </div>
                </div>
                <div className="divide-y divide-border-soft">
                  {rows.map(([name, status, note]) => (
                    <div key={name} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(190px,0.8fr)_auto_minmax(280px,1.5fr)] sm:items-center sm:px-5">
                      <div className="text-xs font-medium">{name}</div>
                      <StatusBadge status={status} />
                      <div className="text-[11px] leading-4 text-text-muted">{note}</div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <section className="rounded-lg border border-border bg-panel p-4 sm:p-5">
          <h2 className="text-sm font-semibold">How support works</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Flow title="1. Compile" text="Judge0 compiles and runs the actual C project, including multiple .c files." />
            <Flow title="2. Interpret" text="The deterministic C runtime executes the supported source subset to produce semantic trace steps." />
            <Flow title="3. Visualize" text="Stack, heap, pointers, calls and data-structure panels consume those trace steps." />
          </div>
          <p className="mt-4 text-[10px] leading-4 text-text-faint">The support matrix describes the educational C runtime and visualizer model. Judge0 remains the authoritative compiler/runtime; language availability can vary by Judge0 deployment.</p>
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value, detail, tone }) {
  const toneClass = tone === 'green' ? 'text-green' : tone === 'amber' ? 'text-amber' : tone === 'red' ? 'text-red' : 'text-text'
  return <div className="rounded-lg border border-border bg-panel p-4"><div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div><div className={`mt-1 text-2xl font-semibold font-mono-tight ${toneClass}`}>{value}</div><div className="mt-1 text-[10px] text-text-faint">{detail}</div></div>
}

function Flow({ title, text }) {
  return <div className="rounded-md border border-border-soft bg-panel-raised p-3"><div className="text-xs font-semibold">{title}</div><p className="mt-1 text-[11px] leading-4 text-text-muted">{text}</p></div>
}

export function supportSearch(text) {
  const query = String(text || '').trim().toLowerCase()
  return query ? C_SUPPORT_FLAT.filter(item => `${item.name} ${item.category} ${item.note}`.toLowerCase().includes(query)) : C_SUPPORT_FLAT
}
