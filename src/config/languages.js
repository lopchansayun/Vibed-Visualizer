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
}

export const LANGUAGES = {
  c: {
    label: 'C',
    monacoLanguage: 'c',
    extension: 'c',
    fileName: 'main.c',
  },
}

export const LANGUAGE_ORDER = ['c']
