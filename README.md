# CodeViz — Online C Compiler & Visualizer

A React + Vite + Tailwind v4 developer tool for writing, compiling, running, and visually stepping through C programs in Monaco.

## Run it

```bash
npm install
npm run dev
```

## Architecture

- `src/services/compilerService.js` — compiles and executes C through Judge0, including multi-file C projects.
- `src/services/interpreter.js` — entry point for the local educational C interpreter used only to produce visualization state.
- `src/services/interpreter/runtime.js` — deterministic C execution model that produces stack, heap, call-stack, stdout, and source-line steps.
- `src/services/interpreter/cParser.js` — C parser and value/type helpers used by the visualizer runtime.
- `src/services/visualizerService.js` — converts a C project into the trace consumed by the visualizer.
- `src/store/useEditorStore.js` — Zustand store for C source files, console state, visualizer/trace state, and theme.

## Execution vs visualization

Judge0 is the authoritative C compiler/runtime. The local interpreter is separate and exists only because Judge0 execution results do not provide the source-level variable/stack/heap trace required by the visualizer.

The visualizer currently supports a deterministic educational subset of C. A program may compile and run successfully through Judge0 while still being outside the local visualizer's supported subset.

## Multi-file C projects

Create additional source/header files from the editor's **New** action. A project can contain files such as:

```text
main.c
math.c
math.h
```

The compiler path sends the complete project to Judge0's multi-file execution environment. The visualizer can combine C translation units when building its deterministic trace.

## Notes

- C is the only selectable language.
- Theme persists via `localStorage` and follows the OS preference on first load.
- `Ctrl/Cmd+Enter` runs; `Ctrl/Cmd+Shift+Enter` runs and opens the visualizer.
- The visualizer exposes simulated stack/heap addresses and pointer relationships for supported programs.
