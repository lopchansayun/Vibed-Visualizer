import { filesToZipBase64 } from './archive'

const JUDGE0_API_URL = (import.meta.env.VITE_JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/+$/, '')
const JUDGE0_API_KEY = import.meta.env.VITE_JUDGE0_API_KEY || ''

const JUDGE0_LANGUAGE_IDS = { c: 50 }

const JUDGE0_POLL_INTERVAL = 250
const JUDGE0_MAX_POLLS = 60

function fileNameFor(language) {
  return language === 'c' ? 'main.c' : 'main'
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
  // In C, returning a non-zero value from main is valid program behavior,
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

function buildMultiFileScripts() {
  return {
    compile: `#!/bin/bash
set -e
sources=()
for f in ./*.c; do
  [ -f "$f" ] && sources+=("\$f")
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
async function runWithJudge0({ language, code, files = [], stdin, start }) {
  const languageId = JUDGE0_LANGUAGE_IDS[language]
  if (!languageId) throw new Error(`Judge0 does not have a configured language ID for "${language}".`)
  const sourceName = files.find((f) => f.content === code)?.name || fileNameFor(language)
  const projectFiles = files.length ? files : [{ name: sourceName, content: code }]

  // Judge0's normal C language ID compiles one source file. For multi-file
  // C projects use Judge0's Multi-file program language (ID 89), which runs
  // our compile and run scripts from the submitted ZIP.
  const multiFile = language === 'c'
  if (multiFile && projectFiles.some((f) => f.name !== sourceName && /\.c$/i.test(f.name))) {
    const scripts = buildMultiFileScripts()
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

  // C execution uses the real sandboxed compiler/runtime.
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
