import { runInterpreter, InterpError } from './interpreter'

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
  const compileOutput = data?.compile_output || ''
  const stderr = data?.stderr || ''
  const message = data?.message || ''
  const isAccepted = statusId === 3
  const failureText = compileOutput || stderr || message || statusDescription || 'Program failed.'
  return {
    success: isAccepted, stdout: data?.stdout || '',
    stderr: isAccepted ? '' : failureText,
    exitCode: data?.exit_code ?? (isAccepted ? 0 : 1),
    executionTime: data?.time != null ? Math.round(Number(data.time) * 1000) : Math.round(performance.now() - start),
    memory: data?.memory ?? 0, engine: 'judge0',
    judge0Status: statusDescription, judge0Token: data?.token || null,
  }
}

async function runWithJudge0({ language, code, stdin, start }) {
  const languageId = JUDGE0_LANGUAGE_IDS[language]
  if (!languageId) throw new Error(`Judge0 does not have a configured language ID for "${language}".`)
  const submission = await judge0Request('/submissions/?base64_encoded=false&wait=false', {
    method: 'POST',
    body: JSON.stringify({ source_code: code, language_id: languageId, stdin: stdin || '' }),
  })
  if (!submission?.token) throw new Error('Judge0 did not return a submission token.')
  for (let attempt = 0; attempt < JUDGE0_MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLL_INTERVAL))
    const result = await judge0Request(`/submissions/${encodeURIComponent(submission.token)}?base64_encoded=false`)
    const statusId = result?.status?.id
    if (statusId !== 1 && statusId !== 2) return normalizeJudge0Result(result, start)
  }
  return {
    success: false, stdout: '', stderr: 'Judge0 timed out while waiting for the submission result.',
    exitCode: 124, executionTime: Math.round(performance.now() - start), memory: 0, engine: 'judge0',
  }
}

export async function compileAndRun({ language, code, stdin = '' }) {
  const start = performance.now()
  if (!code || !code.trim()) {
    return {
      success: false, stdout: '', stderr: 'error: empty source file — nothing to compile.',
      exitCode: 1, executionTime: 0, memory: 0, engine: 'local',
    }
  }
  if (canAttemptMock(code, stdin)) {
    const mockResult = mockResultFromInterpreter({ language, code, stdin, start })
    if (mockResult.success) return mockResult
    if (!mockResult.mockUnsupported) return mockResult
  }
  try { return await runWithJudge0({ language, code, stdin, start }) }
  catch (err) {
    return {
      success: false, stdout: '', stderr: `Judge0 error: ${err.message}`,
      exitCode: 1, executionTime: Math.round(performance.now() - start),
      memory: 0, engine: 'judge0', networkError: true,
    }
  }
}