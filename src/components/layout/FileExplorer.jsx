import { useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronDown, File, FilePlus2, Folder, FolderOpen, FolderPlus, Pencil, Trash2, PanelLeftClose } from 'lucide-react'
import toast from 'react-hot-toast'
import { useEditorStore } from '../../store/useEditorStore'
import { buildTree, joinPath, dirName, baseName } from '../../utils/paths'

const ROW = 'group flex h-7 w-full items-center gap-1 rounded pr-1 text-xs'

function NameInput({ depth, initial = '', icon: Icon, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (fn) => { if (done.current) return; done.current = true; fn() }
  const submit = () => finish(() => (value.trim() && value.trim() !== initial ? onSubmit(value.trim()) : onCancel()))
  return (
    <div className={ROW} style={{ paddingLeft: 8 + depth * 12 }}>
      <Icon size={14} className="shrink-0 text-text-muted" />
      <input
        autoFocus
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') finish(onCancel)
        }}
        aria-label="Name"
        className="h-6 min-w-0 flex-1 rounded border border-blue bg-bg px-1.5 font-mono-tight text-xs outline-none"
      />
    </div>
  )
}

function Action({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted ${danger ? 'hover:bg-red-soft hover:text-red' : 'hover:bg-border hover:text-text'}`}
    >
      <Icon size={12} />
    </button>
  )
}

export default function FileExplorer() {
  const language = useEditorStore((s) => s.language)
  const files = useEditorStore((s) => s.files[s.language]) || []
  const folders = useEditorStore((s) => s.folders[s.language]) || []
  const activeFile = useEditorStore((s) => s.activeFile[s.language])
  const switchFile = useEditorStore((s) => s.switchFile)
  const createFile = useEditorStore((s) => s.createFile)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameEntry = useEditorStore((s) => s.renameEntry)
  const deleteEntry = useEditorStore((s) => s.deleteEntry)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)

  const [collapsed, setCollapsed] = useState(() => new Set())
  // editing: { mode: 'file' | 'folder' | 'rename', parent, path?, isFolder? }
  const [editing, setEditing] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState('')

  const tree = useMemo(() => buildTree(files, folders), [files, folders])

  const expand = (path) => setCollapsed((prev) => { const next = new Set(prev); next.delete(path); return next })
  const toggle = (path) => setCollapsed((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next })

  const startCreate = (mode, parent = selectedFolder) => {
    if (parent) expand(parent)
    setEditing({ mode, parent })
  }

  const report = (result) => {
    if (!result.ok) toast.error(result.error)
    return result.ok
  }

  const submitEdit = (value) => {
    const edit = editing
    setEditing(null)
    if (edit.mode === 'file') report(createFile(joinPath(edit.parent, value)))
    else if (edit.mode === 'folder') {
      const result = createFolder(joinPath(edit.parent, value))
      if (report(result)) expand(result.path)
    } else report(renameEntry(edit.path, joinPath(dirName(edit.path), value), edit.isFolder))
  }

  const confirmDelete = (node) => {
    const label = node.type === 'folder' ? `folder "${node.path}" and everything in it` : `"${node.path}"`
    if (window.confirm(`Delete ${label}?`)) {
      if (report(deleteEntry(node.path, node.type === 'folder')) && node.type === 'folder' && selectedFolder.startsWith(node.path)) setSelectedFolder('')
    }
  }

  const renderNodes = (nodes, depth) => nodes.map((node) => {
    const pad = { paddingLeft: 8 + depth * 12 }
    const isRenaming = editing?.mode === 'rename' && editing.path === node.path

    if (isRenaming) {
      return <NameInput key={node.path} depth={depth} initial={node.name} icon={node.type === 'folder' ? Folder : File} onSubmit={submitEdit} onCancel={() => setEditing(null)} />
    }

    if (node.type === 'file') {
      const active = node.path === activeFile
      return (
        <div
          key={node.path}
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          style={pad}
          onClick={() => { switchFile(node.path); setSelectedFolder(dirName(node.path)) }}
          onKeyDown={(e) => e.key === 'Enter' && switchFile(node.path)}
          className={`${ROW} cursor-pointer ${active ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text'}`}
        >
          <span className="w-3 shrink-0" />
          <File size={14} className={`shrink-0 ${active ? 'text-amber' : ''}`} />
          <span className="min-w-0 flex-1 truncate font-mono-tight" title={node.path}>{node.name}</span>
          <span className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <Action icon={Pencil} label="Rename" onClick={() => setEditing({ mode: 'rename', path: node.path, isFolder: false })} />
            <Action icon={Trash2} label="Delete" danger onClick={() => confirmDelete(node)} />
          </span>
        </div>
      )
    }

    const isCollapsed = collapsed.has(node.path)
    const selected = selectedFolder === node.path
    return (
      <div key={node.path} role="treeitem" aria-expanded={!isCollapsed}>
        <div
          style={pad}
          onClick={() => { setSelectedFolder(node.path); toggle(node.path) }}
          className={`${ROW} cursor-pointer ${selected ? 'bg-bg-soft text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text'}`}
        >
          {isCollapsed ? <ChevronRight size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
          {isCollapsed ? <Folder size={14} className="shrink-0 text-blue" /> : <FolderOpen size={14} className="shrink-0 text-blue" />}
          <span className="min-w-0 flex-1 truncate font-mono-tight" title={node.path}>{node.name}</span>
          <span className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <Action icon={FilePlus2} label="New file in folder" onClick={() => startCreate('file', node.path)} />
            <Action icon={FolderPlus} label="New subfolder" onClick={() => startCreate('folder', node.path)} />
            <Action icon={Pencil} label="Rename" onClick={() => setEditing({ mode: 'rename', path: node.path, isFolder: true })} />
            <Action icon={Trash2} label="Delete" danger onClick={() => confirmDelete(node)} />
          </span>
        </div>
        {!isCollapsed && (
          <div role="group">
            {renderNodes(node.children, depth + 1)}
            {editing && editing.mode !== 'rename' && editing.parent === node.path && (
              <NameInput depth={depth + 1} icon={editing.mode === 'file' ? File : Folder} onSubmit={submitEdit} onCancel={() => setEditing(null)} />
            )}
            {!node.children.length && !(editing && editing.mode !== 'rename' && editing.parent === node.path) && (
              <div style={{ paddingLeft: 8 + (depth + 1) * 12 + 16 }} className="py-1 text-[11px] italic text-text-faint">Empty</div>
            )}
          </div>
        )}
      </div>
    )
  })

  return (
    <aside aria-label="Project files" className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-soft px-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-text-muted">Explorer</span>
        <Action icon={FilePlus2} label="New file" onClick={() => startCreate('file')} />
        <Action icon={FolderPlus} label="New folder" onClick={() => startCreate('folder')} />
        <Action icon={PanelLeftClose} label="Hide sidebar" onClick={toggleSidebar} />
      </div>
      <div
        role="tree"
        aria-label={`${language} project`}
        className="min-h-0 flex-1 overflow-auto py-1"
        onClick={(e) => { if (e.target === e.currentTarget) setSelectedFolder('') }}
      >
        {renderNodes(tree.children, 0)}
        {editing && editing.mode !== 'rename' && editing.parent === '' && (
          <NameInput depth={0} icon={editing.mode === 'file' ? File : Folder} onSubmit={submitEdit} onCancel={() => setEditing(null)} />
        )}
      </div>
      <div className="shrink-0 border-t border-border-soft px-3 py-1.5 text-[11px] text-text-faint">
        {files.length} file{files.length === 1 ? '' : 's'}{selectedFolder ? ` · new items go in ${baseName(selectedFolder)}/` : ''}
      </div>
    </aside>
  )
}
