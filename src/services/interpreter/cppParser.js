// Educational C / C++ / C# interpreter used by the memory visualizer.
// It intentionally executes a useful, deterministic subset of the languages
// instead of pretending to be a native compiler. The goal is real control-flow
// semantics plus a visible stack/heap/pointer model.

const MAX_STEPS = 2500
const MAX_LOOP_ITERATIONS = 5000
const MAX_CALL_DEPTH = 100
const STACK_BASE = 0x7ffe6a3b2c80
const STACK_STRIDE = 0x8
const HEAP_BASE = 0x55b8c3a01000
const HEAP_STRIDE = 0x20

export function fmtAddr(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n)
  return '0x' + Math.trunc(n).toString(16)
}

export class InterpError extends Error {
  constructor(message, line = undefined) {
    super(message)
    this.line = line
  }
}

const TYPES = new Set([
  'void', 'bool', '_Bool', 'char', 'signed', 'unsigned', 'short', 'int', 'long', 'float', 'double', 'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t', 'intptr_t', 'uintptr_t', 'int_least8_t', 'uint_least8_t', 'int_least16_t', 'uint_least16_t', 'int_least32_t', 'uint_least32_t', 'int_least64_t', 'uint_least64_t', 'int_fast8_t', 'uint_fast8_t', 'int_fast16_t', 'uint_fast16_t', 'int_fast32_t', 'uint_fast32_t', 'int_fast64_t', 'uint_fast64_t', 'ptrdiff_t', 'wchar_t',
  'string', 'auto', 'var', 'size_t', 'std::string', 'std::size_t', 'std::vector', 'std::array', 'std::deque', 'std::list', 'std::set', 'std::map', 'std::unordered_map', 'std::unordered_set', 'std::stack', 'std::queue', 'std::pair', 'vector', 'array', 'deque', 'list', 'set', 'map', 'unordered_map', 'unordered_set', 'stack', 'queue', 'pair',
])

const TYPE_WORDS = /^(?:(?:const|static|volatile|register|extern|restrict|inline|mutable|constexpr|signed|unsigned|short|long)\s+)*(?:void|bool|char|signed|unsigned|short|int|long|float|double|string|auto|var|size_t|std::string|std::size_t)(?:\s+long|\s+int)?$/

function isTypeStart(s) {
  const x = s.trim().replace(/\s+/g, ' ')
  if (TYPE_WORDS.test(x)) return true
  if (/^(?:struct|enum)\s+\w+$/.test(x)) return true
  return false
}

// [PATCH 9] Function-like macro expansion pass. Supports simple one-line
// object-like and function-like macros with non-recursive expansion.
function stripCommentsAndPreprocessor(code) {
  const objectMacros = {}
  const functionMacros = {}
  let out = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  out = out.split('\n').map((line) => {
    const fn = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(.+)$/)
    if (fn) {
      const params = fn[2].split(',').map(x => x.trim()).filter(Boolean)
      functionMacros[fn[1]] = { params, body: fn[3].trim() }
      return ''
    }
    const obj = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/)
    if (obj) {
      objectMacros[obj[1]] = obj[2].trim()
      return ''
    }
    // [PATCH 9] Conditional compilation: evaluate #ifdef/#ifndef/#if/#else/#endif
    return line
  }).join('\n')

  // Evaluate simple conditionals before line-splitting for expansion.
  out = evaluateConditionals(out, objectMacros, functionMacros)

  // Expand function-like macros first (innermost, non-recursive).
  for (const [name, def] of Object.entries(functionMacros)) {
    const re = new RegExp(`\\b${name}\\s*\\(([^()]*)\\)`, 'g')
    let prev
    do {
      prev = out
      out = out.replace(re, (_, args) => {
        const argList = args.split(',').map(a => a.trim())
        let body = def.body
        def.params.forEach((p, i) => {
          body = body.replace(new RegExp(`\\b${p}\\b`, 'g'), argList[i] ?? '')
        })
        return body
      })
    } while (out !== prev)
  }

  // Expand object-like macros.
  for (const [name, value] of Object.entries(objectMacros)) {
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), value)
  }
  // Common C standard macros/types that are safe to model directly.
  out = out.replace(/\bNULL\b/g, '0').replace(/\btrue\b/g, '1').replace(/\bfalse\b/g, '0')
  // Headers are compile-time declarations for this educational interpreter;
  // the native runtime provides the supported library functions itself.
  out = out.replace(/^\s*#\s*include\s*[<\"][^>\"]+[>\"]\s*$/gm, '')
  // C11 static assertions are compile-time only. Evaluate simple constant forms.
  out = out.replace(/^\s*_Static_assert\s*\(\s*([^,]+)\s*,[^;]*\)\s*;?\s*$/gm, (m, expr) => {
    try { return Number(Function(`return (${expr})`)()) ? '' : m } catch { return m }
  })

  // [PATCH 9] __LINE__ expansion: replace with the line number at that point.
  const lines = out.split('\n')
  out = lines.map((line, i) => line.replace(/\b__LINE__\b/g, String(i + 1))).join('\n')

  // Strip // comments (string-aware).
  return out.split('\n').map((line) => {
    let inStr = false, quote = ''
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i]
      if ((c === '"' || c === "'") && line[i - 1] !== '\\') {
        if (!inStr) { inStr = true; quote = c }
        else if (quote === c) inStr = false
      }
      if (!inStr && c === '/' && line[i + 1] === '/') return line.slice(0, i)
    }
    return line
  }).join('\n')
}

