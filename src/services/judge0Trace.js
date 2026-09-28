// Lightweight source instrumentation for Judge0-backed visualization.
// Judge0 does not expose a debugger trace, so supported scalar declarations
// and assignments emit private trace records into stdout. Those records are
// removed before the user's stdout reaches the console.

const PREFIX = '__CVZ_TRACE__'

function jsonString(value) {
  return JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function cEvent(line, name, type, expr) {
  const label = JSON.stringify(name)
  if (type === 'ptr') return `printf("${PREFIX}\\t%d\\t%s\\tptr\\t%p\\n", ${line}, ${label}, (void*)(${expr}));`
  if (type === 'float') return `printf("${PREFIX}\\t%d\\t%s\\tfloat\\t%.12g\\n", ${line}, ${label}, (double)(${expr}));`
  if (type === 'char') return `printf("${PREFIX}\\t%d\\t%s\\tint\\t%d\\n", ${line}, ${label}, (int)(${expr}));`
  if (type === 'bool') return `printf("${PREFIX}\\t%d\\t%s\\tint\\t%d\\n", ${line}, ${label}, (int)(!!(${expr})));`
  return `printf("${PREFIX}\\t%d\\t%s\\tint\\t%lld\\n", ${line}, ${label}, (long long)(${expr}));`
}

function cppEvent(line, name, type, expr) {
  const label = JSON.stringify(name)
  if (type === 'ptr') return `std::printf("${PREFIX}\\t%d\\t%s\\tptr\\t%p\\n", ${line}, ${label}, (void*)(${expr}));`
  if (type === 'string') return `std::printf("${PREFIX}\\t%d\\t%s\\tstring\\t%s\\n", ${line}, ${label}, (${expr}).c_str());`
  if (type === 'float') return `std::printf("${PREFIX}\\t%d\\t%s\\tfloat\\t%.12g\\n", ${line}, ${label}, (double)(${expr}));`
  if (type === 'char') return `std::printf("${PREFIX}\\t%d\\t%s\\tint\\t%d\\n", ${line}, ${label}, (int)(${expr}));`
  if (type === 'bool') return `std::printf("${PREFIX}\\t%d\\t%s\\tint\\t%d\\n", ${line}, ${label}, (int)(!!(${expr})));`
  return `std::printf("${PREFIX}\\t%d\\t%s\\tint\\t%lld\\n", ${line}, ${label}, (long long)(${expr}));`
}

function csharpEvent(line, name, type, expr) {
  const label = JSON.stringify(name)
  return `Console.WriteLine(${JSON.stringify(`${PREFIX}\t${line}\t${name}\t${type}\t`)} + (${expr})?.ToString());`
}

function instrumentCFamily(code, language) {
  const lines = code.split(/\r?\n/)
  const out = []
  let inBlockComment = false
  const isCpp = language === 'cpp'
  const isC = language === 'c'
  const event = isCpp ? cppEvent : cEvent

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]
    const lineNo = i + 1
    const trimmed = original.trim()
    out.push(original)

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      continue
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true
      continue
    }
    if (trimmed.includes('for (') || trimmed.startsWith('for(') || trimmed.startsWith('if ') || trimmed.startsWith('if(') || trimmed.startsWith('while ') || trimmed.startsWith('while(') || trimmed.startsWith('switch ') || trimmed.startsWith('switch(') || trimmed.endsWith('{') || trimmed === '}' || trimmed.startsWith('else')) continue
    if (!trimmed.endsWith(';')) continue

    // Avoid instrumenting print calls themselves and declarations of functions.
    if (/^(printf|fprintf|sprintf|puts|putchar|std::printf|std::cout|cout|cerr)\s*\(/.test(trimmed)) continue

    let m
    // Declaration with optional pointer and initializer.
    m = trimmed.match(/^(?:const\s+)?(?:unsigned\s+|signed\s+)?(int|long(?:\s+long)?|short|float|double|char|bool)(\s*\*+)?\s*(\w+)\s*=\s*(.+);$/)
    if (m) {
      const base = m[1].replace(/\s+/g, ' ')
      const ptr = Boolean(m[2])
      const name = m[3]
      const expr = m[4]
      const type = ptr ? 'ptr' : (base === 'float' || base === 'double' ? 'float' : base === 'char' ? 'char' : base === 'bool' ? 'bool' : 'int')
      out.push(event(lineNo, name, type, name))
      continue
    }

    if (isCpp) {
      m = trimmed.match(/^(?:const\s+)?(?:std::)?string\s+(\w+)\s*=\s*(.+);$/)
      if (m) { out.push(cppEvent(lineNo, m[1], 'string', m[1])); continue }
    }

    // Plain assignment / compound assignment / increment.
    m = trimmed.match(/^(\w+)\s*(=|\+=|-=|\*=|\/=)\s*(.+);$/)
    if (m) {
      const name = m[1]
      if (/^(?:return|sizeof)$/.test(name)) continue
      out.push(event(lineNo, name, 'int', name))
      continue
    }
    m = trimmed.match(/^(\w+)\s*(\+\+|--)\s*;$/)
    if (m) { out.push(event(lineNo, m[1], 'int', m[1])); continue }
  }

  let prefix = ''
  if (isCpp) prefix = '#include <cstdio>\n#include <string>\n'
  else if (isC) prefix = '#include <stdio.h>\n'
  return { code: prefix + out.join('\n'), enabled: true }
}

