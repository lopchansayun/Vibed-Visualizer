const C_CODE = `#include <stdio.h>\n\nint main() {\n    int a = 10;\n    int b = 20;\n    int sum = a + b;\n\n    printf("Sum = %d\\n", sum);\n\n    return 0;\n}\n`

const SIMPLE_PROGRAMS = {
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, CodeViz!\\n";\n    return 0;\n}\n`,
  csharp: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, CodeViz!");\n    }\n}\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeViz!");\n    }\n}\n`,
  javascript: `console.log("Hello, CodeViz!");\n`,
  typescript: `const message: string = "Hello, CodeViz!";\nconsole.log(message);\n`,
  python2: `print "Hello, CodeViz!"\n`,
  python: `print("Hello, CodeViz!")\n`,
  ruby: `puts "Hello, CodeViz!"\n`,
  rust: `fn main() {\n    println!("Hello, CodeViz!");\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, CodeViz!")\n}\n`,
  php: `<?php\necho "Hello, CodeViz!\\n";\n`,
  bash: `#!/bin/bash\necho "Hello, CodeViz!"\n`,
  lua: `print("Hello, CodeViz!")\n`,
  haskell: `main :: IO ()\nmain = putStrLn "Hello, CodeViz!"\n`,
  fortran: `program main\n  print *, "Hello, CodeViz!"\nend program main\n`,
  pascal: `program Main;\nbegin\n  writeln('Hello, CodeViz!');\nend.\n`,
  d: `import std.stdio;\n\nvoid main() {\n    writeln("Hello, CodeViz!");\n}\n`,
  elixir: `IO.puts("Hello, CodeViz!")\n`,
  erlang: `-module(main).\n-export([main/0]).\n\nmain() -> io:format("Hello, CodeViz!~n").\n`,
  commonlisp: `(format t "Hello, CodeViz!~%")\n`,
  ocaml: `print_endline "Hello, CodeViz!"\n`,
  octave: `disp("Hello, CodeViz!");\n`,
  prolog: `:- initialization(main).\n\nmain :- writeln('Hello, CodeViz!'), halt.\n`,
  assembly: `section .text\nglobal _start\n\n_start:\n    mov eax, 60\n    xor edi, edi\n    syscall\n`,
}

export const DEFAULT_CODE = {
  c: C_CODE,
  basic: `PRINT \"Hello, CodeViz!\"\n`,
  ...SIMPLE_PROGRAMS,
}

export const LANGUAGES = {
  c: { label: 'C (GCC)', monacoLanguage: 'c', extension: 'c', fileName: 'main.c', judge0Id: 50, visualizable: true },
  basic: { label: 'Basic', monacoLanguage: 'plaintext', extension: 'bas', fileName: 'main.bas', judge0Id: 47, visualizable: false },
  cpp: { label: 'C++ (GCC)', monacoLanguage: 'cpp', extension: 'cpp', fileName: 'main.cpp', judge0Id: 54, visualizable: false },
  csharp: { label: 'C#', monacoLanguage: 'csharp', extension: 'cs', fileName: 'Program.cs', judge0Id: 51, visualizable: false },
  java: { label: 'Java', monacoLanguage: 'java', extension: 'java', fileName: 'Main.java', judge0Id: 62, visualizable: false },
  javascript: { label: 'JavaScript (Node.js)', monacoLanguage: 'javascript', extension: 'js', fileName: 'main.js', judge0Id: 63, visualizable: false },
  typescript: { label: 'TypeScript', monacoLanguage: 'typescript', extension: 'ts', fileName: 'main.ts', judge0Id: 74, visualizable: false },
  python: { label: 'Python 3', monacoLanguage: 'python', extension: 'py', fileName: 'main.py', judge0Id: 71, visualizable: false },
  python2: { label: 'Python 2', monacoLanguage: 'python', extension: 'py', fileName: 'main.py', judge0Id: 70, visualizable: false },
  ruby: { label: 'Ruby', monacoLanguage: 'ruby', extension: 'rb', fileName: 'main.rb', judge0Id: 72, visualizable: false },
  rust: { label: 'Rust', monacoLanguage: 'rust', extension: 'rs', fileName: 'main.rs', judge0Id: 73, visualizable: false },
  go: { label: 'Go', monacoLanguage: 'go', extension: 'go', fileName: 'main.go', judge0Id: 60, visualizable: false },
  php: { label: 'PHP', monacoLanguage: 'php', extension: 'php', fileName: 'main.php', judge0Id: 68, visualizable: false },
  bash: { label: 'Bash', monacoLanguage: 'shell', extension: 'sh', fileName: 'main.sh', judge0Id: 46, visualizable: false },
  lua: { label: 'Lua', monacoLanguage: 'lua', extension: 'lua', fileName: 'main.lua', judge0Id: 64, visualizable: false },
  fortran: { label: 'Fortran', monacoLanguage: 'plaintext', extension: 'f90', fileName: 'main.f90', judge0Id: 59, visualizable: false },
  haskell: { label: 'Haskell', monacoLanguage: 'haskell', extension: 'hs', fileName: 'Main.hs', judge0Id: 61, visualizable: false },
  pascal: { label: 'Pascal', monacoLanguage: 'pascal', extension: 'pas', fileName: 'main.pas', judge0Id: 67, visualizable: false },
  d: { label: 'D', monacoLanguage: 'plaintext', extension: 'd', fileName: 'main.d', judge0Id: 56, visualizable: false },
  elixir: { label: 'Elixir', monacoLanguage: 'plaintext', extension: 'exs', fileName: 'main.exs', judge0Id: 57, visualizable: false },
  erlang: { label: 'Erlang', monacoLanguage: 'plaintext', extension: 'erl', fileName: 'main.erl', judge0Id: 58, visualizable: false },
  commonlisp: { label: 'Common Lisp', monacoLanguage: 'plaintext', extension: 'lisp', fileName: 'main.lisp', judge0Id: 55, visualizable: false },
  ocaml: { label: 'OCaml', monacoLanguage: 'plaintext', extension: 'ml', fileName: 'main.ml', judge0Id: 65, visualizable: false },
  octave: { label: 'Octave', monacoLanguage: 'matlab', extension: 'm', fileName: 'main.m', judge0Id: 66, visualizable: false },
  prolog: { label: 'Prolog', monacoLanguage: 'plaintext', extension: 'pl', fileName: 'main.pl', judge0Id: 69, visualizable: false },
  assembly: { label: 'Assembly (NASM)', monacoLanguage: 'asm', extension: 'asm', fileName: 'main.asm', judge0Id: 45, visualizable: false },
}

export const LANGUAGE_ORDER = [
  'c', 'basic', 'cpp', 'csharp', 'java', 'javascript', 'typescript', 'python', 'python2',
  'ruby', 'rust', 'go', 'php', 'bash', 'lua', 'haskell',
  'fortran', 'pascal', 'd', 'elixir', 'erlang', 'commonlisp', 'ocaml', 'octave', 'prolog', 'assembly',
]
