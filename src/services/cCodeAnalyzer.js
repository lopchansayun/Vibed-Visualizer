const INCLUDE_RULES = [
  { header: 'stdio.h', functions: /\b(?:printf|fprintf|sprintf|snprintf|scanf|sscanf|fscanf|puts|putchar|getchar|fgets|fputs)\s*\(/ },
  { header: 'stdlib.h', functions: /\b(?:malloc|calloc|realloc|free|atoi|atof|atol|strtol|strtoul|exit|abort|qsort|bsearch)\s*\(/ },
  { header: 'string.h', functions: /\b(?:strlen|strcpy|strncpy|strcat|strncat|strcmp|strncmp|strchr|strstr|memcpy|memmove|memset|memcmp)\s*\(/ },
  { header: 'math.h', functions: /\b(?:sqrt|pow|sin|cos|tan|log|log10|exp|floor|ceil|fabs|fmod)\s*\(/ },
]

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function hasInclude(source, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^\\s*#\\s*include\\s*[<\"]' + escaped + '>', 'm').test(source)
}

function addMissingIncludes(source, issues, fixes) {
  let next = source
  const needed = INCLUDE_RULES.filter(rule => rule.functions.test(source) && !hasInclude(source, rule.header))
  if (!needed.length) return next

  const includeText = needed.map(rule => `#include <${rule.header}>`).join('\n')
  const match = next.match(/^(?:\s*#\s*include[^\n]*\n)+/m)
  if (match) {
    const index = match[0].length
    next = `${next.slice(0, index)}${includeText}\n${next.slice(index)}`
  } else {
    next = `${includeText}\n\n${next}`
  }

  for (const rule of needed) {
    issues.push({ severity: 'fix', line: 1, message: `Missing <${rule.header}> include for standard-library functions.` })
    fixes.push(`Added #include <${rule.header}>`)
  }
  return next
}

function checkBalanced(source, issues) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = []
  const lines = source.split('\n')
  let inBlockComment = false
  lines.forEach((line, lineIndex) => {
    let inString = false
    let quote = ''
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      const next = line[i + 1]
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; i += 1 }
        continue
      }
      if (!inString && ch === '/' && next === '*') { inBlockComment = true; i += 1; continue }
      if (!inString && ch === '/' && next === '/') break
      if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
        if (!inString) { inString = true; quote = ch } else if (quote === ch) inString = false
        continue
      }
      if (inString) continue
      if (pairs[ch]) stack.push({ ch, line: lineIndex + 1 })
      else if (Object.values(pairs).includes(ch)) {
        const open = stack.pop()
        if (!open || pairs[open.ch] !== ch) {
          issues.push({ severity: 'error', line: lineIndex + 1, message: `Unmatched '${ch}'.` })
        }
      }
    }
  })
  for (const open of stack) issues.push({ severity: 'error', line: open.line, message: `Unclosed '${open.ch}'.` })
}

function fixVoidMain(source, issues, fixes) {
  if (!/\bvoid\s+main\s*\(/.test(source)) return source
  issues.push({ severity: 'fix', line: lineNumberAt(source, source.search(/\bvoid\s+main\s*\(/)), message: 'main should return int in standard C.' })
  fixes.push('Changed void main() to int main().')
  return source.replace(/\bvoid\s+main\s*\(/, 'int main(')
}

function fixScalarScanf(source, issues, fixes) {
  const declarations = new Set()
  const declarationPattern = /\b(?:char|short|int|long|float|double|unsigned|signed)\s+(?:[a-zA-Z_]\w*\s*(?:,\s*[a-zA-Z_]\w*\s*)*);/g
  for (const match of source.matchAll(declarationPattern)) {
    const declaration = match[0].replace(/;$/, '')
    declaration.replace(/\b(?:char|short|int|long|float|double|unsigned|signed)\b/g, '').split(',').forEach(part => {
      const name = part.trim().replace(/^\*+/, '').split('=')[0].trim()
      if (/^[A-Za-z_]\w*$/.test(name)) declarations.add(name)
    })
  }
  let changed = false
  const next = source.replace(/\bscanf\s*\(\s*(['"][^'"]*['"])\s*,\s*([A-Za-z_]\w*)\s*\)/g, (full, format, name) => {
    if (!declarations.has(name) || full.includes(`&${name}`)) return full
    const line = lineNumberAt(source, source.indexOf(full))
    issues.push({ severity: 'fix', line, message: `scanf() should pass the address of scalar variable '${name}'.` })
    fixes.push(`Changed scanf(..., ${name}) to scanf(..., &${name}).`)
    changed = true
    return `scanf(${format}, &${name})`
  })
  return changed ? next : source
}


function fixMissingSemicolons(source, issues, fixes) {
  const lines = source.split('\n')
  let changed = false
  const next = lines.map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.endsWith(';') || trimmed.endsWith('{') || trimmed.endsWith('}') || trimmed.endsWith(':')) return line
    const simpleStatement = /^(?:return\b|break\b|continue\b|(?:printf|fprintf|sprintf|snprintf|scanf|sscanf|puts|putchar|getchar)\s*\()/
    const declaration = /^(?:char|short|int|long|float|double|unsigned|signed|bool)\b/.test(trimmed) && !/\b(?:if|for|while)\s*\(/.test(trimmed)
    if (!simpleStatement.test(trimmed) && !declaration) return line
    if (/^(?:int|char|short|long|float|double|unsigned|signed|bool)\s+[A-Za-z_]\w*\s*\([^)]*\)$/.test(trimmed)) return line
    changed = true
    issues.push({ severity: 'fix', line: index + 1, message: 'Missing semicolon detected.' })
    fixes.push(`Added missing semicolon on line ${index + 1}.`)
    return `${line};`
  }).join('\n')
  return changed ? next : source
}

function addMainReturn(source, issues, fixes) {
  const mainMatch = source.match(/\bint\s+main\s*\([^)]*\)\s*\{([\s\S]*)\}/)
  if (!mainMatch) return source
  const body = mainMatch[1]
  if (/\breturn\s+[^;]+;/.test(body)) return source
  const closeIndex = source.lastIndexOf('}')
  if (closeIndex < 0) return source
  const before = source.slice(0, closeIndex)
  const bodyLines = body.split('\n').map(line => line.match(/^[ \t]*(?=\S)/)?.[0]).filter(Boolean)
  const indent = bodyLines.sort((a, b) => a.length - b.length)[0] || '    '
  issues.push({ severity: 'fix', line: lineNumberAt(source, closeIndex), message: 'main() has no return statement; adding return 0.' })
  fixes.push('Added return 0; to main().')
  return `${before}${indent}return 0;\n}`
}

function detectCommonProblems(source, issues) {
  const lines = source.split('\n')
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed === '{' || trimmed === '}' || trimmed.endsWith('{') || trimmed.endsWith('}')) return
    if (/^\s*(if|for|while|switch|else|do)\b/.test(trimmed)) return
    if (/^(?:int|char|short|long|float|double|unsigned|signed)\b/.test(trimmed) && !trimmed.endsWith(';')) {
      issues.push({ severity: 'warning', line: index + 1, message: 'This declaration may be missing a semicolon.' })
    }
    if (/^(?:return|break|continue|goto)\b/.test(trimmed) && !trimmed.endsWith(';')) {
      issues.push({ severity: 'warning', line: index + 1, message: 'This statement may be missing a semicolon.' })
    }
    if (/\b(?:printf|scanf|puts|putchar|getchar)\s*\(/.test(trimmed) && !trimmed.endsWith(';') && !trimmed.endsWith('{')) {
      issues.push({ severity: 'warning', line: index + 1, message: 'This function call may be missing a semicolon.' })
    }
    if (/\bif\s*\([^)]*=[^=][^)]*\)/.test(trimmed)) {
      issues.push({ severity: 'warning', line: index + 1, message: 'Assignment inside if condition detected; use == if comparison was intended.' })
    }
  })
  if (!/\bint\s+main\s*\(/.test(source) && /\bmain\s*\(/.test(source)) {
    issues.push({ severity: 'warning', line: 1, message: 'main() is not declared with the standard int main(...) signature.' })
  }
}

export function analyzeAndFixC(source = '') {
  let code = String(source)
  const issues = []
  const fixes = []

  if (!code.trim()) return { code, issues: [{ severity: 'error', line: 1, message: 'The C source is empty.' }], fixes: [], changed: false }

  checkBalanced(code, issues)
  code = fixVoidMain(code, issues, fixes)
  code = addMissingIncludes(code, issues, fixes)
  code = fixMissingSemicolons(code, issues, fixes)
  code = fixScalarScanf(code, issues, fixes)
  code = addMainReturn(code, issues, fixes)
  detectCommonProblems(code, issues)

  return { code, issues, fixes, changed: code !== source }
}

export function formatAnalyzerReport(result) {
  if (!result.issues.length) return 'C analysis: no obvious issues found.'
  const lines = [`C analysis: ${result.issues.length} issue(s) found.`]
  result.issues.forEach((issue) => {
    lines.push(`Line ${issue.line}: ${issue.message}`)
  })
  if (result.fixes.length) {
    lines.push('', `Applied ${result.fixes.length} safe fix(es):`)
    result.fixes.forEach(fix => lines.push(`✓ ${fix}`))
  }
  return lines.join('\n')
}
