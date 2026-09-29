# CodeViz — Judge0 execution

CodeViz uses Judge0 as the authoritative compiler/runtime. The local C interpreter is separate and is used only to produce source-level trace data for the visualizer.

## Configuration

Copy `.env.example` to `.env`:

```env
VITE_JUDGE0_API_URL=https://ce.judge0.com
# VITE_JUDGE0_API_KEY=
```

The frontend calls the configured Judge0 endpoint directly. A frontend `VITE_*` key is public by design; do not place a private credential in the browser bundle. Use a backend proxy when your deployment requires a secret.

## Configured Judge0 CE languages

The IDs below follow the Judge0 CE v1.13.1 language list. A self-hosted or customized Judge0 deployment can expose a different set, so the configured endpoint remains the source of truth. Judge0 documents support for 60+ languages overall and exposes `/languages/` to list active languages.

| CodeViz key | Language | Judge0 ID | Visualization |
|---|---|---:|---|
| `c` | C (GCC) | 50 | Yes |
| `basic` | Basic | 47 | No |
| `cpp` | C++ (GCC) | 54 | No |
| `csharp` | C# | 51 | No |
| `java` | Java | 62 | No |
| `javascript` | JavaScript (Node.js) | 63 | No |
| `typescript` | TypeScript | 74 | No |
| `python` | Python 3 | 71 | No |
| `python2` | Python 2 | 70 | No |
| `ruby` | Ruby | 72 | No |
| `rust` | Rust | 73 | No |
| `go` | Go | 60 | No |
| `php` | PHP | 68 | No |
| `bash` | Bash | 46 | No |
| `lua` | Lua | 64 | No |
| `haskell` | Haskell | 61 | No |
| `fortran` | Fortran | 59 | No |
| `pascal` | Pascal | 67 | No |
| `d` | D | 56 | No |
| `elixir` | Elixir | 57 | No |
| `erlang` | Erlang | 58 | No |
| `commonlisp` | Common Lisp | 55 | No |
| `ocaml` | OCaml | 65 | No |
| `octave` | Octave | 66 | No |
| `prolog` | Prolog | 69 | No |
| `assembly` | Assembly (NASM) | 45 | No |

The IDs above are the active language examples documented by Judge0 CE; CodeViz intentionally selects one practical compiler entry per language rather than exposing archived duplicate versions.

## Multi-file behavior

Judge0 supports multi-file submissions. CodeViz uses Judge0's **Multi-file program** language (ID 89) for C projects containing more than one `.c` source file. It generates a small `compile` script using GCC and a `run` script, then submits the project ZIP as `additional_files`. Judge0 documents the Multi-file Program workflow and ID 89.

For non-C languages, CodeViz uses the selected language's normal Judge0 ID. Additional project files can be supplied as `additional_files` where the selected Judge0 runtime supports that workflow.

## Run flow

1. The active editor file is selected as `source_code`.
2. Other project files are packaged as Judge0 `additional_files` when applicable.
3. CodeViz creates a submission.
4. The frontend polls until Judge0 leaves `In Queue` / `Processing`.
5. The result is normalized into stdout, stderr, exit code, execution time, memory, and Judge0 status.

Judge0's submission API requires a `language_id` and supports standard input, compiler options, command-line arguments, resource limits, and additional files.

## Visualization boundary

Judge0 results do not provide the variable/stack/heap snapshots needed for CodeViz's source-level visualization. Therefore:

- **C:** Run + Visualize.
- **All other configured languages:** Run only.
- The Visualize button is disabled whenever a non-C language is selected.

This separation prevents the UI from implying that a C-specific educational interpreter can faithfully trace another language.
