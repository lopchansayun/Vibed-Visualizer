import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_CODE } from '../config/languages'

const THEME_KEY = 'vibedvisualizer-theme'
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useEditorStore = create(
  persist((set, get) => ({
  // language + code
  language: 'c',
  code: { ...DEFAULT_CODE },
  files: {
    c: [{ name: 'main.c', content: DEFAULT_CODE.c }],
    cpp: [{ name: 'main.cpp', content: DEFAULT_CODE.cpp }],
    csharp: [{ name: 'Program.cs', content: DEFAULT_CODE.csharp }],
  },
  activeFile: { c: 'main.c', cpp: 'main.cpp', csharp: 'Program.cs' },
  input: '',

  setLanguage: (language) =>
    set((state) => ({
      language,
      visualizerOpen: language === 'c' ? state.visualizerOpen : false,
      // keep any edits the user already made per-language
    })),
  setCode: (code) => set((state) => {
    const language = state.language
    const active = state.activeFile[language]
    const files = (state.files[language] || []).map((file) => file.name === active ? { ...file, content: code } : file)
    return { code: { ...state.code, [language]: code }, files: { ...state.files, [language]: files } }
  }),
  createFile: (name, content = '') => set((state) => {
    const language = state.language
    const trimmed = String(name || '').trim()
    if (!trimmed) return {}
    const ext = `.${language === 'csharp' ? 'cs' : language}`
    const safeName = /\.[A-Za-z0-9]+$/.test(trimmed) ? trimmed : `${trimmed}${ext}`
    if ((state.files[language] || []).some((f) => f.name === safeName)) return {}
    const files = [...(state.files[language] || []), { name: safeName, content: String(content) }]
    return { files: { ...state.files, [language]: files }, activeFile: { ...state.activeFile, [language]: safeName }, code: { ...state.code, [language]: String(content) } }
  }),
  switchFile: (name) => set((state) => {
    const language = state.language
    const file = (state.files[language] || []).find((f) => f.name === name)
    return file ? { activeFile: { ...state.activeFile, [language]: name }, code: { ...state.code, [language]: file.content } } : {}
  }),
  closeFile: (name) => set((state) => {
    const language = state.language
    const files = state.files[language] || []
    if (files.length <= 1) return {}
    const nextFiles = files.filter((f) => f.name !== name)
    const active = state.activeFile[language] === name ? nextFiles[0].name : state.activeFile[language]
    const activeContent = nextFiles.find((f) => f.name === active)?.content || ''
    return { files: { ...state.files, [language]: nextFiles }, activeFile: { ...state.activeFile, [language]: active }, code: { ...state.code, [language]: activeContent } }
  }),
  resetCode: () => set((state) => {
    const language = state.language
    const active = state.activeFile[language]
    const content = DEFAULT_CODE[language]
    const files = (state.files[language] || []).map((file) => file.name === active ? { ...file, content } : file)
    return { code: { ...state.code, [language]: content }, files: { ...state.files, [language]: files } }
  }),
  setInput: (input) => set({ input }),

  // compilation / run state
  status: 'idle', // idle | compiling | running | success | compile-error | runtime-error | network-error
  output: { stdout: '', stderr: '', exitCode: null, executionTime: null, memory: null },
  activeConsoleTab: 'output',
  setActiveConsoleTab: (tab) => set({ activeConsoleTab: tab }),
  setStatus: (status) => set({ status }),
  setOutput: (output) => set({ output }),
  clearConsole: () =>
    set({ output: { stdout: '', stderr: '', exitCode: null, executionTime: null, memory: null }, status: 'idle' }),

  // visualizer state
  trace: null, // { steps: [...], available, message }
  currentStep: 0,
  isPlaying: false,
  visualizerOpen: false,
  consoleOpen: false,
  showAddresses: true,
  showStack: true,
  showHeap: true,
  toggleShowAddresses: () => set((state) => ({ showAddresses: !state.showAddresses })),
  toggleShowStack: () => set((state) => ({ showStack: !state.showStack })),
  toggleShowHeap: () => set((state) => ({ showHeap: !state.showHeap })),
  setTrace: (trace) => set({ trace, traceError: trace?.message || '', currentStep: 0, isPlaying: false }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  stepNext: () =>
    set((state) => {
      if (!state.trace) return {}
      const max = state.trace.steps.length - 1
      return { currentStep: Math.min(state.currentStep + 1, max) }
    }),
  stepPrev: () =>
    set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) })),
  restartTrace: () => set({ currentStep: 0, isPlaying: false }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  toggleVisualizer: () => set((state) => ({ visualizerOpen: state.language === 'c' ? !state.visualizerOpen : false })),
  toggleConsole: () => set((state) => ({ consoleOpen: !state.consoleOpen })),

  // theme
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, next)
      return { theme: next }
    }),
  }),
  {
    name: 'vibedvisualizer-editor-state',
    storage: createJSONStorage(() => localStorage),
    version: 1,
    partialize: (state) => ({
      language: state.language,
      code: state.code,
      files: state.files,
      activeFile: state.activeFile,
      input: state.input,
    }),
  }
))