function instrumentCSharp(code) {
  const lines = code.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]
    const trimmed = original.trim()
    out.push(original)
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('using ') || trimmed.startsWith('namespace ') || trimmed.endsWith('{') || trimmed === '}' || trimmed.startsWith('if ') || trimmed.startsWith('if(') || trimmed.startsWith('for ') || trimmed.startsWith('for(') || trimmed.startsWith('while ') || trimmed.startsWith('while(')) continue
    if (!trimmed.endsWith(';') || trimmed.startsWith('Console.')) continue
    let m = trimmed.match(/^(?:const\s+)?(int|long|short|float|double|char|bool|string)\s+(\w+)\s*=\s*(.+);$/)
    if (m) {
      out.push(csharpEvent(i + 1, m[2], m[1], m[2]))
      continue
    }
    m = trimmed.match(/^(\w+)\s*(=|\+=|-=|\*=|\/=|\+\+|--)\s*(.*);$/)
    if (m) out.push(csharpEvent(i + 1, m[1], 'value', m[1]))
  }
  return { code: out.join('\n'), enabled: true }
}

export function instrumentForTrace(code, language) {
  if (language === 'c' || language === 'cpp') return instrumentCFamily(code, language)
  if (language === 'csharp') return instrumentCSharp(code)
  return { code, enabled: false }
}

function parseEvent(line) {
  if (!line.startsWith(PREFIX + '\t')) return null
  const parts = line.split('\t')
  if (parts.length < 5) return null
  const lineNo = Number(parts[1]) || 1
  return { line: lineNo, name: parts[2], type: parts[3], value: parts.slice(4).join('\t') }
}

function formatValue(event) {
  if (event.type === 'ptr') return event.value === '(nil)' ? '0x0' : event.value
  if (event.type === 'float') return String(Number(event.value))
  return event.value
}

export function parseTraceOutput(stdout) {
  const state = new Map()
  const addresses = new Map()
  let nextStack = 0x7ffe6a3b2c80
  const heap = new Map()
  const steps = []
  let clean = ''

  for (const line of String(stdout || '').split(/\r?\n/)) {
    const event = parseEvent(line)
    if (!event) {
      clean += (clean ? '\n' : '') + line
      continue
    }

    if (!addresses.has(event.name)) {
      addresses.set(event.name, nextStack)
      nextStack -= 8
    }
    state.set(event.name, { value: formatValue(event), isPointer: event.type === 'ptr' })
    if (event.type === 'ptr' && event.value && event.value !== '(nil)' && /malloc|new|calloc/i.test(event.value)) {
      // Kept for compatibility; allocation ownership is inferred below when possible.
    }

    // A pointer value that does not match another stack variable is treated as
    // a heap target. This gives the existing visualizer a useful memory block
    // without pretending Judge0 provides a debugger-level heap trace.
    if (event.type === 'ptr' && /^0x[0-9a-f]+$/i.test(event.value) && event.value !== '0x0') {
      const target = [...addresses.entries()].find(([, addr]) => `0x${addr.toString(16)}` === event.value)
      if (!target && !heap.has(event.value)) heap.set(event.value, { address: event.value, value: 0, freed: false, size: 1 })
    }

    steps.push({
      line: event.line,
      note: `${event.name} → ${formatValue(event)}`,
      stack: [...state.entries()].map(([name, item]) => ({ name, value: item.value, address: addresses.get(name), isPointer: item.isPointer })),
      heap: [...heap.values()],
      callStack: ['main()'],
      stdoutSoFar: clean,
    })
  }

  return { stdout: clean, trace: steps.length ? { steps } : null }
}