// [PATCH 9] Evaluate #ifdef/#ifndef/#if 0/#if 1/#else/#endif blocks.
function evaluateConditionals(code, objectMacros, functionMacros) {
  const lines = code.split('\n')
  const out = []
  const stack = [{ active: true, taken: false }]
  for (const line of lines) {
    const trimmed = line.trim()
    const ifdef = trimmed.match(/^#\s*ifdef\s+([A-Za-z_]\w*)/)
    const ifndef = trimmed.match(/^#\s*ifndef\s+([A-Za-z_]\w*)/)
    const ifnum = trimmed.match(/^#\s*if\s+(\d+)/)
    const ifdef0 = trimmed.match(/^#\s*if\s+defined\s*\(\s*([A-Za-z_]\w*)\s*\)/)
    const els = /^#\s*else\b/.test(trimmed)
    const endif = /^#\s*endif\b/.test(trimmed)
    if (ifdef || ifndef || ifnum || ifdef0) {
      const parent = stack[stack.length - 1]
      let cond
      if (ifdef) cond = Object.prototype.hasOwnProperty.call(objectMacros, ifdef[1]) || Object.prototype.hasOwnProperty.call(functionMacros, ifdef[1])
      else if (ifndef) cond = !(Object.prototype.hasOwnProperty.call(objectMacros, ifndef[1]) || Object.prototype.hasOwnProperty.call(functionMacros, ifndef[1]))
      else if (ifnum) cond = Number(ifnum[1]) !== 0
      else cond = Object.prototype.hasOwnProperty.call(objectMacros, ifdef0[1]) || Object.prototype.hasOwnProperty.call(functionMacros, ifdef0[1])
      stack.push({ active: parent.active && !!cond, taken: !!cond })
      continue
    }
    if (els) {
      const top = stack[stack.length - 1]
      top.active = stack[stack.length - 2].active && !top.taken
      top.taken = true
      continue
    }
    if (endif) {
      if (stack.length > 1) stack.pop()
      continue
    }
    if (stack[stack.length - 1].active) out.push(line)
  }
  return out.join('\n')
}

function lex(src) {
  const tokens = []
  let i = 0
  const lineAt = (p) => src.slice(0, p).split('\n').length
  const two = ['++','--','==','!=','<=','>=','&&','||','+=','-=','*=','/=','%=','<<','>>','->','::','&=','|=','^=','<<=','>>=']
  const three = ['<<=','>>=','...']
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"' || c === "'") {
      const quote = c; const start = i++; let value = ''
      while (i < src.length) {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[i + 1]; const map = { n:'\n', r:'\r', t:'\t', '0':'\0', '\\':'\\', '"':'"', "'":"'" }
          value += map[e] ?? e; i += 2; continue
        }
        if (src[i] === quote) { i++; break }
        value += src[i++]
      }
      tokens.push({ type: quote === '"' ? 'string' : 'char', value, line: lineAt(start) })
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const start = i
      i++
      while (i < src.length && /[0-9A-Fa-fxX.eE_]/.test(src[i])) i++
      // C/C++ floating/integer suffixes (f/F/l/L/ll/LL).
      if (src[i] === 'f' || src[i] === 'F' || src[i] === 'l' || src[i] === 'L') {
        i++
        if ((src[i - 1] === 'l' || src[i - 1] === 'L') && (src[i] === 'l' || src[i] === 'L')) i++
      }
      const raw = src.slice(start, i).replace(/_/g, '').replace(/[fFlL]+$/, '')
      const value = /^0x/i.test(raw) ? parseInt(raw, 16) : Number(raw)
      tokens.push({ type: 'number', value: Number.isNaN(value) ? 0 : value, line: lineAt(start) })
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i++
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++
      tokens.push({ type:'id', value:src.slice(start,i), line:lineAt(start) })
      continue
    }
    const t3 = src.slice(i, i + 3), t2 = src.slice(i, i + 2)
    if (three.includes(t3)) { tokens.push({type:'op',value:t3,line:lineAt(i)}); i += 3; continue }
    if (two.includes(t2)) { tokens.push({type:'op',value:t2,line:lineAt(i)}); i += 2; continue }
    tokens.push({ type:'op', value:c, line:lineAt(i) }); i++
  }
  tokens.push({ type:'eof', value:'<eof>', line:lineAt(src.length) })
  return tokens
}

class Parser {
  constructor(tokens, source, knownTypes = new Set()) { this.t = tokens; this.i = 0; this.source = source; this.knownTypes = knownTypes }
  peek(n=0) { return this.t[Math.min(this.i+n, this.t.length-1)] }
  take() { return this.t[this.i++] }
  is(v) { return this.peek().value === v }
  eat(v) { if (this.is(v)) { this.i++; return true } return false }
  expect(v) { if (!this.eat(v)) throw new InterpError(`expected '${v}', got '${this.peek().value}'`, this.peek().line) }
  line() { return this.peek().line }

  parseProgram(stop='}') {
    const out=[]
    while (this.peek().type !== 'eof' && !this.is(stop)) {
      if (this.eat(';')) continue
      const s=this.parseStatement()
      if (s) out.push(s)
    }
    if (stop !== '}' && this.peek().type === 'eof') return out
    return out
  }

  parseBlock() {
    this.expect('{')
    const body=this.parseProgram('}')
    this.expect('}')
    return body
  }

  parseStatement() {
    const line=this.line()
    if (this.is('{')) return {type:'block', line, body:this.parseBlock()}
    if (this.is('if')) {
      this.take(); this.expect('('); const cond=this.parseExpression(); this.expect(')')
      const then=this.parseStatement(); let otherwise=null
      if (this.eat('else')) otherwise=this.parseStatement()
      return {type:'if',line,cond,then,else:otherwise}
    }
    if (this.is('for')) return this.parseFor()
    if (this.is('while')) { this.take(); this.expect('('); const cond=this.parseExpression(); this.expect(')'); return {type:'while',line,cond,body:this.parseStatement()} }
    if (this.is('do')) { this.take(); const body=this.parseStatement(); this.expect('while'); this.expect('('); const cond=this.parseExpression(); this.expect(')'); this.eat(';'); return {type:'do',line,body,cond} }
    if (this.is('switch')) return this.parseSwitch()
    if (this.is('throw')) { this.take(); const expr=this.is(';') ? {type:'literal',value:0} : this.parseExpression(); this.expect(';'); return {type:'throw',line,expr} }
    if (this.is('try')) return this.parseTry()
    if (this.is('return')) { this.take(); const expr=this.is(';') ? null : this.parseExpression(); this.expect(';'); return {type:'return',line,expr} }
    if (this.is('delete')) { this.take(); const array=this.eat('[') ? (this.expect(']'), true) : false; const target=this.parseExpression(); this.expect(';'); return {type:'delete',line,target,array} }
    if (this.is('cout') || (this.is('std') && this.peek(1).value==='::' && this.peek(2).value==='cout')) return this.parseCout()
    if (this.is('cin') || (this.is('std') && this.peek(1).value==='::' && this.peek(2).value==='cin')) return this.parseCin()
    if (this.is('Console')) return this.parseConsolePrint()
    // C labels and goto. Labels are represented explicitly so the runtime can
    // transfer control without relying on JavaScript eval/Function.
    if (this.peek().type==='id' && this.peek(1).value===':') {
      const label=this.take().value; this.expect(':');
      if (this.is(';')) this.take();
      const statement=this.is('}') || this.peek().type==='eof' ? {type:'empty',line} : this.parseStatement();
      return {type:'label',line,label,statement}
    }
    if (this.is('goto')) { this.take(); const label=this.take().value; this.expect(';'); return {type:'goto',line,label} }
    if (this.is('break')) { this.take(); this.expect(';'); return {type:'break',line} }
    if (this.is('continue')) { this.take(); this.expect(';'); return {type:'continue',line} }
    if (this.is('case') || this.is('default')) return null
    // [PATCH 1] Comma-separated declarations inside function bodies.
    const decls = this.tryDeclarationList()
    if (decls && decls.length) {
      this.expect(';')
      return decls.length === 1 ? {...decls[0], line} : {type:'multiDecl', line, decls}
    }
    const expr=this.parseExpression()
    this.expect(';')
    return {type:'expr',line,expr}
  }

  parseCin() {
    const line=this.line(); this.take(); if(this.is('::')){this.take();this.expect('cin')}
    const groups=[]; let cur=[]; let depth=0
    while(!this.is(';') && this.peek().type!=='eof') { const t=this.take(); if(t.value==='('||t.value==='[')depth++; if(t.value===')'||t.value===']')depth--; if(t.value==='>>'&&depth===0){groups.push(cur);cur=[]}else cur.push(t) }
    groups.push(cur); this.expect(';')
    const targets=groups.filter(g=>g.length).map(g=>{g.push({type:'eof',value:'<eof>',line:g.at(-1)?.line||line});return new Parser(g,'').parseExpression()})
    return {type:'input',line,targets}
  }
  parseCout() {
    const line=this.line(); this.take(); if(this.is('::')){this.take();this.expect('cout')} const groups=[]; let cur=[]; let depth=0
    while(!this.is(';') && this.peek().type!=='eof') {
      const t=this.take();
      if(t.value==='('||t.value==='[') depth++;
      if(t.value===')'||t.value===']') depth--;
      if(t.value==='<<' && depth===0) { groups.push(cur); cur=[] } else cur.push(t)
    }
    groups.push(cur); this.expect(';')
    const parts=groups.filter(g=>g.length).map(g=>{
      if((g.length===1 && g[0].value==='endl') || (g.length===3 && g[0].value==='std' && g[1].value==='::' && g[2].value==='endl')) return {type:'endl'}
      g.push({type:'eof',value:'<eof>',line:g.at(-1)?.line||line});
      return {type:'expr',expr:new Parser(g,'').parseExpression()}
    })
    return {type:'print',line,kind:'cout',parts}
  }
  parseConsolePrint() {
    const line=this.line(); const target=this.take().value; this.expect('.'); const method=this.take().value
    if(method!=='Write' && method!=='WriteLine') throw new InterpError(`unsupported Console method '${method}'`,line)
    this.expect('('); const args=[]; while(!this.is(')')) { args.push(this.parseExpression()); if(!this.eat(',')) break } this.expect(')'); this.expect(';')
    return {type:'print',line,kind:method,args}
  }

  parseTry() {
    const line=this.line(); this.take(); const body=this.parseStatement(); const catches=[]
    while(this.eat('catch')) {
      this.expect('(')
      const parts=[]; let depth=0
      while(!this.is(')') && this.peek().type!=='eof'){ const t=this.take(); if(t.value==='<'||t.value==='(')depth++; if(t.value==='>'||t.value===')')depth--; parts.push(t) }
      this.expect(')'); const ids=parts.filter(t=>t.type==='id').map(t=>t.value); const name=ids.at(-1)||null
      catches.push({name,type:ids.slice(0,-1).join(' '),body:this.parseStatement(),line})
    }
    if(!catches.length) throw new InterpError("try must be followed by catch",line)
    return {type:'try',line,body,catches}
  }

  parseFor() {
    const line=this.line(); this.take(); this.expect('(')
    // C++ range-for: for (auto x : container)
    const save=this.i
    let rangeType=[]
    while(this.peek().type==='id' && (TYPES.has(this.peek().value) || this.knownTypes.has(this.peek().value) || ['const','auto'].includes(this.peek().value))) rangeType.push(this.take().value)
    while(this.is('&')) rangeType.push(this.take().value)
    const rangeName=this.peek().type==='id' ? this.take().value : null
    if(rangeName && this.eat(':')) {
      const iterable=this.parseExpression(); this.expect(')')
      const body=this.parseStatement()
      return {type:'rangeFor',line,name:rangeName,dataType:rangeType.join(' ')||'auto',iterable,body}
    }
    this.i=save
    // [PATCH 1] Comma-separated init: for (int i=0, j=10; ...)
    let init=null
    if (!this.is(';')) {
      const decls = this.tryDeclarationList()
      if (decls && decls.length) {
        init = decls.length === 1 ? decls[0] : {type:'multiDecl', line, decls}
      } else {
        init = {type:'expr',expr:this.parseExpression(),line}
      }
    }
    this.expect(';')
    const cond=this.is(';') ? {type:'literal',value:1} : this.parseExpression(); this.expect(';')
    // [PATCH 1] Comma-separated update: i++, j--
    const updateList = []
    if (!this.is(')')) {
      updateList.push(this.parseExpression())
      while (this.eat(',')) updateList.push(this.parseExpression())
    }
    this.expect(')')
    const body=this.parseStatement()
    const update = updateList.length === 0 ? null : updateList.length === 1 ? updateList[0] : {type:'commaExpr', exprs:updateList}
    return {type:'for',line,init,cond,update,body}
  }

  parseSwitch() {
    const line=this.line(); this.take(); this.expect('('); const expr=this.parseExpression(); this.expect(')'); this.expect('{')
    const cases=[]; let current=null
    while (!this.is('}') && this.peek().type!=='eof') {
      const l=this.line()
      if (this.eat('case')) { const value=this.parseExpression(); this.expect(':'); current={value,body:[],line:l}; cases.push(current); continue }
      if (this.eat('default')) { this.expect(':'); current={value:null,body:[],line:l}; cases.push(current); continue }
      const s=this.parseStatement(); if (s && current) current.body.push(s); else if (s) throw new InterpError('statement before switch case', s.line)
    }
    this.expect('}')
    return {type:'switch',line,expr,cases}
  }

  // [PATCH 1] Parse one or more comma-separated declarations sharing a type.
  tryDeclarationList() {
    const save = this.i
    const first = this.tryDeclaration()
    if (!first) { this.i = save; return null }
    const decls = [first]
    while (this.eat(',')) {
      let ptr = 0
      while (this.eat('*')) ptr++
      const reference = this.eat('&')
      if (this.peek().type !== 'id') { this.i = save; return null }
      const name = this.take().value
      let dimensions = []
      while (this.eat('[')) { dimensions.push(this.parseExpression()); this.expect(']') }
      let initializer = null
      if (this.eat('=')) initializer = this.is('{') ? this.parseInitializerList() : this.parseExpression()
      else if (this.is('{')) initializer = this.parseInitializerList()
      else if (this.is('(')) {
        this.take()
        const args = []
        while (!this.is(')')) { args.push(this.parseExpression()); if (!this.eat(',')) break }
        this.expect(')')
        initializer = {type:'constructorInit', args, line:this.line()}
      }
      decls.push({type:'decl', name, dataType:first.dataType, pointerDepth:ptr, dimensions, initializer, reference})
    }
    return decls
  }

  tryDeclaration() {
    const save=this.i
    let ptr=0
    const start=this.peek().value
    while (['const','static','volatile','restrict','register','extern','inline','constexpr'].includes(this.peek().value)) this.take()
    let typeParts=[]
    // [PATCH 2] Accept 'struct Tag' / 'enum Tag' and drop the keyword.
    if (this.is('struct') || this.is('union') || this.is('enum')) {
      this.take()
      if (this.peek().type === 'id') typeParts.push(this.take().value)
      if (this.is('<')) this.skipBalanced('<','>')
    }
    while (this.peek().type==='id' && (TYPES.has(this.peek().value) || ['struct','union','enum'].includes(this.peek().value))) { typeParts.push(this.take().value); if (this.is('<')) { this.skipBalanced('<','>') } if (this.is('*')) break }
    if (!typeParts.length && this.peek().value==='std' && this.peek(1).value==='::' && this.peek(2).type==='id') { typeParts.push(`std::${this.peek(2).value}`); this.take(); this.take(); this.take(); if(this.is('<')) this.skipBalanced('<','>') }
    if (!typeParts.length && !(this.peek().type==='id' && (this.peek(1).type==='id' || this.peek(1).value==='*' || this.peek(1).value==='&'))) { this.i=save; return null }
    if (!typeParts.length && this.peek().type==='id' && (this.knownTypes.has(this.peek().value) || this.peek(1).type==='id')) typeParts.push(this.take().value)
    while (this.eat('*')) ptr++
    const reference = this.eat('&')
    if (this.peek().type!=='id') { this.i=save; return null }
    const name=this.take().value
    let dimensions=[]
    while (this.eat('[')) { dimensions.push(this.parseExpression()); this.expect(']') }
    let initializer=null
    if (this.eat('=')) initializer=this.is('{') ? this.parseInitializerList() : this.parseExpression()
    else if (this.is('{')) initializer=this.parseInitializerList()
    else if (this.is('(')) {
      this.take()
      const args=[]
      while(!this.is(')')) { args.push(this.parseExpression()); if(!this.eat(',')) break }
      this.expect(')')
      initializer={type:'constructorInit',args,line:this.line()}
    }
    return {type:'decl',name,dataType:typeParts.join(' '),pointerDepth:ptr,dimensions,initializer,reference}
  }

  parseInitializerList() {
    this.expect('{'); const values=[]
    while (!this.is('}') && this.peek().type!=='eof') {
      if (this.eat('.')) {
        const name=this.take().value; this.expect('=');
        const value=this.is('{') ? this.parseInitializerList() : this.parseExpression();
        values.push({type:'designatedField',name,value});
      } else if (this.eat('[')) {
        const index=this.parseExpression(); this.expect(']'); this.expect('=');
        const value=this.is('{') ? this.parseInitializerList() : this.parseExpression();
        values.push({type:'designatedIndex',index,value});
      } else if (this.is('{')) values.push(this.parseInitializerList())
      else values.push(this.parseExpression())
      if (!this.eat(',')) break
    }
    this.expect('}'); return {type:'array',values}
  }

  skipBalanced(a,b) { let d=0; do { const v=this.take().value; if(v===a)d++; if(v===b)d-- } while(d>0 && this.peek().type!=='eof') }

  parseExpression() { return this.parseAssignment() }
  parseAssignment() {
    let left=this.parseTernary()
    if (['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>='].includes(this.peek().value)) {
      const op=this.take().value; const right=this.parseAssignment(); return {type:'assignExpr',op,left,right}
    }
    return left
  }
  parseTernary() { let c=this.parseLogicalOr(); if(this.eat('?')) { const yes=this.parseExpression(); this.expect(':'); const no=this.parseExpression(); return {type:'ternary',cond:c,yes,no} } return c }
  parseLogicalOr() { return this.binary(this.parseLogicalAnd,['||']) }
  parseLogicalAnd() { return this.binary(this.parseBitOr,['&&']) }
  parseBitOr() { return this.binary(this.parseBitXor,['|']) }
  parseBitXor() { return this.binary(this.parseBitAnd,['^']) }
  parseBitAnd() { return this.binary(this.parseEquality,['&']) }
  parseEquality() { return this.binary(this.parseRelational,['==','!=']) }
  parseRelational() { return this.binary(this.parseShift,['<','>','<=','>=']) }
  parseShift() { return this.binary(this.parseAdd,['<<','>>']) }
  parseAdd() { return this.binary(this.parseMul,['+','-']) }
  parseMul() { return this.binary(this.parseUnary,['*','/','%']) }
  binary(next,ops) { let left=next.call(this); while(ops.includes(this.peek().value)){const op=this.take().value; const right=next.call(this); left={type:'binary',op,left,right}} return left }
  parseUnary() {
    const line=this.line(); const v=this.peek().value
    // C sizeof(type) / sizeof(expression). Keeping this as an AST node lets
    // the runtime use the same type-size model as typed heap allocations.
    if (v === 'sizeof') {
      this.take()
      this.expect('(')
      const save = this.i
      let typeParts = []
      while (this.peek().type === 'id' || this.is('*')) {
        typeParts.push(this.take().value)
      }
      if (this.eat(')') && typeParts.length) {
        return {type:'sizeof', dataType:typeParts.join(' '), line}
      }
      this.i = save
      const expr = this.parseExpression()
      this.expect(')')
      return {type:'sizeof', expr, line}
    }
    if (['!','-','+','~','&','*','++','--'].includes(v)) { this.take(); return {type:'unary',op:v,expr:this.parseUnary(),line} }
    if (this.is('(') && this.peek(1).type==='id' && (TYPES.has(this.peek(1).value) || this.peek(1).value==='unsigned' || this.peek(1).value==='signed')) {
      const save=this.i; this.take(); let parts=[]; while(this.peek().type==='id' || this.is('*')) parts.push(this.take().value); if(this.eat(')')) return {type:'cast',dataType:parts.join(' '),expr:this.parseUnary()}; this.i=save
    }
    // [PATCH 2] Cast to user-defined type.
    if (this.is('(') && this.peek(1).type==='id' && this.knownTypes.has(this.peek(1).value) && (this.peek(2).value===')' || this.peek(2).value==='*')) {
      const save=this.i; this.take(); const typeName=this.take().value; let ptr=0; while(this.eat('*'))ptr++; if(this.eat(')')) return {type:'cast',dataType:typeName,pointerDepth:ptr,expr:this.parseUnary()}; this.i=save
    }
    // C compound literal: (struct Point){ .x = 1, .y = 2 }
    if (this.is('(')) {
      const save=this.i; this.take(); let parts=[]
      while (this.peek().type==='id' || this.is('*')) parts.push(this.take().value)
      if (this.eat(')') && this.is('{')) {
        const initializer=this.parseInitializerList()
        return {type:'compoundLiteral',dataType:parts.join(' '),initializer,line}
      }
      this.i=save
    }
    return this.parsePostfix()
  }
  parsePostfix() {
    let node=this.parsePrimary()
    while(true) {
      if(this.eat('(')) { const args=[]; while(!this.is(')')) { args.push(this.parseExpression()); if(!this.eat(',')) break } this.expect(')'); node={type:'call',callee:node,args}; continue }
      if(this.eat('[')) { const index=this.parseExpression(); this.expect(']'); node={type:'index',target:node,index}; continue }
      if(this.eat('.')) { const prop=this.take().value; node={type:'member',target:node,prop}; continue }
      if(this.eat('->')) { const prop=this.take().value; node={type:'memberPtr',target:node,prop}; continue }
      if(this.is('++') || this.is('--')) { node={type:'postfix',op:this.take().value,expr:node}; continue }
      break
    }
    return node
  }
  parsePrimary() {
    const t=this.take()
    if(t.type==='number') return {type:'literal',value:t.value}
    if(t.type==='string' || t.type==='char') return {type:'literal',value:t.value}
    if(t.type==='id') {
      if(t.value==='true') return {type:'literal',value:1}
      if(t.value==='false') return {type:'literal',value:0}
      if(t.value==='nullptr' || t.value==='NULL') return {type:'literal',value:0}
      if(t.value==='new') {
        const typeParts=[]
        while(this.peek().type==='id' && !['(', '[', ';'].includes(this.peek().value)) typeParts.push(this.take().value)
        let count=null
        if(this.eat('[')){count=this.parseExpression();this.expect(']')}
        let initArgs=[]
        if(this.eat('(')){ while(!this.is(')')) { initArgs.push(this.parseExpression()); if(!this.eat(',')) break } this.expect(')') }
        return {type:'new',dataType:typeParts.join(' '),count,initArgs,line:t.line}
      }
      return {type:'var',name:t.value}
    }
    if(t.value==='(') { const e=this.parseExpression(); this.expect(')'); return e }
    throw new InterpError(`unexpected token '${t.value}'`,t.line)
  }
}

function parseBalancedBody(tokens, start, clean, knownTypes) {
  let depth = 0
  let end = start
  for (; end < tokens.length; end++) {
    if (tokens[end].value === '{') depth++
    else if (tokens[end].value === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const bodyTokens = tokens.slice(start + 1, end)
  bodyTokens.push({type:'eof',value:'<eof>',line:tokens[end]?.line || tokens[start]?.line || 1})
  const bp = new Parser(bodyTokens, clean, knownTypes)
  return { body: bp.parseProgram(), end }
}

function extractEnumDefs(clean) {
  const tokens=lex(clean), defs={}, ranges=[]
  for(let i=0;i<tokens.length;i++){
    if(tokens[i].value!=='enum') continue
    let j=i+1
    if(tokens[j]?.value==='class' || tokens[j]?.value==='struct') j++
    const name=tokens[j]
    if(!name || name.type!=='id' || tokens[j+1]?.value!=='{') continue
    let k=j+2, value=0, map={}
    while(k<tokens.length && tokens[k].value!=='}'){
      if(tokens[k].type==='id'){
        const key=tokens[k].value
        if(tokens[k+1]?.value==='='){
          const n=tokens[k+2]?.value
          value=Number.isFinite(Number(n))?Number(n):value
          k+=3
        } else k++
        map[key]=value++
        if(tokens[k]?.value===',') k++
      } else k++
    }
    if(tokens[k]?.value!=='}') continue
    defs[name.value]=map
    ranges.push({start:tokens[i].line,end:tokens[k].line})
    i=k
  }
  return {defs,ranges}
}

function extractClassDefs(clean) {
  const tokens = lex(clean)
  const defs = {}
  const ranges = []

  for (let i = 0; i < tokens.length; i++) {
    if (!['class','struct','union'].includes(tokens[i].value)) continue
    const nameTok = tokens[i + 1]
    if (!nameTok || nameTok.type !== 'id') continue
    let brace = i + 2
    const bases = []
    const virtualBases = new Set()
    if (tokens[brace]?.value === ':') {
      brace++
      let current = []
      while (brace < tokens.length && tokens[brace].value !== '{') {
        const v = tokens[brace].value
        if (v === ',') {
          const filtered = current.filter(x => x !== 'public' && x !== 'private' && x !== 'protected')
          const base = filtered.at(-1)
          if (base) { bases.push(base); if (filtered.includes('virtual')) virtualBases.add(base) }
          current = []
        } else current.push(v)
        brace++
      }
      const filtered = current.filter(x => x !== 'public' && x !== 'private' && x !== 'protected')
      const base = filtered.at(-1)
      if (base) { bases.push(base); if (filtered.includes('virtual')) virtualBases.add(base) }
    }
    if (tokens[brace]?.value !== '{') continue
    const { body: bodyTokens, end } = (() => {
      let depth = 0, e = brace
      for (; e < tokens.length; e++) {
        if (tokens[e].value === '{') depth++
        else if (tokens[e].value === '}') { depth--; if (depth === 0) break }
      }
      return { body: tokens.slice(brace + 1, e), end: e }
    })()

    const def = { name:nameTok.value, kind:tokens[i].value, bases, virtualBases:[...virtualBases], fields:{}, methods:{}, overloadedMethods:{}, line:nameTok.line, union:tokens[i].value==='union' }
    let j = 0
    while (j < bodyTokens.length) {
      if (['public','private','protected'].includes(bodyTokens[j].value) && bodyTokens[j+1]?.value === ':') { j += 2; continue }
      let open = -1, d = 0
      for (let k = j; k < bodyTokens.length; k++) {
        if (bodyTokens[k].value === '(') { open = k; break }
        if (bodyTokens[k].value === ';') break
      }
      if (open >= 0) {
        let par = 0, close = -1
        for (let k = open; k < bodyTokens.length; k++) {
          if (bodyTokens[k].value === '(') par++
          else if (bodyTokens[k].value === ')') { par--; if (par === 0) { close = k; break } }
        }
        if (close >= 0) {
          while (['override','final','const','noexcept'].includes(bodyTokens[close+1]?.value)) close++
        }
        // [PATCH 7] Capture constructor initializer list: A(int v) : x(v) { }
        let initList = []
        let braceStart = close + 1
        if (bodyTokens[braceStart]?.value === ':') {
          let k = braceStart + 1
          while (k < bodyTokens.length && bodyTokens[k].value !== '{') {
            const member = bodyTokens[k]?.value
            if (bodyTokens[k + 1]?.value === '(') {
              let depth = 1, e = k + 2
              while (e < bodyTokens.length && depth > 0) {
                if (bodyTokens[e].value === '(') depth++
                if (bodyTokens[e].value === ')') depth--
                e++
              }
              const argTokens = bodyTokens.slice(k + 2, e - 1)
              argTokens.push({type:'eof', value:'<eof>', line:bodyTokens[k]?.line || 1})
              initList.push({member, argTokens})
              k = e
            } else k++
            if (bodyTokens[k]?.value === ',') k++
          }
          braceStart = k
        }
        if (bodyTokens[braceStart]?.value === '{') {
          const before = bodyTokens.slice(j, open).map(t => t.value)
          const name = before.at(-1)
          const methodName = before.at(-2) === '~' ? `~${name}` : name
          if (name && !['if','for','while','switch'].includes(name)) {
            const {body, end: methodEnd} = parseBalancedBody(bodyTokens, braceStart, clean, new Set([...TYPES, ...Object.keys(defs)]))
            const params = parseParams(bodyTokens.slice(open + 1, close))
            const methodDef = {name:methodName, params, body, line:bodyTokens[j]?.line || nameTok.line, returnType:before.length > 1 ? before.slice(0,-1).join(' ') : '', constructor:methodName===def.name, destructor:methodName===`~${def.name}`, initList}
            if (def.methods[methodName]) {
              def.methods[methodName] = Array.isArray(def.methods[methodName]) ? [...def.methods[methodName], methodDef] : [def.methods[methodName], methodDef]
              def.overloadedMethods[methodName] = true
            } else def.methods[methodName] = methodDef
            j = methodEnd + 1
            continue
          }
        }
      }
      let endStmt = j, braceDepth = 0
      for (; endStmt < bodyTokens.length; endStmt++) {
        const v = bodyTokens[endStmt].value
        if (v === '{') braceDepth++
        if (v === '}') braceDepth--
        if (v === ';' && braceDepth === 0) break
      }
      const part = bodyTokens.slice(j, endStmt)
      try {
        const fieldTokens = [...part, {type:'eof',value:'<eof>',line:part.at(-1)?.line || nameTok.line}]
        const fp = new Parser(fieldTokens, clean, new Set([...TYPES, ...Object.keys(defs)]))
        const field = fp.tryDeclaration()
        if (field?.name && field.type==='decl') {
          // [PATCH 2] Retain self-referential pointer fields like N* next;
          let bitWidth = null
          const colon = part.findIndex(t => t.value === ':')
          if (colon >= 0) {
            const n = Number(part[colon + 1]?.value)
            if (Number.isFinite(n)) bitWidth = Math.max(0, Math.trunc(n))
          }
          def.fields[field.name] = {type:field.dataType, initializer:field.initializer, pointerDepth:field.pointerDepth||0, bitWidth}
        }
      } catch {}
      j = endStmt + 1
    }
    defs[def.name] = def
    ranges.push({kind:tokens[i].value,name:nameTok.value})
    i = end
  }
  return {defs, ranges}
}

function blankTokenRanges(clean, tokens, ranges) {
  if (!ranges.length) return clean
  const chars = clean.split('')
  let searchFrom = 0
  for (const range of ranges) {
    const header = new RegExp(`\\b(?:class|struct)\\s+${range.name}\\b`)
    const tail = clean.slice(searchFrom).match(header)
    if (!tail) continue
    const start = searchFrom + tail.index
    const brace = clean.indexOf('{', start)
    if (brace < 0) continue
    let depth = 0, end = brace
    let quote = null
    for (; end < clean.length; end++) {
      const c = clean[end]
      if (quote) { if (c === '\\' ) end++; else if (c === quote) quote=null; continue }
      if (c === '"' || c === "'") { quote=c; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth===0) { if(clean[end+1]===';') end++; break } }
    }
    for (let i=start;i<=end;i++) if(chars[i] !== '\n') chars[i]=' '
    searchFrom=end+1
  }
  return chars.join('')
}


function extractTypedefs(clean, classDefs={}, enumDefs={}) {
  const aliases = {}
  const ranges = []
  const tokens = lex(clean)
  for (let i=0;i<tokens.length;i++) {
    if (tokens[i].value !== 'typedef') continue
    let j=i+1
    const kind=tokens[j]?.value
    // typedef struct/union { ... } Alias; and typedef enum { ... } Alias;
    if (kind==='struct' || kind==='union' || kind==='enum') {
      let k=j+1
      if(tokens[k]?.type==='id' && tokens[k+1]?.value==='{') k++
      if(tokens[k]?.value==='{') {
        let d=1,e=k+1
        for(;e<tokens.length&&d;e++){ if(tokens[e].value==='{')d++; else if(tokens[e].value==='}')d-- }
        const aliasTok=tokens[e]
        if(aliasTok?.type==='id' && tokens[e+1]?.value===';') {
          if(kind==='enum') {
            let value=0,map={}
            for(let q=k+1;q<e;q++) {
              if(tokens[q].type!=='id') continue
              const key=tokens[q].value
              if(tokens[q+1]?.value==='=') { value=Number(tokens[q+2]?.value); if(!Number.isFinite(value)) value=0; q+=2 }
              map[key]=value++
            }
            enumDefs[aliasTok.value]=map
          } else {
            const def={name:aliasTok.value,kind,union:kind==='union',bases:[],virtualBases:[],fields:{},methods:{},overloadedMethods:{},line:aliasTok.line}
            let q=k+1
            while(q<e) {
              let r=q, depth=0
              for(;r<e;r++){ if(['{','(','['].includes(tokens[r].value))depth++; else if(['}',')',']'].includes(tokens[r].value))depth--; if(tokens[r].value===';'&&depth===0)break }
              if(r<e) {
                const ft=[...tokens.slice(q,r),{type:'eof',value:'<eof>',line:tokens[r].line}]
                try { const fp=new Parser(ft,clean,new Set([...TYPES,...Object.keys(classDefs),aliasTok.value])); const f=fp.tryDeclaration(); if(f?.name) def.fields[f.name]={type:f.dataType,initializer:f.initializer,pointerDepth:f.pointerDepth||0} } catch {}
                q=r+1
              } else break
            }
            classDefs[aliasTok.value]=def
          }
          aliases[aliasTok.value]=kind==='enum'?aliasTok.value:aliasTok.value
          ranges.push({start:tokens[i].line,end:tokens[e+1].line})
          i=e+1
          continue
        }
      }
    }
    // Ordinary typedef aliases, including pointer aliases.
    let end=j, depth=0
    for (; end<tokens.length; end++) {
      const v=tokens[end].value
      if (v==='{' || v==='(' || v==='[' || v==='<') depth++
      else if (v==='}' || v===')' || v===']' || v==='>') depth=Math.max(0,depth-1)
      if (v===';' && depth===0) break
    }
    if (end>=tokens.length) continue
    const part=tokens.slice(j,end)
    const ids=part.filter(t=>t.type==='id').map(t=>t.value)
    if (!ids.length) continue
    const alias=ids.at(-1)
    const before=part.slice(0,-1).map(t=>t.value).join(' ').replace(/\s*\*\s*/g,'*').trim()
    if (before && alias) { aliases[alias]=before; ranges.push({start:tokens[i].line,end:tokens[end].line}) }
    i=end
  }
  return {aliases,ranges}
}

function blankTypedefRanges(clean, ranges) {
  if (!ranges.length) return clean
  const lines=clean.split('\n')
  for (const r of ranges) for (let i=Math.max(0,r.start-1); i<Math.min(lines.length,r.end); i++) lines[i]=lines[i].replace(/[^\n]/g,' ')
  return lines.join('\n')
}

function stripTypedefDeclarations(clean) {
  // Preserve line count while removing typedef declarations from the parser
  // stream. Handle ordinary aliases and typedef struct/union/enum definitions.
  let out=clean.replace(/\btypedef\s+(?:struct|union|enum)(?:\s+[A-Za-z_]\w*)?\s*\{[\s\S]*?\}\s*[A-Za-z_]\w*\s*;/g, m=>m.replace(/[^\n]/g,' '))
  out=out.replace(/\btypedef\s+[^;\n]+;/g, m=>m.replace(/[^\n]/g,' '))
  return out
}

function collectFunctions(code, language) {
  let clean = stripCommentsAndPreprocessor(code)
  const enumInfo = extractEnumDefs(clean)
  const {defs: classDefs, ranges} = extractClassDefs(clean)
  const typedefInfo = extractTypedefs(clean, classDefs, enumInfo.defs)
  clean = blankTokenRanges(clean, lex(clean), ranges)
  clean = stripTypedefDeclarations(clean)
  clean = clean.replace(/\benum(?:\s+(?:class|struct))?\s+[A-Za-z_]\w*\s*\{[^{}]*\}\s*;?/g, m => m.replace(/[^\n]/g,' '))
  const knownTypes = new Set([...Object.keys(classDefs), ...Object.keys(enumInfo.defs), ...Object.keys(typedefInfo.aliases), ...TYPES])
  const tokens = lex(clean)
  const parser = new Parser(tokens, clean, knownTypes)
  const functions = {}
  const globals = []
  for(let i=0;i<tokens.length;i++) {
    if(tokens[i].type!=='id' || ['if','for','while','switch'].includes(tokens[i].value)) continue
    if (!functions[tokens[i].value]) {
      const g = tryGlobalDecl(tokens, i, knownTypes)
      if (g) {
        if (g.decl.multi) for (const d of g.decl.multi) globals.push(d)
        else globals.push(g.decl)
        i = g.end
        continue
      }
    }
    let open=i+1
    if(tokens[open]?.value==='::') { open += 2 }
    if(tokens[open]?.value!=='(') continue
    let d=0,j=open
    for(;j<tokens.length;j++){ if(tokens[j].value==='(')d++; else if(tokens[j].value===')'){d--;if(d===0)break} }
    if(tokens[j+1]?.value!=='{') continue
    const name=tokens[i].value
    const params=parseParams(tokens.slice(open+1,j))
    const {body,end}=parseBalancedBody(tokens,j+1,clean,knownTypes)
    const fnDef={name,params,body,line:tokens[i].line,returnType:'int'}
    functions[name] = functions[name] ? (Array.isArray(functions[name]) ? [...functions[name], fnDef] : [functions[name], fnDef]) : fnDef
    i=end
  }
  if(!functions.main && functions.Main) functions.main=functions.Main
  if(!functions.main) throw new InterpError('Could not find a main() / Main() entry point.',1)
  functions.__structDefs=classDefs
  functions.__enumDefs=enumInfo.defs
  functions.__globals=globals
  functions.__typedefs=typedefInfo.aliases
  return functions
}

function tryGlobalDecl(tokens, i, knownTypes) {
  const start = tokens[i]
  if (!start || start.type !== 'id') return null
  let j = i
  let typeParts = []
  if (['const','static','volatile','unsigned','signed','long','short'].includes(tokens[j]?.value)) {
    typeParts.push(tokens[j].value); j++
  }
  while (j < tokens.length && tokens[j].type === 'id' && (TYPES.has(tokens[j].value) || knownTypes.has(tokens[j].value))) {
    typeParts.push(tokens[j].value)
    j++
  }
  if (!typeParts.length) return null
  let ptr = 0
  while (tokens[j]?.value === '*') { ptr++; j++ }
  if (tokens[j]?.type !== 'id') return null
  const name = tokens[j].value
  j++
  let dimensions = []
  while (tokens[j]?.value === '[') {
    let depth = 1, k = j + 1
    while (k < tokens.length && depth > 0) { if (tokens[k].value === '[') depth++; if (tokens[k].value === ']') depth--; k++ }
    j = k
  }
  if (!['=', ';', ','].includes(tokens[j]?.value)) return null
  let initializer = null
  if (tokens[j].value === '=') {
    let depth = 0, k = j + 1, startTok = k
    while (k < tokens.length) {
      const v = tokens[k].value
      if (v === '(' || v === '[' || v === '{') depth++
      if (v === ')' || v === ']' || v === '}') depth--
      if (depth === 0 && (v === ';' || v === ',')) break
      k++
    }
    const exprTokens = tokens.slice(startTok, k)
    exprTokens.push({type:'eof',value:'<eof>',line:tokens[k]?.line || start.line})
    try {
      const ep = new Parser(exprTokens, '', knownTypes)
      initializer = ep.parseExpression()
    } catch { initializer = null }
    j = k
  }
  if (tokens[j]?.value === ',') {
    const decls = [{type:'decl',name,dataType:typeParts.join(' '),pointerDepth:ptr,dimensions,initializer,reference:false,line:start.line}]
    let k = j
    while (tokens[k]?.value === ',') {
      k++
      let p2 = 0
      while (tokens[k]?.value === '*') { p2++; k++ }
      const n2 = tokens[k]?.value; k++
      let init2 = null
      if (tokens[k]?.value === '=') {
        let depth = 0, s2 = k + 1
        while (k < tokens.length) {
          const v = tokens[k].value
          if (v === '(' || v === '[' || v === '{') depth++
          if (v === ')' || v === ']' || v === '}') depth--
          if (depth === 0 && (v === ';' || v === ',')) break
          k++
        }
        const exprTokens = tokens.slice(s2, k)
        exprTokens.push({type:'eof',value:'<eof>',line:tokens[k]?.line || start.line})
        try { const ep = new Parser(exprTokens, '', knownTypes); init2 = ep.parseExpression() } catch {}
      }
      decls.push({type:'decl',name:n2,dataType:typeParts.join(' '),pointerDepth:p2,dimensions:[],initializer:init2,reference:false,line:start.line})
    }
    return { decl: { multi: decls, line: start.line }, end: k }
  }
  return { decl: {type:'decl',name,dataType:typeParts.join(' '),pointerDepth:ptr,dimensions,initializer,reference:false,line:start.line}, end: j }
}

function parseParams(tokens) {
  const groups=[]; let cur=[]; let d=0
  for(const t of tokens){if(t.value==='<'||t.value==='(')d++; if(t.value==='>'||t.value===')')d--; if(t.value===','&&d===0){groups.push(cur);cur=[]} else cur.push(t)}
  if(cur.length && !(cur.length===1&&cur[0].value==='void')) groups.push(cur)
  return groups.map(g=>{
    const ids=g.filter(t=>t.type==='id').map(t=>t.value)
    const name=ids[ids.length-1] || `arg${g[0]?.line||0}`
    const pointerDepth=g.filter(t=>t.value==='*').length
    const types=ids.slice(0,-1).join(' ')
    return {name,pointerDepth,reference:g.some(t=>t.value==='&'),type:types}
  })
}

function valueToString(v) {
  if(Array.isArray(v)) { if(v.__cString) { const chars=v.slice(0, v.indexOf(0)>=0?v.indexOf(0):v.length).map(x=>typeof x==='number'?String.fromCharCode(x):String(x)); return chars.join('') } return `[${v.map(valueToString).join(', ')}]` }
  if(v && typeof v==='object' && v.__struct) return `{ ${Object.entries(v.fields).map(([k,x])=>`${k}: ${valueToString(x)}`).join(', ')} }`
  if(v && typeof v==='object' && v.__containerType) {
    if (v.__data instanceof Map) return `{${Array.from(v.__data.entries()).map(([k,x])=>`${k}: ${valueToString(x)}`).join(', ')}}`
    if (v.__data instanceof Set) return `{${Array.from(v.__data).map(valueToString).join(', ')}}`
    if (Array.isArray(v.__data)) return `[${v.__data.map(valueToString).join(', ')}]`
  }
  if(typeof v==='number') return Number.isInteger(v)?String(v):String(Number(v.toFixed(8)))
  if(v===undefined) return 'undefined'
  return String(v)
}

export { TYPES, TYPE_WORDS, stripCommentsAndPreprocessor, lex, Parser, parseBalancedBody, extractEnumDefs, extractClassDefs, extractTypedefs, blankTokenRanges, collectFunctions, parseParams, valueToString }