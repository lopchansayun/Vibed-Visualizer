import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_CODE, LANGUAGES } from '../config/languages'

const THEME_KEY = 'vibedvisualizer-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function initialFiles() {
  return Object.fromEntries(Object.entries(LANGUAGES).map(([key, language]) => [key, [{ name: language.fileName, content: DEFAULT_CODE[key] || '' }]]))
}

function ensureLanguageState(state, language) {
  const definition = LANGUAGES[language] || LANGUAGES.c
  const files = state.files[language]?.length ? state.files[language] : [{ name: definition.fileName, content: DEFAULT_CODE[language] || '' }]
  const activeFile = state.activeFile[language] && files.some(file => file.name === state.activeFile[language])
    ? state.activeFile[language]
    : files[0].name
  const code = state.code[language] ?? files.find(file => file.name === activeFile)?.content ?? DEFAULT_CODE[language] ?? ''
  return { files, activeFile, code }
}

const initialState = {
  language: 'c',
  code: { ...DEFAULT_CODE },
  files: initialFiles(),
  activeFile: Object.fromEntries(Object.entries(LANGUAGES).map(([key, language]) => [key, language.fileName])),
  input: '',
  status: 'idle',
  output: { stdout: '', stderr: '', exitCode: null, executionTime: null, memory: null },
  activeConsoleTab: 'output',
  trace: null,
  traceError: '',
  currentStep: 0,
  isPlaying: false,
  visualizerOpen: false,
  consoleOpen: false,
  showAddresses: true,
  showStack: true,
  showHeap: true,
  theme: getInitialTheme(),
}

export const useEditorStore = create(
  persist((set) => ({
    ...initialState,

    setLanguage: (language) => set((state) => {
      if (!LANGUAGES[language]) return {}
      const next = ensureLanguageState(state, language)
      return {
        language,
        code: { ...state.code, [language]: next.code },
        files: { ...state.files, [language]: next.files },
        activeFile: { ...state.activeFile, [language]: next.activeFile },
        visualizerOpen: language === 'c' ? state.visualizerOpen : false,
        trace: language === 'c' ? state.trace : null,
        currentStep: 0,
        isPlaying: false,
      }
    }),

    setCode: (code) => set((state) => {
      const language = state.language
      const active = state.activeFile[language]
      const files = (state.files[language] || []).map(file => file.name === active ? { ...file, content: code } : file)
      return { code: { ...state.code, [language]: code }, files: { ...state.files, [language]: files } }
    }),

    createFile: (name, content = '') => set((state) => {
      const language = state.language
      const definition = LANGUAGES[language]
      const trimmed = String(name || '').trim()
      if (!trimmed || !definition) return {}
      const safeName = /\.[A-Za-z0-9]+$/.test(trimmed) ? trimmed : `${trimmed}.${definition.extension}`
      const currentFiles = state.files[language] || []
      if (currentFiles.some(file => file.name === safeName)) return {}
      const files = [...currentFiles, { name: safeName, content: String(content) }]
      return {
        files: { ...state.files, [language]: files },
        activeFile: { ...state.activeFile, [language]: safeName },
        code: { ...state.code, [language]: String(content) },
      }
    }),

    switchFile: (name) => set((state) => {
      const language = state.language
      const file = (state.files[language] || []).find(item => item.name === name)
      return file ? { activeFile: { ...state.activeFile, [language]: name }, code: { ...state.code, [language]: file.content } } : {}
    }),

    closeFile: (name) => set((state) => {
      const language = state.language
      const files = state.files[language] || []
      if (files.length <= 1) return {}
      const nextFiles = files.filter(file => file.name !== name)
      const active = state.activeFile[language] === name ? nextFiles[0].name : state.activeFile[language]
      return {
        files: { ...state.files, [language]: nextFiles },
        activeFile: { ...state.activeFile, [language]: active },
        code: { ...state.code, [language]: nextFiles.find(file => file.name === active)?.content || '' },
      }
    }),

    resetCode: () => set((state) => {
      const language = state.language
      const definition = LANGUAGES[language]
      const content = DEFAULT_CODE[language] || ''
      return {
        code: { ...state.code, [language]: content },
        files: { ...state.files, [language]: [{ name: definition.fileName, content }] },
        activeFile: { ...state.activeFile, [language]: definition.fileName },
        trace: null,
        currentStep: 0,
        isPlaying: false,
        visualizerOpen: false,
      }
    }),

    setInput: (input) => set({ input }),
    setActiveConsoleTab: (activeConsoleTab) => set({ activeConsoleTab }),
    setStatus: (status) => set({ status }),
    setOutput: (output) => set({ output }),
    clearConsole: () => set({ output: { stdout: '', stderr: '', exitCode: null, executionTime: null, memory: null }, status: 'idle' }),

    setTrace: (trace) => set({ trace, traceError: trace?.message || '', currentStep: 0, isPlaying: false }),
    setCurrentStep: (currentStep) => set({ currentStep }),
    stepNext: () => set((state) => {
      if (!state.trace?.steps?.length) return {}
      return { currentStep: Math.min(state.currentStep + 1, state.trace.steps.length - 1) }
    }),
    stepPrev: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) })),
    restartTrace: () => set({ currentStep: 0, isPlaying: false }),
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    toggleVisualizer: () => set((state) => ({ visualizerOpen: !state.visualizerOpen })),
    toggleConsole: () => set((state) => ({ consoleOpen: !state.consoleOpen })),
    toggleShowAddresses: () => set((state) => ({ showAddresses: !state.showAddresses })),
    toggleShowStack: () => set((state) => ({ showStack: !state.showStack })),
    toggleShowHeap: () => set((state) => ({ showHeap: !state.showHeap })),

    toggleTheme: () => set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme)
      return { theme }
    }),
  }), {
    name: 'vibedvisualizer-editor-state',
    storage: createJSONStorage(() => localStorage),
    version: 3,
    partialize: (state) => ({
      language: state.language,
      code: state.code,
      files: state.files,
      activeFile: state.activeFile,
      input: state.input,
    }),
  })
)
