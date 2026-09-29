function formatBraceLanguage(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  let indent = 0
  let inBlockComment = false
  const output = []

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      if (output.at(-1) !== '') output.push('')
      continue
    }

    let line = trimmed
    const leadingClosings = (line.match(/^\}+/)?.[0]?.length || 0)
    const lineIndent = Math.max(0, indent - leadingClosings)

    const commentOnly = line.startsWith('//') || line.startsWith('/*') || inBlockComment
    if (commentOnly) {
      output.push(`${'    '.repeat(lineIndent)}${line}`)
      if (line.includes('*/')) inBlockComment = false
      else if (line.startsWith('/*')) inBlockComment = true
      continue
    }

    line = line.replace(/\s+;/g, ';').replace(/;\s+/g, '; ')
    line = line.replace(/\s*\{\s*$/, ' {')
    line = line.replace(/\s*\}\s*else\s*(if\s*\([^)]*\))?\s*\{?/, (_, nextIf) => `} else${nextIf ? ` ${nextIf}` : ''} {`)
    output.push(`${'    '.repeat(lineIndent)}${line}`)

    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    indent = Math.max(0, indent + opens - closes)
  }

  while (output.at(-1) === '') output.pop()
  return `${output.join('\n')}\n`
}

export function formatSource(source, language) {
  if (!source?.trim()) return source || ''
  if (['c', 'cpp', 'csharp', 'java', 'javascript', 'typescript', 'rust', 'go', 'php', 'd'].includes(language)) {
    return formatBraceLanguage(source)
  }
  return source
}
