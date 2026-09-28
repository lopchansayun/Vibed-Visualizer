import { create } from 'zustand'
import { DEFAULT_CODE } from '../config/languages'

const THEME_KEY = 'vibedvisualizer-theme'
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useEditorStore = create((set, get) => ({
  // language + code
  language: 'cpp',
  code: { ...DEFAULT_CODE },
  input: '',

  setLanguage: (language) =>
    set((state) => ({
      language,
      visualizerOpen: language === 'c' ? state.visualizerOpen : false,
      // keep any edits the user already made per-language
    })),
  setCode: (code) =>
    set((state) => ({
      code: { ...state.code, [state.language]: code },
    })),
  resetCode: () =>
    set((state) => ({
      code: { ...state.code, [state.language]: DEFAULT_CODE[state.language] },
    })),
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
}))
