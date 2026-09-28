# CodeViz — Judge0 execution

CodeViz now uses a hybrid execution strategy:

1. **Mock interpreter first** — short, simple programs that the existing local
   interpreter can execute successfully stay local. This avoids a Judge0 API
   request and keeps common examples fast.
2. **Judge0 CE** — larger programs, programs using features outside the mock
   interpreter, input-driven programs, or programs the mock cannot execute are
   compiled and executed by Judge0.
3. **Visualizer** — the existing source-level visualizer still uses the local
   interpreter because a normal Judge0 submission returns execution results,
   not a variable-by-variable debugger trace.

## Configuration

Copy `.env.example` to `.env`:

```env
VITE_JUDGE0_API_URL=https://ce.judge0.com
# VITE_JUDGE0_API_KEY=
```

Restart Vite after changing environment variables.

The default language mapping is:

| CodeViz | Judge0 |
|---|---:|
| C | 50 — C (GCC 9.2.0) |
| C++ | 54 — C++ (GCC 9.2.0) |
| C# | 51 — C# (Mono 6.6.0.161) |

These IDs and the submission/polling API are from the Judge0 CE API documentation:
https://ce.judge0.com/

## Production security

A `VITE_*` variable is bundled into browser JavaScript. Therefore, **do not put
a valuable private Judge0 credential directly in the frontend**.

For production, the recommended architecture is:

```text
CodeViz browser
      |
      v
Your backend /api/execute
      |
      v
Judge0
```

The frontend can then use:

```env
VITE_JUDGE0_API_URL=https://your-domain.com/api/judge0
```

and the backend keeps the Judge0 credential private.

## What happens when Run is clicked?

`src/services/compilerService.js` decides the execution engine.

- `engine: "mock"` means the local interpreter handled it.
- `engine: "judge0"` means the code was actually compiled/executed by Judge0.
- Judge0 compilation errors are shown through the existing Errors console.
- Judge0 stdout, exit code, execution time and memory are mapped into the
  existing output UI.

Judge0 submissions are created asynchronously and polled until the submission
leaves `In Queue` / `Processing`.
