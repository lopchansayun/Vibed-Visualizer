// Educational C / C++ / C# interpreter used by the memory visualizer.
// It intentionally executes a useful, deterministic subset of the languages
// instead of pretending to be a native compiler. The goal is real control-flow
// semantics plus a visible stack/heap/pointer model.

const MAX_STEPS = 2500;
const MAX_LOOP_ITERATIONS = 5000;
const MAX_CALL_DEPTH = 100;
const STACK_BASE = 0x7ffe6a3b2c80;
const STACK_STRIDE = 0x8;
const HEAP_BASE = 0x55b8c3a01000;
const HEAP_STRIDE = 0x20;

export function fmtAddr(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return String(n);
  return "0x" + Math.trunc(n).toString(16);
}

export class InterpError extends Error {
  constructor(message, line = undefined) {
    super(message);
    this.line = line;
  }
}

const TYPES = new Set([
  "void",
  "bool",
  "char",
  "signed",
  "unsigned",
  "short",
  "int",
  "long",
  "float",
  "double",
  "string",
  "auto",
  "var",
  "size_t",
  "std::string",
  "std::size_t",
  "std::vector",
  "std::array",
  "std::deque",
  "std::list",
  "std::set",
  "std::map",
  "std::unordered_map",
  "std::unordered_set",
  "std::stack",
  "std::queue",
  "std::pair",
]);

const TYPE_WORDS =
  /^(?:(?:const|static|volatile|register|extern|mutable|constexpr|signed|unsigned|short|long)\s+)*(?:void|bool|char|signed|unsigned|short|int|long|float|double|string|auto|var|size_t|std::string|std::size_t)(?:\s+long|\s+int)?$/;

function isTypeStart(s) {
  const x = s.trim().replace(/\s+/g, " ");
  if (TYPE_WORDS.test(x)) return true;
  if (/^(?:struct|enum)\s+\w+$/.test(x)) return true;
  return false;
}

