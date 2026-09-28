// Builds an execution trace for the educational visualizer.
//
// The visualizer intentionally supports a smaller, deterministic subset than
// the real compiler. Programs that execute through Judge0 can therefore be
// valid C/C++/C# while still being outside the visualizer's trace subset.

import { runInterpreter, InterpError } from "./interpreter";

export async function buildExecutionTrace({ language, code, stdin = "" }) {
  if (language !== "c") {
    return {
      steps: [],
      available: false,
      message: "Visualization is only available for native C.",
    };
  }
  await new Promise((res) => setTimeout(res, 100));
  try {
    const { steps } = runInterpreter(code, language, stdin);
    return { steps, available: true, message: "" };
  } catch (err) {
    if (err instanceof InterpError) {
      return {
        steps: [],
        available: false,
        message: `Source-level visualization is not available for this program: ${err.message}`,
        line: err.line ?? null,
      };
    }
    throw err;
  }
}
