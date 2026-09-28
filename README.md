# CodeViz — Online Compiler & Code Visualizer

A React + Vite + Tailwind v4 developer tool: write C, C++, or C# in a Monaco
editor, run it, and step through a visual execution trace (variables, call
stack, current line) as the program runs.

## Run it

```bash
npm install
npm run dev
```

## Architecture

- `src/services/compilerService.js` — the frontend's compiler API contract
  (`compileAndRun({ language, code, stdin })`). C, C++, and C# are compiled and
  executed through the sandboxed Judge0 runtime. The local interpreter is kept
  separate for source-level visualization and is not used as the authoritative
  compiler.
- `src/services/interpreter.js` — a small educational interpreter used by the
  source-level visualizer. It supports a controlled subset of C/C++/C# for
  tracing and is intentionally not used as the real compiler/runtime.
- `src/services/visualizerService.js` — builds the execution trace consumed
  by the visualizer, kept independent of `compilerService` so a real
  instrumentation/debugging backend can replace it later without touching
  the UI.
- `src/store/useEditorStore.js` — Zustand store for language, code per
  language, console state, visualizer/trace state, and theme.


## C/C++ visualizer support

See `VISUALIZER_SUPPORT.md` for the exact supported/unsupported logic and ready-to-run test programs in `examples/support-tests/`.

The visualizer is intentionally a smaller educational interpreter. Code that uses
unsupported language/library features can still be compiled and run by Judge0,
but the UI will explicitly show **Visualization not available** instead of
reporting a misleading trace error.

## Notes

- Theme persists via `localStorage` and follows the OS preference on first
  load.
- `Ctrl/Cmd+Enter` runs; `Ctrl/Cmd+Shift+Enter` runs and opens the
  visualizer.
- The visualizer shows a simulated **stack** and **heap**, side by side,
  with arrows from pointer variables to whatever they point at (another
  stack slot for `&x`, or a heap block for `malloc`/`new`). A "Show
  addresses" switch toggles the fake-but-realistic hex addresses
  (`0x7ffe...` for stack, `0x55b8...` for heap). Freed blocks (`free`/
  `delete`) stay visible but dimmed, and a pointer still aimed at one is
  drawn as a dashed red "dangling pointer" arrow — a small bonus: the
  interpreter also throws a use-after-free error if you actually
  dereference one. Supported: `&x`, `*p`, `int* p = &x;`,
  `malloc(sizeof(T))`, `new T(...)`, `new T[N]`, `free(p)`, `delete p`.
  Heap arrays are visualized as a single block (not per-element
  addresses), but common patterns work: array indexing (`arr[i]`),
  `calloc`/`realloc`, C-style casts (`(int*)malloc(...)`), pointer
  arithmetic (`*(ptr + n)`), and multi-level pointers (`int** pp = &p;
  **pp = 5;`).
  **Not supported:** structs/classes and member access (`.` / `->`),
  and user-defined functions other than `main()` — calls to them are
  silently ignored rather than erroring, so code that depends on their
  side effects (e.g. a function that mutates a value through a pointer)
  won't show that effect in the trace. Only `main()`'s body is
  interpreted; there's no real multi-frame call stack yet.

## Multi-file C/C++ projects

Create additional source/header files from the editor's **New** tab action. The Run action treats `main.c` / `main.cpp` as the entry source and sends the whole project to Judge0 as `additional_files`. Other `.c`/`.cpp` translation units are passed to the compiler, while `.h` files are available to normal `#include` directives.

Example:

```text
main.c
math.c
math.h
```

`main.c` can use `#include "math.h"` and call functions implemented in `math.c`.
