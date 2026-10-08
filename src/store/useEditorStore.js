import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_CODE, LANGUAGES } from '../config/languages'
import { normalizePath, baseName } from '../utils/paths'

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
  folders: Object.fromEntries(Object.keys(LANGUAGES).map(key => [key, []])),
  openTabs: Object.fromEntries(Object.entries(LANGUAGES).map(([key, language]) => [key, [language.fileName]])),
  sidebarOpen: true,
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
  editorSettings: {
    fontSize: 13.5,
    fontFamily: 'JetBrains Mono',
    theme: 'app',
    lineNumbers: true,
    minimap: false,
    wordWrap: 'off',
  },
}

export const useEditorStore = create(
  persist((set, get) => ({
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

    createFile: (name, content = '') => {
      const state = get()
      const language = state.language
      const definition = LANGUAGES[language]
      const path = normalizePath(name)
      if (!path || !definition) return { ok: false, error: 'Invalid file name.' }
      const safeName = /\.[A-Za-z0-9]+$/.test(baseName(path)) ? path : `${path}.${definition.extension}`
      const currentFiles = state.files[language] || []
      if (currentFiles.some(file => file.name === safeName)) return { ok: false, error: `"${safeName}" already exists.` }
      if ((state.folders[language] || []).includes(safeName)) return { ok: false, error: `A folder named "${safeName}" already exists.` }
      set({
        files: { ...state.files, [language]: [...currentFiles, { name: safeName, content: String(content) }] },
        activeFile: { ...state.activeFile, [language]: safeName },
        openTabs: { ...state.openTabs, [language]: [...(state.openTabs[language] || []), safeName] },
        code: { ...state.code, [language]: String(content) },
      })
      return { ok: true, path: safeName }
    },

    createFolder: (name) => {
      const state = get()
      const language = state.language
      const path = normalizePath(name)
      if (!path) return { ok: false, error: 'Invalid folder name.' }
      const folders = state.folders[language] || []
      if (folders.includes(path)) return { ok: false, error: `"${path}" already exists.` }
      if ((state.files[language] || []).some(file => file.name === path)) return { ok: false, error: `A file named "${path}" already exists.` }
      set({ folders: { ...state.folders, [language]: [...folders, path] } })
      return { ok: true, path }
    },

    switchFile: (name) => set((state) => {
      const language = state.language
      const file = (state.files[language] || []).find(item => item.name === name)
      if (!file) return {}
      const tabs = state.openTabs[language] || []
      return {
        activeFile: { ...state.activeFile, [language]: name },
        openTabs: tabs.includes(name) ? state.openTabs : { ...state.openTabs, [language]: [...tabs, name] },
        code: { ...state.code, [language]: file.content },
      }
    }),

    // Closing a tab only hides it; the file stays in the project tree.
    closeFile: (name) => set((state) => {
      const language = state.language
      const files = state.files[language] || []
      const tabs = (state.openTabs[language] || []).filter(tab => tab !== name)
      if (!tabs.length) return {}
      const active = state.activeFile[language] === name ? tabs[tabs.length - 1] : state.activeFile[language]
      return {
        openTabs: { ...state.openTabs, [language]: tabs },
        activeFile: { ...state.activeFile, [language]: active },
        code: { ...state.code, [language]: files.find(file => file.name === active)?.content || '' },
      }
    }),

    renameEntry: (oldPath, newName, isFolder) => {
      const state = get()
      const language = state.language
      const target = normalizePath(newName)
      if (!target) return { ok: false, error: 'Invalid name.' }
      if (target === oldPath) return { ok: true, path: target }
      const files = state.files[language] || []
      const folders = state.folders[language] || []
      const mapPath = (path) => isFolder
        ? (path === oldPath ? target : path.startsWith(`${oldPath}/`) ? `${target}${path.slice(oldPath.length)}` : path)
        : (path === oldPath ? target : path)
      if (isFolder && (target === oldPath || target.startsWith(`${oldPath}/`))) return { ok: false, error: 'Cannot move a folder into itself.' }
      const nextFiles = files.map(file => ({ ...file, name: mapPath(file.name) }))
      const nextFolders = [...new Set(folders.map(mapPath))]
      const names = nextFiles.map(file => file.name)
      if (new Set(names).size !== names.length || (!isFolder && nextFolders.includes(target)) || (isFolder && names.includes(target))) {
        return { ok: false, error: `"${target}" already exists.` }
      }
      const active = mapPath(state.activeFile[language])
      set({
        files: { ...state.files, [language]: nextFiles },
        folders: { ...state.folders, [language]: nextFolders },
        openTabs: { ...state.openTabs, [language]: (state.openTabs[language] || []).map(mapPath) },
        activeFile: { ...state.activeFile, [language]: active },
      })
      return { ok: true, path: target }
    },

    deleteEntry: (path, isFolder) => {
      const state = get()
      const language = state.language
      const inside = (p) => p === path || (isFolder && p.startsWith(`${path}/`))
      const files = state.files[language] || []
      const nextFiles = files.filter(file => !inside(file.name))
      if (!nextFiles.length) return { ok: false, error: 'A project needs at least one file.' }
      const folders = (state.folders[language] || []).filter(folder => !inside(folder))
      let tabs = (state.openTabs[language] || []).filter(tab => !inside(tab))
      let active = state.activeFile[language]
      if (inside(active)) active = tabs[tabs.length - 1] || nextFiles[0].name
      if (!tabs.includes(active)) tabs = [...tabs, active]
      set({
        files: { ...state.files, [language]: nextFiles },
        folders: { ...state.folders, [language]: folders },
        openTabs: { ...state.openTabs, [language]: tabs },
        activeFile: { ...state.activeFile, [language]: active },
        code: { ...state.code, [language]: nextFiles.find(file => file.name === active)?.content || '' },
      })
      return { ok: true }
    },

    // entries: [{ name, content }] with already-normalized relative paths.
    importEntries: (entries) => {
      const state = get()
      const language = state.language
      if (!entries.length) return { added: 0, replaced: 0 }
      const byName = new Map((state.files[language] || []).map(file => [file.name, file]))
      let added = 0
      let replaced = 0
      for (const entry of entries) {
        if (byName.has(entry.name)) replaced++
        else added++
        byName.set(entry.name, { name: entry.name, content: entry.content })
      }
      const files = [...byName.values()]
      const definition = LANGUAGES[language]
      const first = entries.find(e => e.name === definition.fileName) || entries.find(e => baseName(e.name) === definition.fileName) || entries[0]
      const tabs = state.openTabs[language] || []
      set({
        files: { ...state.files, [language]: files },
        activeFile: { ...state.activeFile, [language]: first.name },
        openTabs: { ...state.openTabs, [language]: tabs.includes(first.name) ? tabs : [...tabs, first.name] },
        code: { ...state.code, [language]: byName.get(first.name).content },
      })
      return { added, replaced }
    },

    resetCode: () => set((state) => {
      const language = state.language
      const definition = LANGUAGES[language]
      const content = DEFAULT_CODE[language] || ''
      return {
        code: { ...state.code, [language]: content },
        files: { ...state.files, [language]: [{ name: definition.fileName, content }] },
        folders: { ...state.folders, [language]: [] },
        openTabs: { ...state.openTabs, [language]: [definition.fileName] },
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
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    toggleConsole: () => set((state) => ({ consoleOpen: !state.consoleOpen })),
    toggleShowAddresses: () => set((state) => ({ showAddresses: !state.showAddresses })),
    toggleShowStack: () => set((state) => ({ showStack: !state.showStack })),
    toggleShowHeap: () => set((state) => ({ showHeap: !state.showHeap })),

    setEditorSetting: (key, value) => set((state) => ({
      editorSettings: { ...state.editorSettings, [key]: value },
    })),

    toggleTheme: () => set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme)
      return { theme }
    }),
  }), {
    name: 'vibedvisualizer-editor-state',
    storage: createJSONStorage(() => localStorage),
    version: 6,
    merge: (persisted, current) => {
      const merged = { ...current, ...(persisted || {}) }
      // Keep persisted projects compatible after the supported-language list was reduced.
      if (!LANGUAGES[merged.language]) merged.language = current.language
      // Backfill state added after older versions were saved.
      merged.folders = { ...current.folders, ...(persisted?.folders || {}) }
      merged.editorSettings = { ...current.editorSettings, ...(persisted?.editorSettings || {}) }
      merged.openTabs = Object.fromEntries(Object.keys(LANGUAGES).map((key) => {
        const names = (merged.files[key] || []).map(file => file.name)
        const saved = (persisted?.openTabs?.[key] || []).filter(name => names.includes(name))
        const tabs = saved.length ? saved : names
        return [key, tabs.includes(merged.activeFile[key]) ? tabs : [...tabs, merged.activeFile[key]].filter(Boolean)]
      }))
      return merged
    },
    partialize: (state) => ({
      language: state.language,
      code: state.code,
      files: state.files,
      folders: state.folders,
      openTabs: state.openTabs,
      sidebarOpen: state.sidebarOpen,
      activeFile: state.activeFile,
      input: state.input,
      editorSettings: state.editorSettings,
    }),
  })
)
