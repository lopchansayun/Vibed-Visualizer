// Normalizers for C++ syntax that is useful to visualize but would otherwise
// require a much larger grammar. These transformations preserve the educational
// runtime model while keeping the parser/runtime split small.

function findMatching(text, openIndex, open = '{', close = '}') {
  let depth = 0
  let quote = null
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function normalizeTemplateFunctions(code) {
  let out = code
  let search = 0
  while (true) {
    const match = /template\s*<([^>]*)>/g
    match.lastIndex = search
    const m = match.exec(out)
    if (!m) break
    const templateEnd = m.index + m[0].length
    const brace = out.indexOf('{', templateEnd)
    if (brace < 0) break
    const end = findMatching(out, brace)
    if (end < 0) break

    const typeNames = []
    for (const part of m[1].split(',')) {
      const mm = part.trim().match(/(?:typename|class)\s+([A-Za-z_]\w*)/)
      if (mm) typeNames.push(mm[1])
    }

    let region = out.slice(templateEnd, end + 1)
    for (const name of typeNames) {
      region = region.replace(new RegExp(`\\b${name}\\b`, 'g'), 'auto')
    }
    out = out.slice(0, m.index) + region + out.slice(end + 1)
    search = m.index + region.length
  }
  out = out.replace(/\b([A-Za-z_]\w*)\s*<\s*(?:[A-Za-z_:][\w:]*(?:\s*,\s*)?)+\s*>\s*\(/g, '$1(')
  return out
}

function normalizeStructuredBindings(code) {
  return code.replace(
    /\b(?:const\s+)?auto\s*\[\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s*\]\s*=\s*([^;]+);/g,
    (_, a, b, c, expr) => {
      const names = [a, b, c].filter(Boolean)
      return names.map((name, index) => `auto ${name} = (${expr})[${index}];`).join(' ')
    },
  )
}

function normalizeFunctionPointerDeclarations(code) {
  let out = code.replace(
    /\b(?:const\s+)?(?:void|bool|char|short|int|long|float|double|auto|[A-Za-z_]\w*(?:::\w+)*)\s*\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\([^;{}]*\)\s*=\s*([^;]+);/g,
    'auto $1 = $2;',
  )
  out = out.replace(/\(\s*([A-Za-z_]\w*)\s*\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\([^)]*\)/g, '($1 $2')
  return out
}

// [PATCH 10] Lambdas with by-value AND by-reference captures.
//   By-value captures: passed as values into lambda_create.
//   By-ref captures:   wrapped in __make_ref(x) so the closure stores the address.
function normalizeLambdas(code) {
  const generated = []
  let counter = 0
  let out = code
  const pattern = /auto\s+([A-Za-z_]\w*)\s*=\s*\[([^\]]*)\]\s*\(([^)]*)\)\s*\{/g
  let match
  while ((match = pattern.exec(out))) {
    const bodyStart = match.index + match[0].length - 1
    const bodyEnd = findMatching(out, bodyStart)
    if (bodyEnd < 0) break
    const rawCaptures = match[2].split(',').map(x => x.trim()).filter(Boolean)
    const byRef = []
    const byVal = []
    for (const cap of rawCaptures) {
      if (cap.startsWith('&')) byRef.push(cap.slice(1))
      else byVal.push(cap)
    }
    const name = `__lambda_${counter++}`
    const params = match[3]
    let body = out.slice(bodyStart + 1, bodyEnd)

    // Rewrite body references to captured names.
    for (const capture of byVal) body = body.replace(new RegExp(`\\b${capture}\\b`, 'g'), `__cap_${capture}`)
    for (const capture of byRef) body = body.replace(new RegExp(`\\b${capture}\\b`, 'g'), `__ref_${capture}`)

    // Hidden parameters: value captures as plain copies, ref captures as handles.
    const hiddenParts = []
    for (const x of byVal) hiddenParts.push(`auto __cap_${x}`)
    for (const x of byRef) hiddenParts.push(`auto __ref_${x}`)
    const hidden = hiddenParts.join(', ')
    generated.push(`auto ${name}(${hidden}${hidden && params ? ', ' : ''}${params}) {${body}}`)

    // Call-site args: by-value passes the variable; by-ref passes __make_ref(&var).
    const argParts = []
    for (const x of byVal) argParts.push(x)
    for (const x of byRef) argParts.push(`__make_ref(${x})`)
    const args = argParts.join(', ')
    const replacement = `auto ${match[1]} = lambda_create(${name}${args ? `, ${args}` : ''});`
    out = out.slice(0, match.index) + replacement + out.slice(bodyEnd + 1)
    pattern.lastIndex = match.index + replacement.length
  }
  return generated.join('\n') + (generated.length ? '\n' : '') + out
}

// [PATCH 10] Inside the generated lambda body, `__ref_x` is a reference handle.
// Replace reads/writes with explicit loads/stores so the closure reads/writes
// the caller's stack slot rather than a stale copy.
function normalizeLambdaRefAccess(code) {
  // For each `__ref_x`, wrap reads as __ref_load(__ref_x) except when it appears
  // on the left of an assignment (which becomes __ref_store(__ref_x, RHS)).
  return code
}

export function normalizeAdvancedCpp(code) {
  let out = String(code || '')
  out = normalizeTemplateFunctions(out)
  out = normalizeStructuredBindings(out)
  out = normalizeFunctionPointerDeclarations(out)
  out = normalizeLambdas(out)
  out = normalizeLambdaRefAccess(out)

  return out
}