// Path + tree helpers for the virtual project file system.
// Files are stored flat as { name: 'dir/sub/file.c', content } and folders are
// derived from the file paths plus an explicit list of (possibly empty) folders.

export function normalizePath(input) {
  const parts = String(input || '').replace(/\\/g, '/').split('/').map(p => p.trim()).filter(p => p && p !== '.')
  if (!parts.length || parts.some(p => p === '..' || /[<>:"|?*\u0000-\u001f]/.test(p))) return ''
  return parts.join('/')
}

export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)
export const dirName = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name)

export function ancestors(path) {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

// If every path lives under one shared top-level folder, drop it.
export function stripCommonRoot(entries) {
  if (!entries.length || !entries.every(e => e.name.includes('/'))) return entries
  const root = entries[0].name.split('/')[0]
  if (!entries.every(e => e.name.startsWith(`${root}/`))) return entries
  return entries.map(e => ({ ...e, name: e.name.slice(root.length + 1) }))
}

export function buildTree(files, folders = []) {
  const root = { type: 'folder', name: '', path: '', children: [] }
  const index = new Map([['', root]])
  const ensureFolder = (path) => {
    if (index.has(path)) return index.get(path)
    const parent = ensureFolder(dirName(path))
    const node = { type: 'folder', name: baseName(path), path, children: [] }
    parent.children.push(node)
    index.set(path, node)
    return node
  }
  folders.forEach(ensureFolder)
  files.forEach((file) => {
    ensureFolder(dirName(file.name)).children.push({ type: 'file', name: baseName(file.name), path: file.name })
  })
  const sort = (node) => {
    node.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'folder' ? -1 : 1))
    node.children.forEach(c => c.type === 'folder' && sort(c))
  }
  sort(root)
  return root
}