function stripCommentsAndPreprocessor(code) {
  const macros = {};
  let out = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out
    .split("\n")
    .map((line) => {
      const m = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/);
      if (m) {
        macros[m[1]] = m[2].trim();
        return "";
      }
      return line.trimStart().startsWith("#") ? "" : line;
    })
    .join("\n");
  // Educational constant-macro support. Function-like/conditional macros remain intentionally unsupported.
  for (const [name, value] of Object.entries(macros)) {
    out = out.replace(new RegExp(`\\b${name}\\b`, "g"), value);
  }
  return out
    .split("\n")
    .map((line) => {
      let inStr = false,
        quote = "";
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if ((c === '"' || c === "'") && line[i - 1] !== "\\") {
          if (!inStr) {
            inStr = true;
            quote = c;
          } else if (quote === c) inStr = false;
        }
        if (!inStr && c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function lex(src) {
  const tokens = [];
  let i = 0;
  const lineAt = (p) => src.slice(0, p).split("\n").length;
  const two = [
    "++",
    "--",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "<<",
    ">>",
    "->",
    "::",
    "&=",
    "|=",
    "^=",
    "<<=",
    ">>=",
  ];
  const three = ["<<=", ">>=", "..."];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i++;
      let value = "";
      while (i < src.length) {
        if (src[i] === "\\" && i + 1 < src.length) {
          const e = src[i + 1];
          const map = {
            n: "\n",
            r: "\r",
            t: "\t",
            0: "\0",
            "\\": "\\",
            '"': '"',
            "'": "'",
          };
          value += map[e] ?? e;
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        value += src[i++];
      }
      tokens.push({
        type: quote === '"' ? "string" : "char",
        value,
        line: lineAt(start),
      });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const start = i;
      i++;
      while (i < src.length && /[0-9A-Fa-fxX.eE_]/.test(src[i])) i++;
      const raw = src.slice(start, i).replace(/_/g, "");
      const value = /^0x/i.test(raw) ? parseInt(raw, 16) : Number(raw);
      tokens.push({
        type: "number",
        value: Number.isNaN(value) ? 0 : value,
        line: lineAt(start),
      });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i++;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      tokens.push({
        type: "id",
        value: src.slice(start, i),
        line: lineAt(start),
      });
      continue;
    }
    const t3 = src.slice(i, i + 3),
      t2 = src.slice(i, i + 2);
    if (three.includes(t3)) {
      tokens.push({ type: "op", value: t3, line: lineAt(i) });
      i += 3;
      continue;
    }
    if (two.includes(t2)) {
      tokens.push({ type: "op", value: t2, line: lineAt(i) });
      i += 2;
      continue;
    }
    tokens.push({ type: "op", value: c, line: lineAt(i) });
    i++;
  }
  tokens.push({ type: "eof", value: "<eof>", line: lineAt(src.length) });
  return tokens;
}

class Parser {
  constructor(tokens, source, knownTypes = new Set()) {
    this.t = tokens;
    this.i = 0;
    this.source = source;
    this.knownTypes = knownTypes;
  }
  peek(n = 0) {
    return this.t[Math.min(this.i + n, this.t.length - 1)];
  }
  take() {
    return this.t[this.i++];
  }
  is(v) {
    return this.peek().value === v;
  }
  eat(v) {
    if (this.is(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  expect(v) {
    if (!this.eat(v))
      throw new InterpError(
        `expected '${v}', got '${this.peek().value}'`,
        this.peek().line,
      );
  }
  line() {
    return this.peek().line;
  }

  parseProgram(stop = "}") {
    const out = [];
    while (this.peek().type !== "eof" && !this.is(stop)) {
      if (this.eat(";")) continue;
      const s = this.parseStatement();
      if (s) out.push(s);
    }
    if (stop !== "}" && this.peek().type === "eof") return out;
    return out;
  }

  parseBlock() {
    this.expect("{");
    const body = this.parseProgram("}");
    this.expect("}");
    return body;
  }

  parseStatement() {
    const line = this.line();
    if (this.is("{")) return { type: "block", line, body: this.parseBlock() };
    if (this.is("if")) {
      this.take();
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      const then = this.parseStatement();
      let otherwise = null;
      if (this.eat("else")) otherwise = this.parseStatement();
      return { type: "if", line, cond, then, else: otherwise };
    }
    if (this.is("for")) return this.parseFor();
    if (this.is("while")) {
      this.take();
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      return { type: "while", line, cond, body: this.parseStatement() };
    }
    if (this.is("do")) {
      this.take();
      const body = this.parseStatement();
      this.expect("while");
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      this.eat(";");
      return { type: "do", line, body, cond };
    }
    if (this.is("switch")) return this.parseSwitch();
    if (this.is("throw")) {
      this.take();
      const expr = this.is(";")
        ? { type: "literal", value: 0 }
        : this.parseExpression();
      this.expect(";");
      return { type: "throw", line, expr };
    }
    if (this.is("try")) return this.parseTry();
    if (this.is("return")) {
      this.take();
      const expr = this.is(";") ? null : this.parseExpression();
      this.expect(";");
      return { type: "return", line, expr };
    }
    if (this.is("delete")) {
      this.take();
      const array = this.eat("[") ? (this.expect("]"), true) : false;
      const target = this.parseExpression();
      this.expect(";");
      return { type: "delete", line, target, array };
    }
    if (
      this.is("cout") ||
      (this.is("std") &&
        this.peek(1).value === "::" &&
        this.peek(2).value === "cout")
    )
      return this.parseCout();
    if (
      this.is("cin") ||
      (this.is("std") &&
        this.peek(1).value === "::" &&
        this.peek(2).value === "cin")
    )
      return this.parseCin();
    if (this.is("Console")) return this.parseConsolePrint();
    if (this.is("break")) {
      this.take();
      this.expect(";");
      return { type: "break", line };
    }
    if (this.is("continue")) {
      this.take();
      this.expect(";");
      return { type: "continue", line };
    }
    if (this.is("case") || this.is("default")) return null;
    const decl = this.tryDeclaration();
    if (decl) {
      this.expect(";");
      return { ...decl, line };
    }
    const expr = this.parseExpression();
    this.expect(";");
    return { type: "expr", line, expr };
  }

  parseCin() {
    const line = this.line();
    this.take();
    if (this.is("::")) {
      this.take();
      this.expect("cin");
    }
    const groups = [];
    let cur = [];
    let depth = 0;
    while (!this.is(";") && this.peek().type !== "eof") {
      const t = this.take();
      if (t.value === "(" || t.value === "[") depth++;
      if (t.value === ")" || t.value === "]") depth--;
      if (t.value === ">>" && depth === 0) {
        groups.push(cur);
        cur = [];
      } else cur.push(t);
    }
    groups.push(cur);
    this.expect(";");
    const targets = groups
      .filter((g) => g.length)
      .map((g) => {
        g.push({ type: "eof", value: "<eof>", line: g.at(-1)?.line || line });
        return new Parser(g, "").parseExpression();
      });
    return { type: "input", line, targets };
  }
  parseCout() {
    const line = this.line();
    this.take();
    if (this.is("::")) {
      this.take();
      this.expect("cout");
    }
    const groups = [];
    let cur = [];
    let depth = 0;
    while (!this.is(";") && this.peek().type !== "eof") {
      const t = this.take();
      if (t.value === "(" || t.value === "[") depth++;
      if (t.value === ")" || t.value === "]") depth--;
      if (t.value === "<<" && depth === 0) {
        groups.push(cur);
        cur = [];
      } else cur.push(t);
    }
    groups.push(cur);
    this.expect(";");
    const parts = groups
      .filter((g) => g.length)
      .map((g) => {
        if (
          (g.length === 1 && g[0].value === "endl") ||
          (g.length === 3 &&
            g[0].value === "std" &&
            g[1].value === "::" &&
            g[2].value === "endl")
        )
          return { type: "endl" };
        g.push({ type: "eof", value: "<eof>", line: g.at(-1)?.line || line });
        return { type: "expr", expr: new Parser(g, "").parseExpression() };
      });
    return { type: "print", line, kind: "cout", parts };
  }
  parseConsolePrint() {
    const line = this.line();
    const target = this.take().value;
    this.expect(".");
    const method = this.take().value;
    if (method !== "Write" && method !== "WriteLine")
      throw new InterpError(`unsupported Console method '${method}'`, line);
    this.expect("(");
    const args = [];
    while (!this.is(")")) {
      args.push(this.parseExpression());
      if (!this.eat(",")) break;
    }
    this.expect(")");
    this.expect(";");
    return { type: "print", line, kind: method, args };
  }

  parseTry() {
    const line = this.line();
    this.take();
    const body = this.parseStatement();
    const catches = [];
    while (this.eat("catch")) {
      this.expect("(");
      const parts = [];
      let depth = 0;
      while (!this.is(")") && this.peek().type !== "eof") {
        const t = this.take();
        if (t.value === "<" || t.value === "(") depth++;
        if (t.value === ">" || t.value === ")") depth--;
        parts.push(t);
      }
      this.expect(")");
      const ids = parts.filter((t) => t.type === "id").map((t) => t.value);
      const name = ids.at(-1) || null;
      catches.push({
        name,
        type: ids.slice(0, -1).join(" "),
        body: this.parseStatement(),
        line,
      });
    }
    if (!catches.length)
      throw new InterpError("try must be followed by catch", line);
    return { type: "try", line, body, catches };
  }

  parseFor() {
    const line = this.line();
    this.take();
    this.expect("(");
    // C++ range-for: for (auto x : container)
    const save = this.i;
    let rangeType = [];
    while (
      this.peek().type === "id" &&
      (TYPES.has(this.peek().value) ||
        this.knownTypes.has(this.peek().value) ||
        ["const", "auto"].includes(this.peek().value))
    )
      rangeType.push(this.take().value);
    while (this.is("&")) rangeType.push(this.take().value);
    const rangeName = this.peek().type === "id" ? this.take().value : null;
    if (rangeName && this.eat(":")) {
      const iterable = this.parseExpression();
      this.expect(")");
      const body = this.parseStatement();
      return {
        type: "rangeFor",
        line,
        name: rangeName,
        dataType: rangeType.join(" ") || "auto",
        iterable,
        body,
      };
    }
    this.i = save;
    let init = null;
    if (!this.is(";")) {
      init = this.tryDeclaration() || {
        type: "expr",
        expr: this.parseExpression(),
        line,
      };
    }
    this.expect(";");
    const cond = this.is(";")
      ? { type: "literal", value: 1 }
      : this.parseExpression();
    this.expect(";");
    const update = this.is(")") ? null : this.parseExpression();
    this.expect(")");
    const body = this.parseStatement();
    return { type: "for", line, init, cond, update, body };
  }

  parseSwitch() {
    const line = this.line();
    this.take();
    this.expect("(");
    const expr = this.parseExpression();
    this.expect(")");
    this.expect("{");
    const cases = [];
    let current = null;
    while (!this.is("}") && this.peek().type !== "eof") {
      const l = this.line();
      if (this.eat("case")) {
        const value = this.parseExpression();
        this.expect(":");
        current = { value, body: [], line: l };
        cases.push(current);
        continue;
      }
      if (this.eat("default")) {
        this.expect(":");
        current = { value: null, body: [], line: l };
        cases.push(current);
        continue;
      }
      const s = this.parseStatement();
      if (s && current) current.body.push(s);
      else if (s) throw new InterpError("statement before switch case", s.line);
    }
    this.expect("}");
    return { type: "switch", line, expr, cases };
  }

  tryDeclaration() {
    const save = this.i;
    let ptr = 0;
    const start = this.peek().value;
    if (
      start === "const" ||
      start === "static" ||
      start === "volatile" ||
      start === "constexpr"
    )
      this.take();
    let typeParts = [];
    while (
      this.peek().type === "id" &&
      (TYPES.has(this.peek().value) ||
        ["struct", "enum"].includes(this.peek().value))
    ) {
      typeParts.push(this.take().value);
      if (this.is("<")) {
        this.skipBalanced("<", ">");
      }
      if (this.is("*")) break;
    }
    if (
      !typeParts.length &&
      this.peek().value === "std" &&
      this.peek(1).value === "::" &&
      this.peek(2).type === "id"
    ) {
      typeParts.push(`std::${this.peek(2).value}`);
      this.take();
      this.take();
      this.take();
      if (this.is("<")) this.skipBalanced("<", ">");
    }
    if (
      !typeParts.length &&
      !(
        this.peek().type === "id" &&
        (this.peek(1).type === "id" ||
          this.peek(1).value === "*" ||
          this.peek(1).value === "&")
      )
    ) {
      this.i = save;
      return null;
    }
    if (
      !typeParts.length &&
      this.peek().type === "id" &&
      (this.knownTypes.has(this.peek().value) || this.peek(1).type === "id")
    )
      typeParts.push(this.take().value);
    while (this.eat("*")) ptr++;
    const reference = this.eat("&");
    if (this.peek().type !== "id") {
      this.i = save;
      return null;
    }
    const name = this.take().value;
    let dimensions = [];
    while (this.eat("[")) {
      dimensions.push(this.parseExpression());
      this.expect("]");
    }
    let initializer = null;
    if (this.eat("="))
      initializer = this.is("{")
        ? this.parseInitializerList()
        : this.parseExpression();
    else if (this.is("{")) initializer = this.parseInitializerList();
    else if (this.is("(")) {
      this.take();
      const args = [];
      while (!this.is(")")) {
        args.push(this.parseExpression());
        if (!this.eat(",")) break;
      }
      this.expect(")");
      initializer = { type: "constructorInit", args, line: this.line() };
    }
    return {
      type: "decl",
      name,
      dataType: typeParts.join(" "),
      pointerDepth: ptr,
      dimensions,
      initializer,
      reference,
    };
  }

  parseInitializerList() {
    this.expect("{");
    const values = [];
    while (!this.is("}") && this.peek().type !== "eof") {
      values.push(this.parseExpression());
      if (!this.eat(",")) break;
    }
    this.expect("}");
    return { type: "array", values };
  }

  skipBalanced(a, b) {
    let d = 0;
    do {
      const v = this.take().value;
      if (v === a) d++;
      if (v === b) d--;
    } while (d > 0 && this.peek().type !== "eof");
  }

  parseExpression() {
    return this.parseAssignment();
  }
  parseAssignment() {
    let left = this.parseTernary();
    if (
      [
        "=",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "&=",
        "|=",
        "^=",
        "<<=",
        ">>=",
      ].includes(this.peek().value)
    ) {
      const op = this.take().value;
      const right = this.parseAssignment();
      return { type: "assignExpr", op, left, right };
    }
    return left;
  }
  parseTernary() {
    let c = this.parseLogicalOr();
    if (this.eat("?")) {
      const yes = this.parseExpression();
      this.expect(":");
      const no = this.parseExpression();
      return { type: "ternary", cond: c, yes, no };
    }
    return c;
  }
  parseLogicalOr() {
    return this.binary(this.parseLogicalAnd, ["||"]);
  }
  parseLogicalAnd() {
    return this.binary(this.parseBitOr, ["&&"]);
  }
  parseBitOr() {
    return this.binary(this.parseBitXor, ["|"]);
  }
  parseBitXor() {
    return this.binary(this.parseBitAnd, ["^"]);
  }
  parseBitAnd() {
    return this.binary(this.parseEquality, ["&"]);
  }
  parseEquality() {
    return this.binary(this.parseRelational, ["==", "!="]);
  }
  parseRelational() {
    return this.binary(this.parseShift, ["<", ">", "<=", ">="]);
  }
  parseShift() {
    return this.binary(this.parseAdd, ["<<", ">>"]);
  }
  parseAdd() {
    return this.binary(this.parseMul, ["+", "-"]);
  }
  parseMul() {
    return this.binary(this.parseUnary, ["*", "/", "%"]);
  }
  binary(next, ops) {
    let left = next.call(this);
    while (ops.includes(this.peek().value)) {
      const op = this.take().value;
      const right = next.call(this);
      left = { type: "binary", op, left, right };
    }
    return left;
  }
  parseUnary() {
    const line = this.line();
    const v = this.peek().value;
    if (["!", "-", "+", "~", "&", "*", "++", "--"].includes(v)) {
      this.take();
      return { type: "unary", op: v, expr: this.parseUnary(), line };
    }
    // Basic C-style cast: (int), (double), (int*), etc.
    if (
      this.is("(") &&
      this.peek(1).type === "id" &&
      (TYPES.has(this.peek(1).value) ||
        this.peek(1).value === "unsigned" ||
        this.peek(1).value === "signed")
    ) {
      const save = this.i;
      this.take();
      let parts = [];
      while (this.peek().type === "id" || this.is("*"))
        parts.push(this.take().value);
      if (this.eat(")"))
        return {
          type: "cast",
          dataType: parts.join(" "),
          expr: this.parseUnary(),
        };
      this.i = save;
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let node = this.parsePrimary();
    while (true) {
      if (this.eat("(")) {
        const args = [];
        while (!this.is(")")) {
          args.push(this.parseExpression());
          if (!this.eat(",")) break;
        }
        this.expect(")");
        node = { type: "call", callee: node, args };
        continue;
      }
      if (this.eat("[")) {
        const index = this.parseExpression();
        this.expect("]");
        node = { type: "index", target: node, index };
        continue;
      }
      if (this.eat(".")) {
        const prop = this.take().value;
        node = { type: "member", target: node, prop };
        continue;
      }
      if (this.eat("->")) {
        const prop = this.take().value;
        node = { type: "memberPtr", target: node, prop };
        continue;
      }
      if (this.is("++") || this.is("--")) {
        node = { type: "postfix", op: this.take().value, expr: node };
        continue;
      }
      break;
    }
    return node;
  }
  parsePrimary() {
    const t = this.take();
    if (t.type === "number") return { type: "literal", value: t.value };
    if (t.type === "string" || t.type === "char")
      return { type: "literal", value: t.value };
    if (t.type === "id") {
      if (t.value === "true") return { type: "literal", value: 1 };
      if (t.value === "false") return { type: "literal", value: 0 };
      if (t.value === "nullptr" || t.value === "NULL")
        return { type: "literal", value: 0 };
      if (t.value === "new") {
        const typeParts = [];
        while (
          this.peek().type === "id" &&
          !["(", "[", ";"].includes(this.peek().value)
        )
          typeParts.push(this.take().value);
        let count = null;
        if (this.eat("[")) {
          count = this.parseExpression();
          this.expect("]");
        }
        let initArgs = [];
        if (this.eat("(")) {
          while (!this.is(")")) {
            initArgs.push(this.parseExpression());
            if (!this.eat(",")) break;
          }
          this.expect(")");
        }
        return {
          type: "new",
          dataType: typeParts.join(" "),
          count,
          initArgs,
          line: t.line,
        };
      }
      return { type: "var", name: t.value };
    }
    if (t.value === "(") {
      const e = this.parseExpression();
      this.expect(")");
      return e;
    }
    throw new InterpError(`unexpected token '${t.value}'`, t.line);
  }
}

function parseBalancedBody(tokens, start, clean, knownTypes) {
  let depth = 0;
  let end = start;
  for (; end < tokens.length; end++) {
    if (tokens[end].value === "{") depth++;
    else if (tokens[end].value === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const bodyTokens = tokens.slice(start + 1, end);
  bodyTokens.push({
    type: "eof",
    value: "<eof>",
    line: tokens[end]?.line || tokens[start]?.line || 1,
  });
  const bp = new Parser(bodyTokens, clean, knownTypes);
  return { body: bp.parseProgram(), end };
}

function extractEnumDefs(clean) {
  const tokens = lex(clean),
    defs = {},
    ranges = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value !== "enum") continue;
    let j = i + 1;
    if (tokens[j]?.value === "class" || tokens[j]?.value === "struct") j++;
    const name = tokens[j];
    if (!name || name.type !== "id" || tokens[j + 1]?.value !== "{") continue;
    let k = j + 2,
      value = 0,
      map = {};
    while (k < tokens.length && tokens[k].value !== "}") {
      if (tokens[k].type === "id") {
        const key = tokens[k].value;
        if (tokens[k + 1]?.value === "=") {
          const n = tokens[k + 2]?.value;
          value = Number.isFinite(Number(n)) ? Number(n) : value;
          k += 3;
        } else k++;
        map[key] = value++;
        if (tokens[k]?.value === ",") k++;
      } else k++;
    }
    if (tokens[k]?.value !== "}") continue;
    defs[name.value] = map;
    ranges.push({ start: tokens[i].line, end: tokens[k].line });
    i = k;
  }
  return { defs, ranges };
}

function extractClassDefs(clean) {
  const tokens = lex(clean);
  const defs = {};
  const ranges = [];

  for (let i = 0; i < tokens.length; i++) {
    if (!["class", "struct"].includes(tokens[i].value)) continue;
    const nameTok = tokens[i + 1];
    if (!nameTok || nameTok.type !== "id") continue;
    let brace = i + 2;
    const bases = [];
    if (tokens[brace]?.value === ":") {
      brace++;
      let current = [];
      while (brace < tokens.length && tokens[brace].value !== "{") {
        const v = tokens[brace].value;
        if (v === ",") {
          const base = current
            .filter(
              (x) => x !== "public" && x !== "private" && x !== "protected",
            )
            .at(-1);
          if (base) bases.push(base);
          current = [];
        } else current.push(v);
        brace++;
      }
      const base = current
        .filter((x) => x !== "public" && x !== "private" && x !== "protected")
        .at(-1);
      if (base) bases.push(base);
    }
    if (tokens[brace]?.value !== "{") continue;
    const { body: bodyTokens, end } = (() => {
      let depth = 0,
        e = brace;
      for (; e < tokens.length; e++) {
        if (tokens[e].value === "{") depth++;
        else if (tokens[e].value === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return { body: tokens.slice(brace + 1, e), end: e };
    })();

    const def = {
      name: nameTok.value,
      kind: tokens[i].value,
      bases,
      fields: {},
      methods: {},
      overloadedMethods: {},
      line: nameTok.line,
    };
    let j = 0;
    while (j < bodyTokens.length) {
      if (
        ["public", "private", "protected"].includes(bodyTokens[j].value) &&
        bodyTokens[j + 1]?.value === ":"
      ) {
        j += 2;
        continue;
      }
      // Method / constructor / destructor at class scope.
      let open = -1,
        d = 0;
      for (let k = j; k < bodyTokens.length; k++) {
        if (bodyTokens[k].value === "(") {
          open = k;
          break;
        }
        if (bodyTokens[k].value === ";") break;
      }
      if (open >= 0) {
        let par = 0,
          close = -1;
        for (let k = open; k < bodyTokens.length; k++) {
          if (bodyTokens[k].value === "(") par++;
          else if (bodyTokens[k].value === ")") {
            par--;
            if (par === 0) {
              close = k;
              break;
            }
          }
        }
        if (close >= 0) {
          while (
            ["override", "final", "const", "noexcept"].includes(
              bodyTokens[close + 1]?.value,
            )
          )
            close++;
        }
        if (close >= 0 && bodyTokens[close + 1]?.value === "{") {
          const before = bodyTokens.slice(j, open).map((t) => t.value);
          const name = before.at(-1);
          const methodName = before.at(-2) === "~" ? `~${name}` : name;
          if (name && !["if", "for", "while", "switch"].includes(name)) {
            const { body, end: methodEnd } = parseBalancedBody(
              bodyTokens,
              close + 1,
              clean,
              new Set([...TYPES, ...Object.keys(defs)]),
            );
            const params = parseParams(bodyTokens.slice(open + 1, close));
            const key = name.replace(/^~/, "");
            const methodDef = {
              name: methodName,
              params,
              body,
              line: bodyTokens[j]?.line || nameTok.line,
              returnType:
                before.length > 1 ? before.slice(0, -1).join(" ") : "",
              constructor: methodName === def.name,
              destructor: methodName === `~${def.name}`,
            };
            if (def.methods[methodName]) {
              def.methods[methodName] = Array.isArray(def.methods[methodName])
                ? [...def.methods[methodName], methodDef]
                : [def.methods[methodName], methodDef];
              def.overloadedMethods[methodName] = true;
            } else def.methods[methodName] = methodDef;
            j = methodEnd + 1;
            continue;
          }
        }
      }
      // Field declaration: consume to the next semicolon at class scope.
      let endStmt = j,
        braceDepth = 0;
      for (; endStmt < bodyTokens.length; endStmt++) {
        const v = bodyTokens[endStmt].value;
        if (v === "{") braceDepth++;
        if (v === "}") braceDepth--;
        if (v === ";" && braceDepth === 0) break;
      }
      const part = bodyTokens.slice(j, endStmt);
      try {
        const fieldTokens = [
          ...part,
          {
            type: "eof",
            value: "<eof>",
            line: part.at(-1)?.line || nameTok.line,
          },
        ];
        const fp = new Parser(
          fieldTokens,
          clean,
          new Set([...TYPES, ...Object.keys(defs)]),
        );
        const field = fp.tryDeclaration();
        if (field?.name && field.type === "decl") {
          def.fields[field.name] = {
            type: field.dataType,
            initializer: field.initializer,
          };
        }
      } catch {}
      j = endStmt + 1;
    }
    defs[def.name] = def;
    // Blank the entire class declaration from the free-function token scan.
    ranges.push({ kind: tokens[i].value, name: nameTok.value });
    i = end;
  }
  return { defs, ranges };
}

function blankTokenRanges(clean, tokens, ranges) {
  if (!ranges.length) return clean;
  const chars = clean.split("");
  let searchFrom = 0;
  for (const range of ranges) {
    const header = new RegExp(`\\b(?:class|struct)\\s+${range.name}\\b`);
    const tail = clean.slice(searchFrom).match(header);
    if (!tail) continue;
    const start = searchFrom + tail.index;
    const brace = clean.indexOf("{", start);
    if (brace < 0) continue;
    let depth = 0,
      end = brace;
    let quote = null;
    for (; end < clean.length; end++) {
      const c = clean[end];
      if (quote) {
        if (c === "\\") end++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          if (clean[end + 1] === ";") end++;
          break;
        }
      }
    }
    for (let i = start; i <= end; i++) if (chars[i] !== "\n") chars[i] = " ";
    searchFrom = end + 1;
  }
  return chars.join("");
}

function collectFunctions(code, language) {
  let clean = stripCommentsAndPreprocessor(code);
  const enumInfo = extractEnumDefs(clean);
  const { defs: classDefs, ranges } = extractClassDefs(clean);
  clean = blankTokenRanges(clean, lex(clean), ranges);
  // Blank enum declarations while preserving line numbers, including multiple declarations on one line.
  clean = clean.replace(
    /\benum(?:\s+(?:class|struct))?\s+[A-Za-z_]\w*\s*\{[^{}]*\}\s*;?/g,
    (m) => m.replace(/[^\n]/g, " "),
  );
  const knownTypes = new Set([
    ...Object.keys(classDefs),
    ...Object.keys(enumInfo.defs),
    ...TYPES,
  ]);
  const tokens = lex(clean);
  const parser = new Parser(tokens, clean, knownTypes);
  const functions = {};
  for (let i = 0; i < tokens.length; i++) {
    if (
      tokens[i].type !== "id" ||
      ["if", "for", "while", "switch"].includes(tokens[i].value)
    )
      continue;
    let open = i + 1;
    if (tokens[open]?.value === "::") {
      open += 2;
    }
    if (tokens[open]?.value !== "(") continue;
    let d = 0,
      j = open;
    for (; j < tokens.length; j++) {
      if (tokens[j].value === "(") d++;
      else if (tokens[j].value === ")") {
        d--;
        if (d === 0) break;
      }
    }
    if (tokens[j + 1]?.value !== "{") continue;
    const name = tokens[i].value;
    const params = parseParams(tokens.slice(open + 1, j));
    const { body, end } = parseBalancedBody(tokens, j + 1, clean, knownTypes);
    const fnDef = {
      name,
      params,
      body,
      line: tokens[i].line,
      returnType: "int",
    };
    functions[name] = functions[name]
      ? Array.isArray(functions[name])
        ? [...functions[name], fnDef]
        : [functions[name], fnDef]
      : fnDef;
    i = end;
  }
  if (!functions.main && functions.Main) functions.main = functions.Main;
  if (!functions.main)
    throw new InterpError("Could not find a main() / Main() entry point.", 1);
  functions.__structDefs = classDefs;
  functions.__enumDefs = enumInfo.defs;
  return functions;
}

function parseParams(tokens) {
  const groups = [];
  let cur = [];
  let d = 0;
  for (const t of tokens) {
    if (t.value === "<" || t.value === "(") d++;
    if (t.value === ">" || t.value === ")") d--;
    if (t.value === "," && d === 0) {
      groups.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length && !(cur.length === 1 && cur[0].value === "void"))
    groups.push(cur);
  return groups.map((g) => {
    const ids = g.filter((t) => t.type === "id").map((t) => t.value);
    const name = ids[ids.length - 1] || `arg${g[0]?.line || 0}`;
    const pointerDepth = g.filter((t) => t.value === "*").length;
    return { name, pointerDepth, reference: g.some((t) => t.value === "&") };
  });
}

function valueToString(v) {
  if (Array.isArray(v)) return `[${v.map(valueToString).join(", ")}]`;
  if (v && typeof v === "object" && v.__struct)
    return `{ ${Object.entries(v.fields)
      .map(([k, x]) => `${k}: ${valueToString(x)}`)
      .join(", ")} }`;
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(8)));
  if (v === undefined) return "undefined";
  return String(v);
}

function runInterpreter(code, language = "cpp", stdin = "") {
  const clean = stripCommentsAndPreprocessor(code);
  let functions;
  try {
    functions = collectFunctions(clean, language);
  } catch (err) {
    if (err instanceof InterpError) {
      err.mockUnsupported = err.mockUnsupported !== false;
      throw err;
    }
    throw err;
  }

  const heap = [];
  const heapByAddress = {};
  let heapAllocCount = 0;
  const steps = [];
  let stdout = "";
  let stepCount = 0;
  let returned = false;
  const inputQueue = String(stdin || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let inputPos = 0;
  let stackAddressCount = 0;
  const callFrames = [];
  const ctx = { heap, heapByAddress, functions };

  function allocateHeap(size, value = 0, kind = "malloc") {
    size = Math.max(1, Math.trunc(Number(size) || 1));
    const addr = HEAP_BASE + heapAllocCount * HEAP_STRIDE;
    heapAllocCount++;
    const block = {
      address: addr,
      value:
        size > 1
          ? Array.from({ length: size }, () => clone(value))
          : clone(value),
      freed: false,
      size,
      kind,
    };
    heap.push(block);
    heapByAddress[addr] = heap.length - 1;
    return addr;
  }
  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === "object") return JSON.parse(JSON.stringify(v));
    return v;
  }
  function findBlock(addr) {
    return addr in heapByAddress ? heap[heapByAddress[addr]] : null;
  }

  function snapshot(line, note) {
    steps.push({
      line,
      note,
      stack: frameVars().map((v) => ({
        ...v,
        frame: callFrames.find((f) =>
          Array.from(f.values.values()).some((s) => s.address === v.address),
        )?.name,
      })),
      heap: heap.map((b) => ({ ...b, value: clone(b.value) })),
      callStack: callFrames.map((f) => f.name),
      stdoutSoFar: stdout,
    });
  }
  function guard(line) {
    stepCount++;
    if (stepCount > MAX_STEPS) {
      const e = new InterpError(
        `execution stopped after ${MAX_STEPS} steps (possible infinite loop)`,
        line,
      );
      e.mockUnsupported = false;
      throw e;
    }
  }

  function currentThisObject(frame) {
    for (let i = callFrames.length - 1; i >= 0; i--) {
      const f = callFrames[i];
      const slot = f.scopes
        .flatMap((s) => Array.from(s.values()))
        .find((s) => s.name === "this");
      if (slot) {
        const value = slot.isPointer
          ? findBlock(slot.value)?.value
          : slot.value;
        if (value?.__struct) return value;
      }
    }
    return null;
  }

  function resolveVar(name, frame) {
    for (let i = callFrames.length - 1; i >= 0; i--) {
      const f = callFrames[i];
      for (let j = f.scopes.length - 1; j >= 0; j--) {
        if (f.scopes[j].has(name))
          return { frame: f, slot: f.scopes[j].get(name) };
      }
    }
    const obj = currentThisObject(frame);
    if (obj?.fields && Object.prototype.hasOwnProperty.call(obj.fields, name))
      return {
        frame,
        slot: {
          name,
          value: obj.fields[name],
          isPointer: false,
          type: obj.type,
          field: true,
          obj,
        },
      };
    throw new InterpError(`'${name}' is not defined`, frame?.line);
  }
  function makeSlot(
    frame,
    name,
    value,
    { pointer = false, reference = null, type = "auto", address = null } = {},
  ) {
    if (!address) {
      address = STACK_BASE - stackAddressCount * STACK_STRIDE;
      stackAddressCount++;
    }
    const slot = { name, value, address, isPointer: pointer, reference, type };
    frame.values.set(name, slot);
    frame.scopes.at(-1).set(name, slot);
    return slot;
  }
  function frameVars() {
    return callFrames
      .flatMap((f) =>
        Array.from(f.values.values()).map((s) => ({
          name: s.name,
          value: clone(s.value),
          address: s.address,
          isPointer: s.isPointer,
          type: s.type,
          reference: s.reference,
        })),
      )
      .filter((v, i, a) => a.findIndex((x) => x.address === v.address) === i);
  }

  function deref(addr, line) {
    if (addr === 0 || addr === null || addr === undefined)
      throw new InterpError(
        "dereferenced null/invalid pointer (segmentation fault)",
        line,
      );
    const slot = callFrames
      .flatMap((f) => Array.from(f.values.values()))
      .find((s) => s.address === addr);
    if (slot) return slot.value;
    const block = findBlock(addr);
    if (block) {
      if (block.freed)
        throw new InterpError(
          `dereferenced freed memory at ${fmtAddr(addr)} (use-after-free)`,
          line,
        );
      return Array.isArray(block.value) ? block.value[0] : block.value;
    }
    throw new InterpError(
      `invalid dereference of ${fmtAddr(addr)} (segmentation fault)`,
      line,
    );
  }
  function writeAddr(addr, value, line) {
    const slot = callFrames
      .flatMap((f) => Array.from(f.values.values()))
      .find((s) => s.address === addr);
    if (slot) {
      slot.value = clone(value);
      return;
    }
    const block = findBlock(addr);
    if (block) {
      if (block.freed)
        throw new InterpError(
          `write to freed memory at ${fmtAddr(addr)} (use-after-free)`,
          line,
        );
      if (Array.isArray(block.value)) block.value[0] = clone(value);
      else block.value = clone(value);
      return;
    }
    throw new InterpError(
      `invalid write to ${fmtAddr(addr)} (segmentation fault)`,
      line,
    );
  }

  function pointerTarget(node, frame) {
    if (node?.type === "binary" && (node.op === "+" || node.op === "-")) {
      const base = evalNode(node.left, frame);
      const offset =
        Math.trunc(evalNode(node.right, frame)) * (node.op === "-" ? -1 : 1);
      const b = findBlock(base);
      if (b)
        return {
          block: b,
          index: offset,
          address: base + offset * HEAP_STRIDE,
        };
    }
    return null;
  }

  function lvalue(node, frame) {
    if (node.type === "var") {
      const r = resolveVar(node.name, frame);
      if (r.slot.field) {
        return {
          get: () => r.slot.obj.fields[r.slot.name],
          set: (v) => {
            r.slot.obj.fields[r.slot.name] = clone(v);
          },
          address: 0,
          slot: r.slot,
        };
      }
      if (r.slot.reference) {
        return {
          get: () => deref(r.slot.reference, node.line),
          set: (v) => writeAddr(r.slot.reference, v, node.line),
          address: r.slot.reference,
          slot: r.slot,
        };
      }
      return {
        get: () => r.slot.value,
        set: (v) => {
          r.slot.value = clone(v);
        },
        address: r.slot.address,
        slot: r.slot,
      };
    }
    if (node.type === "unary" && node.op === "*") {
      const pt = pointerTarget(node.expr, frame);
      if (pt) {
        if (pt.block.freed)
          throw new InterpError(
            "dereferenced freed memory (use-after-free)",
            node.line,
          );
        const arr = Array.isArray(pt.block.value)
          ? pt.block.value
          : [pt.block.value];
        if (pt.index < 0 || pt.index >= arr.length)
          throw new InterpError(
            `pointer arithmetic out of bounds (index ${pt.index})`,
            node.line,
          );
        return {
          get: () => arr[pt.index],
          set: (v) => {
            arr[pt.index] = clone(v);
          },
          address: pt.address,
        };
      }
      const addr = evalNode(node.expr, frame);
      return {
        get: () => deref(addr, node.line),
        set: (v) => writeAddr(addr, v, node.line),
        address: addr,
      };
    }
    if (node.type === "index") {
      const base = evalNode(node.target, frame);
      const idx = Math.trunc(evalNode(node.index, frame));
      const targetSlot =
        node.target.type === "var"
          ? resolveVar(node.target.name, frame).slot
          : null;
      const b = findBlock(base);
      if (b) {
        if (b.freed)
          throw new InterpError(
            "invalid array access: freed memory",
            node.line,
          );
        const arr = Array.isArray(b.value) ? b.value : [b.value];
        if (idx < 0 || idx >= arr.length)
          throw new InterpError(
            `index ${idx} out of bounds (size ${arr.length})`,
            node.line,
          );
        return {
          get: () => arr[idx],
          set: (v) => {
            arr[idx] = clone(v);
          },
          address: base + idx,
        };
      }
      if (targetSlot && Array.isArray(targetSlot.value)) {
        const arr = targetSlot.value;
        if (idx < 0 || idx >= arr.length)
          throw new InterpError(
            `index ${idx} out of bounds (size ${arr.length})`,
            node.line,
          );
        return {
          get: () => arr[idx],
          set: (v) => {
            arr[idx] = clone(v);
          },
          address: targetSlot.address + idx,
        };
      }
      throw new InterpError("invalid array access", node.line);
    }
    if (node.type === "member" || node.type === "memberPtr") {
      let obj =
        node.type === "memberPtr"
          ? evalNode(node.target, frame)
          : evalNode(node.target, frame);
      if (node.type === "memberPtr" && typeof obj === "number")
        obj = deref(obj, node.line);
      if (!obj || !obj.__struct)
        throw new InterpError(
          `member '${node.prop}' accessed on non-object`,
          node.line,
        );
      return {
        get: () => obj.fields[node.prop],
        set: (v) => {
          obj.fields[node.prop] = clone(v);
        },
      };
    }
    throw new InterpError("expression is not assignable", node.line);
  }

  function sizeofType(type) {
    const t = String(type || "").replace(/\s+/g, " ");
    if (/char|bool/.test(t)) return 1;
    if (/double/.test(t)) return 8;
    if (/long/.test(t)) return 8;
    return 4;
  }

  function collectClassFields(def, allDefs, seen = new Set()) {
    if (!def || seen.has(def.name)) return {};
    seen.add(def.name);
    const out = {};
    for (const base of def.bases || [])
      Object.assign(out, collectClassFields(allDefs[base], allDefs, seen));
    Object.assign(out, def.fields || {});
    return out;
  }

  function chooseOverload(fn, args) {
    const list = Array.isArray(fn) ? fn : [fn];
    return (
      list.find((x) => x && x.params.length === args.length) || list[0] || null
    );
  }

  function findMethod(typeName, methodName, seen = new Set(), args = []) {
    const def = functions.__structDefs?.[typeName];
    if (!def || seen.has(typeName)) return null;
    seen.add(typeName);
    if (def.methods?.[methodName])
      return { method: chooseOverload(def.methods[methodName], args), def };
    for (const base of def.bases || []) {
      const found = findMethod(base, methodName, seen, args);
      if (found) return found;
    }
    return null;
  }

  function runConstructor(typeName, obj, addr, argsNodes, caller) {
    if (!obj?.__struct) return;
    const def = functions.__structDefs?.[typeName];
    // Base constructors run first, matching normal C++ construction order.
    for (const base of def?.bases || [])
      runConstructor(base, obj, addr, [], caller);
    const found = findMethod(typeName, typeName);
    if (found?.method)
      invokeMethod(
        found.method,
        obj,
        addr,
        argsNodes,
        caller,
        `${typeName}::${typeName}()`,
      );
    snapshot(
      found?.method?.line || caller.line,
      `construct ${typeName} object${addr ? ` at ${fmtAddr(addr)}` : ""}`,
    );
  }

  function invokeMethod(method, obj, addr, argsNodes, caller, frameName) {
    if (callFrames.length >= MAX_CALL_DEPTH)
      throw new InterpError("maximum call depth exceeded", caller?.line);
    const frame = {
      name: frameName,
      values: new Map(),
      scopes: [new Map()],
      line: method.line,
    };
    callFrames.push(frame);
    makeSlot(frame, "this", addr ? addr : obj, {
      pointer: Boolean(addr),
      type: addr ? `${obj.type}*` : obj.type,
    });
    const values = argsNodes.map((a) => evalNode(a, caller));
    method.params.forEach((p, i) =>
      makeSlot(frame, p.name, values[i] ?? 0, {
        pointer: p.pointerDepth > 0,
        reference: p.reference,
        type: "parameter",
      }),
    );
    snapshot(method.line, `enter ${frameName}`);
    let result = 0;
    try {
      execList(method.body, frame);
      result = frame.__return ?? 0;
    } finally {
      snapshot(caller?.line || method.line, `return from ${frameName}`);
      callFrames.pop();
    }
    return result;
  }

  function evalNode(node, frame) {
    switch (node.type) {
      case "literal":
        return node.value;
      case "var": {
        try {
          const r = resolveVar(node.name, frame);
          return r.slot.field ? r.slot.obj.fields[r.slot.name] : r.slot.value;
        } catch {
          for (const values of Object.values(functions.__enumDefs || {}))
            if (Object.prototype.hasOwnProperty.call(values, node.name))
              return values[node.name];
          throw new InterpError(`'${node.name}' is not defined`, frame?.line);
        }
      }
      case "cast":
        return evalNode(node.expr, frame);
      case "new": {
        const count = node.count
          ? Math.max(1, Math.trunc(evalNode(node.count, frame)))
          : 1;
        const def = functions.__structDefs?.[node.dataType];
        if (def && !node.count) {
          const obj = { __struct: true, type: node.dataType, fields: {} };
          const allFields = collectClassFields(def, functions.__structDefs);
          for (const [k, meta] of Object.entries(allFields))
            obj.fields[k] = meta.initializer
              ? evalNode(meta.initializer, frame)
              : 0;
          const addr = allocateHeap(1, obj, "new-object");
          runConstructor(
            node.dataType,
            findBlock(addr)?.value,
            addr,
            node.initArgs || [],
            frame,
          );
          return addr;
        }
        const init = node.initArgs?.length
          ? evalNode(node.initArgs[0], frame)
          : 0;
        return allocateHeap(count, init, "new");
      }
      case "ternary":
        return evalNode(node.cond, frame)
          ? evalNode(node.yes, frame)
          : evalNode(node.no, frame);
      case "member":
        return lvalue(node, frame).get();
      case "memberPtr":
        return lvalue(node, frame).get();
      case "index":
        return lvalue(node, frame).get();
      case "unary": {
        if (node.op === "&") return lvalue(node.expr, frame).address;
        if (node.op === "*") {
          const pt = pointerTarget(node.expr, frame);
          if (pt) {
            if (pt.block.freed)
              throw new InterpError(
                "dereferenced freed memory (use-after-free)",
                node.line,
              );
            const arr = Array.isArray(pt.block.value)
              ? pt.block.value
              : [pt.block.value];
            if (pt.index < 0 || pt.index >= arr.length)
              throw new InterpError(
                `pointer arithmetic out of bounds (index ${pt.index})`,
                node.line,
              );
            return arr[pt.index];
          }
          return deref(evalNode(node.expr, frame), node.line);
        }
        if (node.op === "++" || node.op === "--") {
          const lv = lvalue(node.expr, frame);
          const old = Number(lv.get() || 0);
          const n =
            old +
            (node.op === "++"
              ? lv.slot?.isPointer
                ? HEAP_STRIDE
                : 1
              : lv.slot?.isPointer
                ? -HEAP_STRIDE
                : -1);
          lv.set(n);
          return n;
        }
        const v = evalNode(node.expr, frame);
        if (node.op === "!") return v ? 0 : 1;
        if (node.op === "-") return -v;
        if (node.op === "+") return +v;
        if (node.op === "~") return ~v;
        return v;
      }
      case "postfix": {
        const lv = lvalue(node.expr, frame);
        const old = lv.get();
        lv.set(
          Number(old || 0) +
            (node.op === "++"
              ? lv.slot?.isPointer
                ? HEAP_STRIDE
                : 1
              : lv.slot?.isPointer
                ? -HEAP_STRIDE
                : -1),
        );
        return old;
      }
      case "binary": {
        if (node.op === "&&") {
          const l = evalNode(node.left, frame);
          return l && evalNode(node.right, frame) ? 1 : 0;
        }
        if (node.op === "||") {
          const l = evalNode(node.left, frame);
          return l || evalNode(node.right, frame) ? 1 : 0;
        }
        const l = evalNode(node.left, frame),
          r = evalNode(node.right, frame);
        if (
          (node.op === "+" || node.op === "-") &&
          typeof l === "number" &&
          findBlock(l)
        )
          return l + (node.op === "+" ? r : -r) * HEAP_STRIDE;
        switch (node.op) {
          case "+":
            return typeof l === "string" || typeof r === "string"
              ? `${l}${r}`
              : l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return r === 0 ? 0 : l / r;
          case "%":
            return r === 0 ? 0 : l % r;
          case "<":
            return l < r ? 1 : 0;
          case ">":
            return l > r ? 1 : 0;
          case "<=":
            return l <= r ? 1 : 0;
          case ">=":
            return l >= r ? 1 : 0;
          case "==":
            return l === r ? 1 : 0;
          case "!=":
            return l !== r ? 1 : 0;
          case "&":
            return (l | 0) & (r | 0);
          case "|":
            return l | 0 | (r | 0);
          case "^":
            return (l | 0) ^ (r | 0);
          case "<<":
            return (l | 0) << (r | 0);
          case ">>":
            return (l | 0) >> (r | 0);
          default:
            return 0;
        }
      }
      case "assignExpr": {
        const lv = lvalue(node.left, frame);
        const r = evalNode(node.right, frame);
        let v = r;
        if (node.op !== "=") {
          const l = lv.get();
          const map = {
            "+=": (a, b) => a + b,
            "-=": (a, b) => a - b,
            "*=": (a, b) => a * b,
            "/=": (a, b) => (b === 0 ? a : a / b),
            "%=": (a, b) => (b === 0 ? a : a % b),
            "&=": (a, b) => (a | 0) & (b | 0),
            "|=": (a, b) => a | 0 | (b | 0),
            "^=": (a, b) => (a | 0) ^ (b | 0),
            "<<=": (a, b) => (a | 0) << (b | 0),
            ">>=": (a, b) => (a | 0) >> (b | 0),
          };
          v = map[node.op]?.(l, r) ?? r;
        }
        lv.set(v);
        return v;
      }
      case "call":
        return callFunction(node, frame);
      default:
        return 0;
    }
  }

  function evalPrintCall(node, frame) {
    const name = node.callee?.name || node.callee?.prop;
    if (
      !name ||
      !["printf", "puts", "putchar", "Write", "WriteLine"].includes(name)
    )
      return null;
    const args = node.args.map((a) => evalNode(a, frame));
    if (name === "printf") {
      let fmt = String(args.shift() ?? "");
      let i = 0;
      return fmt.replace(/%[diuoxXfpcs]/g, (s) => {
        const v = args[i++];
        if (s === "%p") return fmtAddr(v);
        if (s === "%c") return String.fromCharCode(Number(v) || 0);
        return valueToString(v);
      });
    }
    if (name === "puts") {
      return `${args[0] ?? ""}\n`;
    }
    if (name === "putchar") {
      return String.fromCharCode(Number(args[0]) || 0);
    }
    if (name === "strlen") return String(args[0]?.length ?? 0);
    return null;
  }

  function findObjectAddress(obj) {
    const block = heap.find((b) => !b.freed && b.value === obj);
    return block?.address || 0;
  }

  function callFunction(node, caller) {
    const name = node.callee?.name;
    const print = evalPrintCall(node, caller);
    if (print !== null) {
      stdout += print;
      return print;
    }
    if (node.callee?.type === "member" || node.callee?.type === "memberPtr") {
      let target = evalNode(node.callee.target, caller);
      let obj = target;
      if (node.callee.type === "memberPtr" && typeof target === "number")
        obj = deref(target, node.line);
      // std::string is represented by a JavaScript string for deterministic visualization.
      if (typeof obj === "string" && typeof node.callee.prop === "string") {
        const vals = node.args.map((a) => evalNode(a, caller));
        if (node.callee.prop === "size" || node.callee.prop === "length")
          return obj.length;
        if (node.callee.prop === "empty") return obj.length === 0 ? 1 : 0;
        if (node.callee.prop === "at" || node.callee.prop === "substr")
          return node.callee.prop === "at"
            ? (obj[Math.trunc(vals[0] ?? 0)] ?? "")
            : obj.substring(
                Math.trunc(vals[0] ?? 0),
                vals[1] == null
                  ? undefined
                  : Math.trunc(vals[0] ?? 0) + Math.trunc(vals[1]),
              );
        if (node.callee.prop === "c_str") return obj;
      }
      // Educational STL containers are represented as arrays with a lightweight type tag.
      if (Array.isArray(obj) && typeof node.callee.prop === "string") {
        const vals = node.args.map((a) => evalNode(a, caller));
        if (
          node.callee.prop === "push_back" ||
          node.callee.prop === "push_front"
        ) {
          node.callee.prop === "push_back"
            ? obj.push(vals[0])
            : obj.unshift(vals[0]);
          snapshot(node.line, `${node.callee.prop}(${valueToString(vals[0])})`);
          return 0;
        }
        if (node.callee.prop === "pop_back") {
          const v = obj.pop();
          snapshot(node.line, "pop_back()");
          return v ?? 0;
        }
        if (node.callee.prop === "pop_front") {
          const v = obj.shift();
          snapshot(node.line, "pop_front()");
          return v ?? 0;
        }
        if (node.callee.prop === "size") return obj.length;
        if (node.callee.prop === "empty") return obj.length === 0 ? 1 : 0;
        if (node.callee.prop === "clear") {
          obj.length = 0;
          snapshot(node.line, "clear()");
          return 0;
        }
        if (node.callee.prop === "at") {
          const i = Math.trunc(vals[0] ?? 0);
          if (i < 0 || i >= obj.length)
            throw new InterpError(
              `container index ${i} out of bounds`,
              node.line,
            );
          return obj[i];
        }
        if (node.callee.prop === "front") return obj[0] ?? 0;
        if (node.callee.prop === "back") return obj[obj.length - 1] ?? 0;
      }
      if (!obj?.__struct)
        throw new InterpError(
          `method '${node.callee.prop}' called on non-object`,
          node.line,
        );
      const found = findMethod(
        obj.type,
        node.callee.prop,
        new Set(),
        node.args,
      );
      if (!found) {
        const e = new InterpError(
          `unsupported method '${obj.type}::${node.callee.prop}'`,
          node.line,
        );
        e.mockUnsupported = true;
        throw e;
      }
      const addr = typeof target === "number" ? target : findObjectAddress(obj);
      return invokeMethod(
        found.method,
        obj,
        addr,
        node.args,
        caller,
        `${obj.type}::${node.callee.prop}()`,
      );
    }
    if (name === "sizeof") {
      const a = node.args?.[0];
      if (a?.type === "var") {
        try {
          const v = resolveVar(a.name, caller).slot;
          if (v.isPointer) return 8;
          if (Array.isArray(v.value)) return v.value.length * 4;
          return 4;
        } catch {
          return sizeofType(a.name);
        }
      }
      return 4;
    }
    if (name === "scanf") {
      const args = node.args.map((a) => evalNode(a, caller));
      const fmt = String(args[0] ?? "");
      let ai = 1;
      for (const spec of fmt.match(/%[difsc]/g) || []) {
        const raw = inputQueue[inputPos++] ?? "";
        const argNode = node.args[ai++];
        const lv =
          argNode?.type === "unary" && argNode.op === "&"
            ? lvalue(argNode.expr, caller)
            : lvalue(argNode, caller);
        lv.set(spec === "%s" || spec === "%c" ? raw : Number(raw));
      }
      return 0;
    }
    if (["malloc", "calloc", "realloc", "free"].includes(name)) {
      const args = node.args.map((a) => evalNode(a, caller));
      if (name === "malloc")
        return allocateHeap(
          Math.max(1, Math.ceil((args[0] || 4) / 4)),
          0,
          "malloc",
        );
      if (name === "calloc")
        return allocateHeap(Math.max(1, Math.trunc(args[0] || 1)), 0, "calloc");
      if (name === "realloc") {
        const old = args[0],
          bytes = args[1] || 4,
          b = findBlock(old);
        if (!b) return allocateHeap(Math.ceil(bytes / 4), 0, "realloc");
        const n = Math.max(1, Math.ceil(bytes / 4)),
          oldArr = Array.isArray(b.value) ? b.value : [b.value];
        b.value =
          n > 1
            ? Array.from({ length: n }, (_, i) => oldArr[i] ?? 0)
            : (oldArr[0] ?? 0);
        b.size = n;
        return old;
      }
      if (name === "free") {
        const b = findBlock(args[0]);
        if (b) b.freed = true;
        return 0;
      }
    }
    if (name === "abs" || name === "labs")
      return Math.abs(Number(evalNode(node.args[0], caller) || 0));
    if (name === "max" || name === "min") {
      const a = node.args.map((x) => Number(evalNode(x, caller)));
      return name === "max" ? Math.max(...a) : Math.min(...a);
    }
    const rawFn = functions[name];
    const fn = chooseOverload(rawFn, node.args);
    if (!fn) {
      const e = new InterpError(`unsupported function '${name}'`, node.line);
      e.mockUnsupported = true;
      throw e;
    }
    if (callFrames.length >= MAX_CALL_DEPTH)
      throw new InterpError("maximum call depth exceeded", node.line);
    const frame = {
      name: `${name}()`,
      values: new Map(),
      scopes: [new Map()],
      line: node.line,
    };
    callFrames.push(frame);
    const values = node.args.map((a) => evalNode(a, caller));
    fn.params.forEach((p, i) =>
      makeSlot(frame, p.name, values[i] ?? 0, {
        pointer: p.pointerDepth > 0,
        reference: p.reference,
        type: "parameter",
      }),
    );
    snapshot(fn.line, `enter ${name}()`);
    let result = 0;
    try {
      execList(fn.body, frame);
      result = frame.__return ?? 0;
    } finally {
      snapshot(node.line, `return from ${name}()`);
      callFrames.pop();
    }
    return result;
  }

  function execList(list, frame) {
    for (const s of list) {
      if (returned) break;
      const signal = execStmt(s, frame);
      if (signal === "return" || signal === "break" || signal === "continue")
        return signal;
    }
  }
  function execStmt(s, frame) {
    guard(s.line);
    if (stepCount > MAX_STEPS) return;
    switch (s.type) {
      case "block": {
        frame.scopes.push(new Map());
        try {
          return execList(s.body, frame);
        } finally {
          frame.scopes.pop();
        }
      }
      case "decl": {
        let value = 0;
        let pointer = s.pointerDepth > 0;
        const structDef = functions.__structDefs?.[s.dataType];
        if (structDef && !pointer) {
          value = { __struct: true, type: s.dataType, fields: {} };
          const allFields = collectClassFields(
            structDef,
            functions.__structDefs,
          );
          for (const [k, meta] of Object.entries(allFields))
            value.fields[k] = meta.initializer
              ? evalNode(meta.initializer, frame)
              : 0;
          if (s.initializer?.type === "array") {
            const vals = s.initializer.values.map((x) => evalNode(x, frame));
            Object.keys(allFields).forEach((k, i) => {
              value.fields[k] = vals[i] ?? value.fields[k];
            });
          }
        } else if (
          /^std::(?:vector|array|deque|list|set|unordered_set|stack|queue)/.test(
            s.dataType,
          ) &&
          s.initializer?.type === "array"
        ) {
          value = s.initializer.values.map((x) => evalNode(x, frame));
          value.__containerType = s.dataType;
        } else if (
          /^std::(?:vector|array|deque|list|set|unordered_set|stack|queue)/.test(
            s.dataType,
          )
        ) {
          value =
            s.initializer?.type === "array"
              ? s.initializer.values.map((x) => evalNode(x, frame))
              : [];
          value.__containerType = s.dataType;
        } else if (s.initializer?.type === "array") {
          value = s.initializer.values.map((x) => evalNode(x, frame));
        } else if (s.initializer && s.initializer.type !== "constructorInit")
          value = evalNode(s.initializer, frame);
        else if (s.dimensions.length && !s.initializer) {
          const n = Math.max(1, Math.trunc(evalNode(s.dimensions[0], frame)));
          value = Array.from({ length: n }, () => 0);
        }
        const slot = makeSlot(frame, s.name, value, {
          pointer,
          reference: s.reference,
          type: s.dataType,
        });
        if (structDef && !pointer) {
          const ctorArgs =
            s.initializer?.type === "constructorInit" ? s.initializer.args : [];
          runConstructor(s.dataType, value, 0, ctorArgs, frame);
          snapshot(s.line, `construct ${s.dataType} ${s.name}`);
        }
        if (s.reference && s.initializer) {
          const lv = lvalue(s.initializer, frame);
          slot.reference = lv.address;
          slot.value = lv.get();
        }
        snapshot(s.line, `declare ${s.name} = ${valueToString(value)}`);
        return;
      }
      case "input": {
        for (const target of s.targets) {
          const lv = lvalue(target, frame);
          const raw = inputQueue[inputPos++] ?? "";
          const current = lv.get();
          let v = raw;
          if (typeof current === "number") v = Number(raw);
          else if (typeof current === "string") v = String(raw);
          lv.set(v);
        }
        snapshot(s.line, "read input");
        return;
      }
      case "print": {
        if (s.kind === "cout") {
          for (const p of s.parts) {
            if (p.type === "endl") stdout += "\n";
            else stdout += valueToString(evalNode(p.expr, frame));
          }
        } else {
          const vals = s.args.map((a) => evalNode(a, frame));
          stdout +=
            vals.map(valueToString).join("") +
            (s.kind === "WriteLine" ? "\n" : "");
        }
        snapshot(s.line, "print output");
        return;
      }
      case "throw": {
        const value = evalNode(s.expr, frame);
        snapshot(s.line, `throw ${valueToString(value)}`);
        throw { __cppThrow: true, value, line: s.line };
      }
      case "try": {
        try {
          return execStmt(s.body, frame);
        } catch (err) {
          if (!err?.__cppThrow) throw err;
          for (const c of s.catches) {
            frame.scopes.push(new Map());
            try {
              if (c.name)
                makeSlot(frame, c.name, clone(err.value), {
                  type: c.type || "auto",
                });
              snapshot(c.line, `catch ${c.name || "..."}`);
              return execStmt(c.body, frame);
            } finally {
              frame.scopes.pop();
            }
          }
          throw err;
        }
      }
      case "delete": {
        const addr = evalNode(s.target, frame);
        const b = findBlock(addr);
        if (b?.value?.__struct) {
          const dtor = findMethod(b.value.type, `~${b.value.type}`);
          if (dtor)
            invokeMethod(
              dtor.method,
              b.value,
              addr,
              [],
              frame,
              `${b.value.type}::~${b.value.type}()`,
            );
        }
        if (b) b.freed = true;
        snapshot(
          s.line,
          `${s.array ? "delete[]" : "delete"} → ${fmtAddr(addr)}`,
        );
        return;
      }
      case "expr": {
        const v = evalNode(s.expr, frame);
        const c = s.expr.type === "call" && s.expr.callee?.name;
        snapshot(
          s.line,
          c
            ? `call ${c}()`
            : v === undefined
              ? "expression"
              : `expression → ${valueToString(v)}`,
        );
        return;
      }
      case "if": {
        const ok = !!evalNode(s.cond, frame);
        snapshot(
          s.line,
          `if (${renderExpr(s.cond)}) → ${ok ? "true" : "false"}`,
        );
        if (ok) return execStmt(s.then, frame);
        if (s.else) return execStmt(s.else, frame);
        return;
      }
      case "rangeFor": {
        const iterable = evalNode(s.iterable, frame);
        if (!Array.isArray(iterable))
          throw new InterpError(
            `range-for requires an iterable container`,
            s.line,
          );
        frame.scopes.push(new Map());
        try {
          for (let i = 0; i < iterable.length; i++) {
            if (i >= MAX_LOOP_ITERATIONS)
              throw new InterpError("loop iteration limit exceeded", s.line);
            let existing = null;
            try {
              existing = resolveVar(s.name, frame)?.slot;
            } catch {}
            if (existing) existing.value = clone(iterable[i]);
            else
              makeSlot(frame, s.name, clone(iterable[i]), { type: s.dataType });
            snapshot(
              s.line,
              `range-for ${s.name} = ${valueToString(iterable[i])}`,
            );
            const sig = execStmt(s.body, frame);
            if (sig === "return") return sig;
            if (sig === "break") break;
          }
        } finally {
          frame.scopes.pop();
        }
        snapshot(s.line, "range-for exit");
        return;
      }
      case "for": {
        if (s.init)
          s.init.type === "decl"
            ? execStmt(s.init, frame)
            : evalNode(s.init.expr, frame);
        let i = 0;
        while (!!evalNode(s.cond, frame)) {
          if (i++ >= MAX_LOOP_ITERATIONS)
            throw new InterpError("loop iteration limit exceeded", s.line);
          snapshot(s.line, `for condition → true`);
          const sig = execStmt(s.body, frame);
          if (sig === "return") return sig;
          if (sig === "break") break;
          if (sig !== "continue") {
          }
          if (s.update) evalNode(s.update, frame);
        }
        snapshot(s.line, "for loop exit");
        return;
      }
      case "while": {
        let i = 0;
        while (!!evalNode(s.cond, frame)) {
          if (i++ >= MAX_LOOP_ITERATIONS)
            throw new InterpError("loop iteration limit exceeded", s.line);
          snapshot(s.line, "while condition → true");
          const sig = execStmt(s.body, frame);
          if (sig === "return") return sig;
          if (sig === "break") break;
        }
        snapshot(s.line, "while loop exit");
        return;
      }
      case "do": {
        let i = 0;
        do {
          if (i++ >= MAX_LOOP_ITERATIONS)
            throw new InterpError("loop iteration limit exceeded", s.line);
          const sig = execStmt(s.body, frame);
          if (sig === "return") return sig;
          if (sig === "break") break;
        } while (!!evalNode(s.cond, frame));
        snapshot(s.line, "do/while exit");
        return;
      }
      case "switch": {
        const value = evalNode(s.expr, frame);
        let active = false;
        for (const c of s.cases) {
          if (
            c.value === null ||
            (!active && evalNode(c.value, frame) === value)
          )
            active = true;
          if (active) {
            const sig = execList(c.body, frame);
            if (sig === "return") return sig;
            if (sig === "break") break;
          }
        }
        snapshot(s.line, `switch (${valueToString(value)})`);
        return;
      }
      case "break":
        return "break";
      case "continue":
        return "continue";
      case "return": {
        const value = s.expr ? evalNode(s.expr, frame) : 0;
        frame.__return = value;
        if (frame === callFrames[0]) returned = true;
        snapshot(s.line, `return ${valueToString(value)}`);
        return "return";
      }
      default: {
        const e = new InterpError(`unsupported statement '${s.type}'`, s.line);
        e.mockUnsupported = true;
        throw e;
      }
    }
  }

  function renderExpr(n) {
    if (!n) return "";
    if (n.type === "var") return n.name;
    if (n.type === "literal") return JSON.stringify(n.value);
    if (n.type === "binary")
      return `${renderExpr(n.left)} ${n.op} ${renderExpr(n.right)}`;
    return n.type;
  }

  const main = functions.main;
  const mainFrame = {
    name: "main()",
    values: new Map(),
    scopes: [new Map()],
    line: main.line,
  };
  callFrames.push(mainFrame);
  snapshot(main.line, "start of main()");
  execList(main.body, mainFrame);
  if (!returned) snapshot(main.line, "end of main()");
  callFrames.pop();
  return { steps, stdout };
}

export { runInterpreter };
