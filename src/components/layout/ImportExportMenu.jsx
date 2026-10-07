import { useEffect, useRef, useState } from 'react'
import { Download, Upload, FileUp, FolderUp, FileArchive, FileDown } from 'lucide-react'
import { exportCurrentFile, exportProjectZip, importFiles } from '../../services/projectIO'

function Menu({ icon: Icon, label, items, showLabel = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-panel-raised hover:text-text ${open ? 'border-border bg-panel-raised text-text' : 'border-transparent text-text-muted'}`}
      >
        <Icon size={15} />
        <span className={showLabel ? "inline" : "hidden lg:inline"}>{label}</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border border-border bg-panel-raised py-1 shadow-2xl">
          {items.map(({ icon: ItemIcon, text, onSelect }) => (
            <button key={text} type="button" role="menuitem" onClick={() => { setOpen(false); onSelect() }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-text-muted hover:bg-bg-soft hover:text-text">
              <ItemIcon size={14} /> {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ImportExportMenu({ showLabels = false }) {
  const filesInput = useRef(null)
  const folderInput = useRef(null)
  const zipInput = useRef(null)

  const onPicked = (e) => {
    importFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className={showLabels ? "flex w-full shrink-0 flex-col items-stretch gap-0.5" : "flex shrink-0 items-center gap-0.5"}>
      <input ref={filesInput} type="file" multiple className="hidden" onChange={onPicked} />
      <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={onPicked} />
      <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden" onChange={onPicked} />
      <Menu icon={Upload} label="Import" showLabel={showLabels} items={[
        { icon: FileUp, text: 'Files…', onSelect: () => filesInput.current?.click() },
        { icon: FolderUp, text: 'Folder…', onSelect: () => folderInput.current?.click() },
        { icon: FileArchive, text: 'ZIP archive…', onSelect: () => zipInput.current?.click() },
      ]} />
      <Menu icon={Download} label="Export" showLabel={showLabels} items={[
        { icon: FileDown, text: 'Current file', onSelect: exportCurrentFile },
        { icon: FileArchive, text: 'Whole project (.zip)', onSelect: exportProjectZip },
      ]} />
    </div>
  )
}
