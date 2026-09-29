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

export function filesToZipBase64(files) {
  const encoder = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content ?? '')
    const crc = crc32(data)
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...name, ...data,
    ])
    chunks.push(local)
    central.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0),
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

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < all.length; i += chunkSize) binary += String.fromCharCode(...all.subarray(i, i + chunkSize))
  return btoa(binary)
}
