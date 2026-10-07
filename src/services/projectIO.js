import toast from 'react-hot-toast'
import { useEditorStore } from '../store/useEditorStore'
import { LANGUAGES } from '../config/languages'
import { filesToZipBytes, readZip } from '../utils/archive'
import { normalizePath, stripCommonRoot, ancestors, baseName } from '../utils/paths'

const MAX_FILE_BYTES = 2 * 1024 * 1024

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportCurrentFile() {
  const { language, files, activeFile } = useEditorStore.getState()
  const file = (files[language] || []).find(f => f.name === activeFile[language])
  if (!file) return toast.error('No active file to export.')
  download(new Blob([file.content], { type: 'text/plain;charset=utf-8' }), baseName(file.name))
  toast.success(`Exported ${baseName(file.name)}`)
}

export function exportProjectZip() {
  const { language, files, folders } = useEditorStore.getState()
  const projectFiles = files[language] || []
  const fileNames = new Set(projectFiles.map(f => f.name))
  // Folder entries keep empty folders alive in the archive.
  const dirs = new Set()
  projectFiles.forEach(f => ancestors(f.name).forEach(d => dirs.add(d)))
  ;(folders[language] || []).forEach(d => { dirs.add(d); ancestors(`${d}/x`).forEach(a => dirs.add(a)) })
  const entries = [
    ...[...dirs].filter(d => !fileNames.has(d)).sort().map(d => ({ name: `${d}/`, content: '' })),
    ...projectFiles.map(f => ({ name: f.name, content: f.content })),
  ]
  download(new Blob([filesToZipBytes(entries)], { type: 'application/zip' }), `${language}-project.zip`)
  toast.success(`Exported ${projectFiles.length} file${projectFiles.length === 1 ? '' : 's'} as ZIP`)
}

// Accepts a FileList / File[] from file pickers (plain files, folders via
// webkitdirectory, or .zip archives) and merges them into the current project.
export async function importFiles(fileList) {
  const picked = Array.from(fileList || [])
  if (!picked.length) return
  const entries = []
  const skipped = []
  try {
    for (const file of picked) {
      const relative = file.webkitRelativePath || file.name
      if (/\.zip$/i.test(file.name) && !file.webkitRelativePath) {
        const result = await readZip(await file.arrayBuffer())
        entries.push(...stripCommonRoot(result.entries))
        skipped.push(...result.skipped)
        continue
      }
      if (file.size > MAX_FILE_BYTES) { skipped.push(relative); continue }
      try {
        entries.push({ name: relative, content: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) })
      } catch {
        skipped.push(relative)
      }
    }
  } catch (error) {
    return toast.error(error.message || 'Import failed.')
  }

  const hasFolderPicks = picked.some(f => f.webkitRelativePath)
  const prepared = (hasFolderPicks ? stripCommonRoot(entries.filter(e => e.name.includes('/'))).concat(entries.filter(e => !e.name.includes('/'))) : entries)
    .map(e => ({ ...e, name: normalizePath(e.name) }))
    .filter(e => e.name)
  if (!prepared.length) return toast.error(skipped.length ? 'No importable text files (binary or oversized files are skipped).' : 'Nothing to import.')

  const { added, replaced } = useEditorStore.getState().importEntries(prepared)
  const label = LANGUAGES[useEditorStore.getState().language]?.label
  toast.success(`Imported ${added + replaced} file${added + replaced === 1 ? '' : 's'} into ${label}${replaced ? ` (${replaced} overwritten)` : ''}`)
  if (skipped.length) toast(`Skipped ${skipped.length} binary/oversized file${skipped.length === 1 ? '' : 's'}`, { icon: 'ℹ️' })
}
