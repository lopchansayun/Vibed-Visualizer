export const DEFAULT_CODE = {
  c: `#include <stdio.h>

int main() {
    int a = 10;
    int b = 20;
    int sum = a + b;

    printf("Sum = %d\\n", sum);

    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    int a = 10;
    int b = 20;
    int sum = a + b;

    cout << "Sum = " << sum << endl;

    return 0;
}
`,
  csharp: `using System;

class Program
{
    static void Main()
    {
        int a = 10;
        int b = 20;
        int sum = a + b;

        Console.WriteLine($"Sum = {sum}");
    }
}
`,
}

export const LANGUAGES = {
  c: {
    label: 'C',
    monacoLanguage: 'c',
    extension: 'c',
    fileName: 'main.c',
  },
  cpp: {
    label: 'C++',
    monacoLanguage: 'cpp',
    extension: 'cpp',
    fileName: 'main.cpp',
  },
  csharp: {
    label: 'C#',
    monacoLanguage: 'csharp',
    extension: 'cs',
    fileName: 'Program.cs',
  },
}

export const LANGUAGE_ORDER = ['c', 'cpp', 'csharp']
