// Builds an execution trace for the educational visualizer.
//
// The visualizer intentionally supports a smaller, deterministic subset than
// the real compiler. Programs that execute through Judge0 can therefore be
// valid C/C++/C# while still being outside the visualizer's trace subset.

import { runInterpreter, InterpError } from './interpreter'

export async function buildExecutionTrace({ language, code, files = [], stdin = '' }) {
  if (language !== 'c') {
    return { steps: [], available: false, message: 'Visualization is only available for native C.' }
  }
  await new Promise((res) => setTimeout(res, 100))
  try {
    // For a C project, the visualizer needs function definitions from sibling
    // .c translation units as well as the entry file. Preprocessor directives
    // are stripped by the interpreter, so concatenating source units keeps
    // the educational trace deterministic without requiring a full linker.
    const cFiles = files.filter((file) => /\.c$/i.test(file.name))
    const ordered = cFiles.some((file) => file.name === 'main.c')
      ? [cFiles.find((file) => file.name === 'main.c'), ...cFiles.filter((file) => file.name !== 'main.c')]
      : cFiles
    const projectCode = ordered.length > 1
      ? ordered.map((file) => `\n/* --- ${file.name} --- */\n${file.content}\n`).join('\n')
      : code
    const { steps } = runInterpreter(projectCode, language, stdin)
    return { steps, available: true, message: '' }
  } catch (err) {
    if (err instanceof InterpError) {
      return {
        steps: [],
        available: false,
        message: `Source-level visualization is not available for this program: ${err.message}`,
        line: err.line ?? null,
      }
    }
    throw err
  }
}