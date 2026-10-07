// Minimal ZIP writer (store/no compression) for Judge0 additional_files.
function crc32(bytes) {
  let crc = 0xffffffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(n) { return [n & 255, (n >>> 8) & 255] }
function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255] }

export function filesToZipBytes(files) {
  const encoder = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content ?? '')
    const crc = crc32(data)
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...name, ...data,
    ])
    chunks.push(local)
    central.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]))
    offset += local.length
  }

  const centralSize = central.reduce((n, x) => n + x.length, 0)
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ])
  const all = new Uint8Array(offset + centralSize + end.length)
  let p = 0
  for (const chunk of chunks) { all.set(chunk, p); p += chunk.length }
  for (const chunk of central) { all.set(chunk, p); p += chunk.length }
  all.set(end, p)

  return all
}

function bytesToBase64(all) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < all.length; i += chunkSize) binary += String.fromCharCode(...all.subarray(i, i + chunkSize))
  return btoa(binary)
}

export function filesToZipBase64(files) {
  return bytesToBase64(filesToZipBytes(files))
}


const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const IGNORED = /(^|\/)(__MACOSX|node_modules|\.git)(\/|$)|(^|\/)\.DS_Store$/

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Reads a ZIP archive and returns { entries: [{name, content}], skipped: [name] }.
// Binary, oversized or unsupported entries are skipped rather than failing the import.
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file.')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const entries = []
  const skipped = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP directory.')
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const local = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/') || IGNORED.test(name)) continue
    if (size > MAX_ENTRY_BYTES || (method !== 0 && method !== 8)) { skipped.push(name); continue }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    try {
      const raw = bytes.subarray(start, start + compSize)
      const data = method === 0 ? raw : await inflateRaw(raw)
      if (data.includes(0)) { skipped.push(name); continue }
      entries.push({ name, content: decoder.decode(data) })
    } catch {
      skipped.push(name)
    }
  }
  return { entries, skipped }
}
