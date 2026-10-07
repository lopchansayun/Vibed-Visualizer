import { LANGUAGES } from '../../config/languages'
import { filesToZipBase64 } from '../../utils/archive'

const JUDGE0_API_URL = (import.meta.env.VITE_JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/+$/, '')
const JUDGE0_API_KEY = import.meta.env.VITE_JUDGE0_API_KEY || ''
const MULTI_FILE_LANGUAGE_ID = 89
const POLL_INTERVAL_MS = 250
const MAX_POLLS = 60

function utf8ToBase64(value = '') {
  const bytes = new TextEncoder().encode(String(value))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function base64ToUtf8(value = '') {
  if (!value) return ''
  try {
    const binary = atob(value)
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)))
  } catch {
    return String(value)
  }
}

function headers() {
  const result = { 'Content-Type': 'application/json' }
  if (JUDGE0_API_KEY) result['X-Auth-Token'] = JUDGE0_API_KEY
  return result
}

async function request(path, options = {}) {
  const response = await fetch(`${JUDGE0_API_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  })
  let data = null
  try { data = await response.json() } catch {}
  if (!response.ok) {
    const message = data?.error || data?.message || `Judge0 request failed with HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return data
}

function normalizeResult(data, start) {
  const statusId = data?.status?.id
  const statusDescription = data?.status?.description || ''
  const compileOutput = base64ToUtf8(data?.compile_output || '')
  const stderr = base64ToUtf8(data?.stderr || '')
  const message = base64ToUtf8(data?.message || '')
  const exitCode = data?.exit_code
  const accepted = statusId === 3
  const normalNonZeroExit = statusId === 11 && Number.isInteger(Number(exitCode))
  const success = accepted || normalNonZeroExit
  return {
    success,
    stdout: base64ToUtf8(data?.stdout || ''),
    stderr: success ? '' : (compileOutput || stderr || message || statusDescription || 'Program failed.'),
    exitCode: exitCode ?? (success ? 0 : 1),
    executionTime: data?.time != null ? Math.round(Number(data.time) * 1000) : Math.round(performance.now() - start),
    memory: data?.memory ?? 0,
    engine: 'judge0',
    judge0Status: statusDescription,
    judge0Token: data?.token || null,
  }
}

async function pollSubmission(token, start) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    const result = await request(`/submissions/${encodeURIComponent(token)}?base64_encoded=true`)
    const statusId = result?.status?.id
    if (statusId !== 1 && statusId !== 2) return normalizeResult(result, start)
  }
  return {
    success: false,
    stdout: '',
    stderr: 'Judge0 timed out while waiting for the submission result.',
    exitCode: 124,
    executionTime: Math.round(performance.now() - start),
    memory: 0,
    engine: 'judge0',
  }
}

function multiFileScripts() {
  return {
    compile: `#!/bin/bash
set -e
sources=()
includes=(-I.)
while IFS= read -r f; do
  sources+=("$f")
done < <(find . -name '*.c' -type f | sort)
while IFS= read -r d; do
  includes+=("-I$d")
done < <(find . -type d | sort)
if [ "\${#sources[@]}" -eq 0 ]; then
  echo "No C source files found." >&2
  exit 1
fi
gcc -std=c17 -O0 -g "\${includes[@]}" "\${sources[@]}" -o program -lm
`,
    run: '#!/bin/bash\nexec ./program\n',
  }
}

async function submit(payload, start) {
  const submission = await request('/submissions/?base64_encoded=true&wait=false', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!submission?.token) throw new Error('Judge0 did not return a submission token.')
  return pollSubmission(submission.token, start)
}

async function runProject({ language, code, files, stdin, start, entryName }) {
  const definition = LANGUAGES[language]
  if (!definition?.judge0Id) throw new Error(`Judge0 language is not configured for "${language}".`)

  const projectFiles = files.length ? files : [{ name: definition.fileName, content: code }]
  const sourceName = entryName || projectFiles.find(file => file.name === definition.fileName)?.name || projectFiles.find(file => file.content === code)?.name || definition.fileName

  if (language === 'c' && projectFiles.some(file => file.name !== sourceName && /\.c$/i.test(file.name))) {
    const scripts = multiFileScripts()
    const additionalFiles = filesToZipBase64([
      ...projectFiles.map(file => ({ name: file.name, content: file.content })),
      { name: 'compile', content: scripts.compile },
      { name: 'run', content: scripts.run },
    ])
    return submit({ language_id: MULTI_FILE_LANGUAGE_ID, stdin: utf8ToBase64(stdin), additional_files: additionalFiles }, start)
  }

  const extraFiles = projectFiles.filter(file => file.name !== sourceName).map(file => ({ name: file.name, content: file.content }))
  return submit({
    source_code: utf8ToBase64(code),
    language_id: definition.judge0Id,
    stdin: utf8ToBase64(stdin),
    ...(extraFiles.length ? { additional_files: filesToZipBase64(extraFiles) } : {}),
  }, start)
}

export async function compileAndRun({ language, code, files = [], stdin = '', entryName }) {
  const start = performance.now()
  if (!code?.trim()) {
    return { success: false, stdout: '', stderr: 'error: empty source file — nothing to compile.', exitCode: 1, executionTime: 0, memory: 0, engine: 'judge0' }
  }

  try {
    return await runProject({ language, code, files, stdin, start, entryName })
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: `Judge0 error: ${error.message}`,
      exitCode: 1,
      executionTime: Math.round(performance.now() - start),
      memory: 0,
      engine: 'judge0',
      networkError: true,
    }
  }
}
