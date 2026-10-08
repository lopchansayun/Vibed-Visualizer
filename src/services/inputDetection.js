const INPUT_PATTERNS = {
  c: [
    /\bscanf\s*\(/, /\bfscanf\s*\(\s*stdin\b/, /\bsscanf\s*\(/,
    /\bgetchar\s*\(/, /\bfgets\s*\(/,
  ],
  cpp: [
    /\b(?:std::)?cin\s*(?:>>|\.get\s*\(|\.getline\s*\()/,
    /\b(?:std::)?getline\s*\(/, /\bscanf\s*\(/, /\bgetchar\s*\(/,
  ],
  csharp: [
    /\bConsole\.(?:Read|ReadLine|ReadKey)\s*\(/,
  ],
  javascript: [
    /\b(?:readline|rl)\.(?:question|on)\s*\(/,
    /\bprocess\.stdin\b/, /\breadline\/promises\b/,
    /\bfs\.readFileSync\s*\(\s*(?:0|['"]?\/dev\/stdin)/,
  ],
  typescript: [
    /\b(?:readline|rl)\.(?:question|on)\s*\(/,
    /\bprocess\.stdin\b/, /\breadline\/promises\b/,
    /\bfs\.readFileSync\s*\(\s*(?:0|['"]?\/dev\/stdin)/,
  ],
  rust: [
    /\bstdin\s*\(\s*\)\s*\.\s*(?:read_line|read_to_string)\s*\(/,
    /\bstd::io::stdin\b/, /\buse\s+std::io::[^;]*(?:Read|BufRead)/,
  ],
  go: [
    /\bfmt\.(?:Scan|Scanln|Scanf|Fscan|Fscanln|Fscanf)\s*\(/,
    /\b(?:bufio\.)?NewScanner\s*\(/, /\bScanner\s*\{/, /\bos\.Stdin\b/,
  ],
  php: [
    /\bfgets\s*\(\s*STDIN\s*\)/, /\breadline\s*\(/, /\bSTDIN\b/,
  ],
  java: [
    /\bnew\s+Scanner\s*\(\s*System\.in\s*\)/,
    /\bScanner\s+\w+\s*=/, /\bSystem\.in\b/,
    /\bBufferedReader\b/, /\bInputStreamReader\s*\(\s*System\.in/,
  ],
  python: [
    /\binput\s*\(/, /\bsys\.stdin\b/, /\bstdin\.read(?:line|lines)?\s*\(/,
  ],
  lua: [
    /\bio\.read\s*\(/, /\bio\.stdin\b/,
  ],
}

export const INPUT_SUPPORTED_LANGUAGES = Object.keys(INPUT_PATTERNS)

export function codeNeedsInput(language, code = '') {
  const patterns = INPUT_PATTERNS[language]
  if (!patterns) return false
  return patterns.some((pattern) => pattern.test(code))
}
