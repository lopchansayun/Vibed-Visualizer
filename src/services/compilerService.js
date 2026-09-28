import { runInterpreter, InterpError } from './interpreter'
import { filesToZipBase64 } from './archive'

const JUDGE0_API_URL = (import.meta.env.VITE_JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/+$/, '')
const JUDGE0_API_KEY = import.meta.env.VITE_JUDGE0_API_KEY || ''

const JUDGE0_LANGUAGE_IDS = { c: 50, cpp: 54, csharp: 51 }

const MAX_MOCK_LINES = 250
const MAX_MOCK_CHARS = 30000
const JUDGE0_POLL_INTERVAL = 250
const JUDGE0_MAX_POLLS = 60

function fileNameFor(language) {
  return { c: 'main.c', cpp: 'main.cpp', csharp: 'Program.cs' }[language] || 'main'
}

function checkBraceBalance(code) {
  let depth = 0
  for (const ch of code) {
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

function canAttemptMock(code, stdin = '') {
  const trimmed = code.trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_MOCK_CHARS) return false
  if (trimmed.split(/\r?\n/).length > MAX_MOCK_LINES) return false
  return true
}

function mockResultFromInterpreter({ language, code, stdin = '', start }) {
  if (!checkBraceBalance(code)) {
    return {
      success: false, stdout: '', stderr: `${fileNameFor(language)}: error: unbalanced braces — a '{' is missing its '}' (or vice versa).`,
      exitCode: 1, executionTime: Math.round(performance.now() - start), memory: 0, engine: 'mock',
    }
  }
  try {
    const { stdout } = runInterpreter(code, language, stdin)
    return {
      success: true, stdout, stderr: '', exitCode: 0,
      executionTime: Math.round(performance.now() - start),
      memory: 900 + Math.round(Math.random() * 4000), engine: 'mock',
    }
  } catch (err) {
    if (err instanceof InterpError) {
      return {
        success: false, stdout: '',
        stderr: `${fileNameFor(language)}:${err.line ?? '?'}: error: ${err.message}`,
        exitCode: 1, executionTime: Math.round(performance.now() - start),
        memory: 0, engine: 'mock', mockError: true,
        mockUnsupported: Boolean(err.mockUnsupported),
      }
    }
    return {
      success: false, stdout: '', stderr: `internal error: ${err.message}`,
      exitCode: 1, executionTime: Math.round(performance.now() - start),
      memory: 0, engine: 'mock', mockError: true, mockUnsupported: false,
    }
  }
}


function utf8ToBase64(value = '') {
  const bytes = new TextEncoder().encode(String(value))
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToUtf8(value = '') {
  if (!value) return ''
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    // Keep the UI usable if a Judge0 deployment returns a non-base64 field.
    return String(value)
  }
}

function judge0Headers() {
  const headers = { 'Content-Type': 'application/json' }
  if (JUDGE0_API_KEY) headers['X-Auth-Token'] = JUDGE0_API_KEY
  return headers
}

async function judge0Request(path, options = {}) {
  const response = await fetch(`${JUDGE0_API_URL}${path}`, {
    ...options,
    headers: { ...judge0Headers(), ...(options.headers || {}) },
  })
  let data = null
  try { data = await response.json() } catch {}
  if (!response.ok) {
    const message = data?.error || data?.message || `Judge0 request failed with HTTP ${response.status}`
    const error = new Error(message); error.status = response.status; throw error
  }
  return data
}

function normalizeJudge0Result(data, start) {
  const statusId = data?.status?.id
  const statusDescription = data?.status?.description || ''
  const compileOutput = base64ToUtf8(data?.compile_output || '')
  const stderr = base64ToUtf8(data?.stderr || '')
  const message = base64ToUtf8(data?.message || '')
  const exitCode = data?.exit_code
  // Judge0 reports any non-zero process return as NZEC (status 11).
  // In C/C++, returning a non-zero value from main is valid program behavior,
  // so NZEC must not automatically be treated as a compiler/runtime failure.
  // Keep other runtime statuses (segfault, abort, timeout, etc.) as errors.
  const isAccepted = statusId === 3
  const isNormalNonZeroExit = statusId === 11 && Number.isInteger(Number(exitCode))
  const success = isAccepted || isNormalNonZeroExit
  const failureText = compileOutput || stderr || message || statusDescription || 'Program failed.'
  return {
    success, stdout: base64ToUtf8(data?.stdout || ''),
    stderr: success ? '' : failureText,
    exitCode: exitCode ?? (success ? 0 : 1),
    executionTime: data?.time != null ? Math.round(Number(data.time) * 1000) : Math.round(performance.now() - start),
    memory: data?.memory ?? 0, engine: 'judge0',
    judge0Status: statusDescription, judge0Token: data?.token || null,
  }
}

function buildMultiFileScripts(language) {
  if (language === 'c') {
    return {
      compile: `#!/bin/bash
set -e
sources=()
for f in ./*.c; do
  [ -f "$f" ] && sources+=("$f")
done
if [ "\${#sources[@]}" -eq 0 ]; then
  echo "No C source files found." >&2
  exit 1
fi
gcc -std=c17 -O0 -g "\${sources[@]}" -o program
`,
      run: `#!/bin/bash
exec ./program
`,
    }
  }
  if (language === 'cpp') {
    return {
      compile: `#!/bin/bash
set -e
sources=()
for f in ./*.cpp ./*.cc ./*.cxx; do
  [ -f "$f" ] && sources+=("$f")
done
if [ "\${#sources[@]}" -eq 0 ]; then
  echo "No C++ source files found." >&2
  exit 1
fi
g++ -std=c++17 -O0 -g "\${sources[@]}" -o program
`,
      run: `#!/bin/bash
exec ./program
`,
    }
  }
  return null
}

async function runWithJudge0({ language, code, files = [], stdin, start }) {
  const languageId = JUDGE0_LANGUAGE_IDS[language]
  if (!languageId) throw new Error(`Judge0 does not have a configured language ID for "${language}".`)
  const sourceName = files.find((f) => f.content === code)?.name || fileNameFor(language)
  const projectFiles = files.length ? files : [{ name: sourceName, content: code }]

  // Judge0's normal C/C++ language IDs compile exactly one source file.
  // additional_files can provide headers/data, but it does not turn sibling
  // .c/.cpp files into translation units. For real multi-file builds use
  // Judge0's Multi-file program language (ID 89), which executes our compile
  // and run scripts from the submitted ZIP.
  const multiFile = language === 'c' || language === 'cpp'
  if (multiFile && projectFiles.some((f) => f.name !== sourceName && /\.(c|cc|cpp|cxx)$/i.test(f.name))) {
    const scripts = buildMultiFileScripts(language)
    const additionalFiles = filesToZipBase64([
      ...projectFiles.map((f) => ({ name: f.name, content: f.content })),
      { name: 'compile', content: scripts.compile },
      { name: 'run', content: scripts.run },
    ])

    const submission = await judge0Request('/submissions/?base64_encoded=true&wait=false', {
      method: 'POST',
      body: JSON.stringify({
        language_id: 89,
        stdin: utf8ToBase64(stdin || ''),
        additional_files: additionalFiles,
      }),
    })
    if (!submission?.token) throw new Error('Judge0 did not return a submission token.')
    for (let attempt = 0; attempt < JUDGE0_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLL_INTERVAL))
      const result = await judge0Request(`/submissions/${encodeURIComponent(submission.token)}?base64_encoded=true`)
      const statusId = result?.status?.id
      if (statusId !== 1 && statusId !== 2) return normalizeJudge0Result(result, start)
    }
    return {
      success: false, stdout: '', stderr: 'Judge0 timed out while waiting for the submission result.',
      exitCode: 124, executionTime: Math.round(performance.now() - start), memory: 0, engine: 'judge0',
    }
  }

  const additionalFiles = filesToZipBase64(
    projectFiles
      .filter((f) => f.name !== sourceName)
      .map((f) => ({ name: f.name, content: f.content }))
  )

  const submission = await judge0Request('/submissions/?base64_encoded=true&wait=false', {
    method: 'POST',
    body: JSON.stringify({
      source_code: utf8ToBase64(code),
      language_id: languageId,
      stdin: utf8ToBase64(stdin || ''),
      ...(additionalFiles ? { additional_files: additionalFiles } : {}),
    }),
  })
  if (!submission?.token) throw new Error('Judge0 did not return a submission token.')
  for (let attempt = 0; attempt < JUDGE0_MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLL_INTERVAL))
    const result = await judge0Request(`/submissions/${encodeURIComponent(submission.token)}?base64_encoded=true`)
    const statusId = result?.status?.id
    if (statusId !== 1 && statusId !== 2) return normalizeJudge0Result(result, start)
  }
  return {
    success: false, stdout: '', stderr: 'Judge0 timed out while waiting for the submission result.',
    exitCode: 124, executionTime: Math.round(performance.now() - start), memory: 0, engine: 'judge0',
  }
}

export async function compileAndRun({ language, code, files = [], stdin = '' }) {
  const start = performance.now()
  if (!code || !code.trim()) {
    return {
      success: false, stdout: '', stderr: 'error: empty source file — nothing to compile.',
      exitCode: 1, executionTime: 0, memory: 0, engine: 'judge0',
    }
  }

  // C/C++/C# execution uses the real sandboxed compiler/runtime. This is
  // important for advanced C programs (pointers, structs, arrays, functions,
  // standard-library APIs, dynamic allocation, etc.) that are outside the
  // educational interpreter's supported subset.
  try {
    return await runWithJudge0({ language, code, files, stdin, start })
  } catch (err) {
    return {
      success: false, stdout: '', stderr: `Judge0 error: ${err.message}`,
      exitCode: 1, executionTime: Math.round(performance.now() - start),
      memory: 0, engine: 'judge0', networkError: true,
    }
  }
}
