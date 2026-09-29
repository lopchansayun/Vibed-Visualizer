# CodeViz — Judge0 C execution

CodeViz uses Judge0 as the authoritative compiler/runtime for C programs. The
local educational interpreter is separate and is used only to produce the
source-level trace consumed by the visualizer.

## Configuration

Copy `.env.example` to `.env`:

```env
VITE_JUDGE0_API_URL=https://ce.judge0.com
# VITE_JUDGE0_API_KEY=
```

Restart Vite after changing environment variables.

The configured Judge0 language mapping is:

| CodeViz | Judge0 |
|---|---:|
| C | 50 — C (GCC) |

For multi-file C projects, CodeViz uses Judge0's multi-file program language
(ID 89) with generated `compile` and `run` scripts.

## Browser execution

The current frontend calls Judge0 directly. A `VITE_*` API key is therefore
public in the browser bundle. Do not put a valuable private credential in the
frontend. If your Judge0 deployment requires a secret key, put a small backend
proxy in front of it.

## What happens when Run is clicked?

`src/services/compilerService.js` submits the C source/project to Judge0 and
polls until the submission leaves `In Queue` / `Processing`. The response is
normalized into the existing output model containing stdout, stderr, exit code,
execution time, memory, and Judge0 status.

The Judge0 response is **not** used as the visualizer trace: normal Judge0
execution results do not contain the variable/stack/heap snapshots required by
the visualizer.
