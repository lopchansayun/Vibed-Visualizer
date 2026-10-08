const C_CODE = `#include <stdio.h>

int main() {
    int a = 10;
    int b = 20;
    int sum = a + b;

    printf("Sum = %d\\n", sum);

    return 0;
}
`

const SIMPLE_PROGRAMS = {
  cpp: `#include <iostream>

int main() {
    std::cout << "Hello, CodeViz!\\n";
    return 0;
}
`,
  csharp: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, CodeViz!");
    }
}
`,
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, CodeViz!");
    }
}
`,
  javascript: `console.log("Hello, CodeViz!");\n`,
  typescript: `import * as fs from "fs";\n\nconst input: string[] = fs.readFileSync(0, "utf8").trim().split(/\s+/);\nconst name: string = input[0] || "world";\nconst age: number = Number(input[1] || 0);\n\nconsole.log(\`Hello \${name}, you are \${age} years old.\`);\n`,
  python: `print("Hello, CodeViz!")\n`,
  rust: `fn main() {\n    println!("Hello, CodeViz!");\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, CodeViz!")\n}\n`,
  php: `<?php\necho "Hello, CodeViz!\\n";\n`,
  lua: `print("Hello, CodeViz!")\n`,
}

export const DEFAULT_CODE = {
  c: C_CODE,
  ...SIMPLE_PROGRAMS,
}

export const LANGUAGES = {
  c: { label: 'C (GCC)', monacoLanguage: 'c', extension: 'c', fileName: 'main.c', judge0Id: 50, visualizable: true },
  cpp: { label: 'C++ (GCC)', monacoLanguage: 'cpp', extension: 'cpp', fileName: 'main.cpp', judge0Id: 54, visualizable: false },
  csharp: { label: 'C#', monacoLanguage: 'csharp', extension: 'cs', fileName: 'Program.cs', judge0Id: 51, visualizable: false },
  javascript: { label: 'JavaScript (Node.js)', monacoLanguage: 'javascript', extension: 'js', fileName: 'main.js', judge0Id: 63, visualizable: false },
  typescript: { label: 'TypeScript', monacoLanguage: 'typescript', extension: 'ts', fileName: 'main.ts', judge0Id: 74, visualizable: false },
  rust: { label: 'Rust', monacoLanguage: 'rust', extension: 'rs', fileName: 'main.rs', judge0Id: 73, visualizable: false },
  go: { label: 'Go', monacoLanguage: 'go', extension: 'go', fileName: 'main.go', judge0Id: 60, visualizable: false },
  php: { label: 'PHP', monacoLanguage: 'php', extension: 'php', fileName: 'main.php', judge0Id: 68, visualizable: false },
  java: { label: 'Java', monacoLanguage: 'java', extension: 'java', fileName: 'Main.java', judge0Id: 62, visualizable: false },
  python: { label: 'Python 3', monacoLanguage: 'python', extension: 'py', fileName: 'main.py', judge0Id: 71, visualizable: false },
  lua: { label: 'Lua', monacoLanguage: 'lua', extension: 'lua', fileName: 'main.lua', judge0Id: 64, visualizable: false },
}

export const LANGUAGE_ORDER = [
  'c', 'cpp', 'csharp', 'javascript', 'typescript', 'rust', 'go', 'php', 'java', 'python', 'lua',
]
