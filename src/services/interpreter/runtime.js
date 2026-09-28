import { InterpError, fmtAddr, TYPES, stripCommentsAndPreprocessor, collectFunctions, valueToString, Parser, lex } from './cppParser.js'
import { normalizeAdvancedCpp } from './advancedFeatures.js'

const MAX_STEPS = 2500
const MAX_LOOP_ITERATIONS = 5000
const MAX_CALL_DEPTH = 100
const STACK_BASE = 0x7ffe6a3b2c80
const STACK_STRIDE = 0x8
const HEAP_BASE = 0x55b8c3a01000
const HEAP_STRIDE = 0x20

export { InterpError }

const INTEGER_TYPES = /^(?:const\s+|static\s+|volatile\s+|unsigned\s+|signed\s+|short\s+|long\s+)*(?:bool|char|short|int|long|size_t|std::size_t|unsigned|signed)(?:\s+int|\s+long)?$/

function isIntegerType(type) {
  const t = String(type || '').trim().replace(/\s+/g, ' ')
  if (!t) return false
  if (/float|double/.test(t)) return false
  if (/string|vector|array|deque|list|set|map|pair|stack|queue/.test(t)) return false
  return INTEGER_TYPES.test(t) || /^(?:bool|char|short|int|long|size_t)$/.test(t)
}

function truncateForType(value, type, pointerDepth = 0) {
  if (pointerDepth > 0) return value
  if (!isIntegerType(type)) return value
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  const t = String(type || '')
  if (/\bbool\b/.test(t)) return value ? 1 : 0
  if (/\bchar\b/.test(t)) return Math.trunc(value) & 0xff
  if (/\bunsigned\b/.test(t)) return Math.trunc(value) >>> 0
  if (/\blong\b|\bsize_t\b/.test(t)) return Math.trunc(value)
  return Math.trunc(value)
}

// [PATCH 5] Element-size lookup for pointer arithmetic.
function pointerStride(slot) {
  if (!slot || !slot.isPointer) return 1
  const t = String(slot.type || '')
  if (/char|bool/.test(t)) return 1
  if (/double|long/.test(t)) return 8
  if (/short/.test(t)) return 2
  return 4
}

export function runInterpreter(code, language='cpp', stdin='') {
  const normalized = language === 'cpp' ? normalizeAdvancedCpp(code) : code
  const clean=stripCommentsAndPreprocessor(normalized)
  let functions
  try { functions=collectFunctions(clean,language) } catch(err) { if(err instanceof InterpError){err.mockUnsupported=err.mockUnsupported!==false;throw err} throw err }

  const heap=[]; const heapByAddress={}; let heapAllocCount=0
  const steps=[]; let stdout=''; let stepCount=0; let returned=false
  const inputQueue=String(stdin||'').trim().split(/\s+/).filter(Boolean); let inputPos=0
  let stackAddressCount=0
  const callFrames=[]
  const ctx={heap,heapByAddress,functions}

  function allocateHeap(size, value=0, kind='malloc', meta={}) {
    size=Math.max(1,Math.trunc(Number(size)||1)); const addr=HEAP_BASE+heapAllocCount*HEAP_STRIDE; heapAllocCount++
    const block={address:addr,value:size>1?Array.from({length:size},()=>clone(value)):clone(value),freed:false,size,kind,...meta}
    heap.push(block); heapByAddress[addr]=heap.length-1; return addr
  }
  function clone(v){if(Array.isArray(v))return v.map(clone); if(v&&typeof v==='object')return JSON.parse(JSON.stringify(v)); return v}
  function findBlock(addr){return addr in heapByAddress?heap[heapByAddress[addr]]:null}

  function snapshot(line,note) {
    steps.push({line,note,stack:frameVars().map(v=>({...v,frame:callFrames.find(f=>Array.from(f.values.values()).some(s=>s.address===v.address))?.name})),heap:heap.map(b=>({...b,value:clone(b.value)})),callStack:callFrames.map(f=>f.name),stdoutSoFar:stdout})
  }
  function guard(line){stepCount++; if(stepCount>MAX_STEPS){const e=new InterpError(`execution stopped after ${MAX_STEPS} steps (possible infinite loop)`,line);e.mockUnsupported=false;throw e}}

  function currentThisObject(frame) {
    for(let i=callFrames.length-1;i>=0;i--){
      const f=callFrames[i]
      const slot=f.scopes.flatMap(s=>Array.from(s.values())).find(s=>s.name==='this')
      if(slot){
        const value=slot.isPointer ? findBlock(slot.value)?.value : slot.value
        if(value?.__struct) return value
      }
    }
    return null
  }

  const globals = new Map()
  function makeGlobalSlot(name, value, {pointer=false, reference=null, type='auto', address=null}={}) {
    if(!address){address=STACK_BASE-stackAddressCount*STACK_STRIDE;stackAddressCount++}
    const slot={name,value,address,isPointer:pointer,reference,type,global:true}
    globals.set(name,slot); return slot
  }

  function resolveVar(name,frame) {
    for(let i=callFrames.length-1;i>=0;i--){ const f=callFrames[i]; for(let j=f.scopes.length-1;j>=0;j--){ if(f.scopes[j].has(name)) return {frame:f,slot:f.scopes[j].get(name)} } }
    if (globals.has(name)) return { frame: null, slot: globals.get(name) }
    const obj=currentThisObject(frame)
    if(obj?.fields && Object.prototype.hasOwnProperty.call(obj.fields,name)) return {frame,slot:{name,value:obj.fields[name],isPointer:false,type:obj.type,field:true,obj}}
    throw new InterpError(`'${name}' is not defined`,frame?.line)
  }
  function makeSlot(frame,name,value,{pointer=false,reference=null,type='auto',address=null}={}) {
    if(!address){address=STACK_BASE-stackAddressCount*STACK_STRIDE;stackAddressCount++}
    const slot={name,value,address,isPointer:pointer,reference,type}; frame.values.set(name,slot); frame.scopes.at(-1).set(name,slot); return slot
  }
  function frameVars(){return callFrames.flatMap(f=>Array.from(f.values.values()).map(s=>({name:s.name,value:clone(s.value),address:s.address,isPointer:s.isPointer,type:s.type,reference:s.reference}))).filter((v,i,a)=>a.findIndex(x=>x.address===v.address)===i)}

  function deref(addr,line) {
    if(addr===0 || addr===null || addr===undefined) throw new InterpError('dereferenced null/invalid pointer (segmentation fault)',line)
    const slot=callFrames.flatMap(f=>Array.from(f.values.values())).find(s=>s.address===addr) || Array.from(globals.values()).find(s=>s.address===addr)
    if(slot) return slot.value
    const block=findBlock(addr); if(block){if(block.freed)throw new InterpError(`dereferenced freed memory at ${fmtAddr(addr)} (use-after-free)`,line);return Array.isArray(block.value)?block.value[0]:block.value}
    throw new InterpError(`invalid dereference of ${fmtAddr(addr)} (segmentation fault)`,line)
  }
  function writeAddr(addr,value,line) {
    const slot=callFrames.flatMap(f=>Array.from(f.values.values())).find(s=>s.address===addr) || Array.from(globals.values()).find(s=>s.address===addr)
    if(slot){slot.value=clone(value);return}
    const block=findBlock(addr); if(block){if(block.freed)throw new InterpError(`write to freed memory at ${fmtAddr(addr)} (use-after-free)`,line); if(Array.isArray(block.value))block.value[0]=clone(value);else block.value=clone(value);return}
    throw new InterpError(`invalid write to ${fmtAddr(addr)} (segmentation fault)`,line)
  }

  // [PATCH 5] Resolve a raw address to either a heap block or a stack array element.
  function resolveAddress(addr) {
    if (typeof addr !== 'number') return null
    const block = findBlock(addr)
    if (block) return { kind: 'heap', block, index: 0, address: addr }
    const allSlots = [...callFrames.flatMap(f=>Array.from(f.values.values())), ...Array.from(globals.values())]
    for (const slot of allSlots) {
      if (!Array.isArray(slot.value)) continue
      const idx = addr - slot.address
      if (idx >= 0 && idx < slot.value.length) {
        return { kind: 'stack', slot, index: idx, address: addr }
      }
    }
    return null
  }

  function pointerTarget(node,frame){
    if(node?.type==='binary' && (node.op==='+'||node.op==='-')){
      const base=evalNode(node.left,frame); const offset=Math.trunc(evalNode(node.right,frame))*(node.op==='-'?-1:1)
      const b=findBlock(base)
      if(b) {
        // [PATCH 5] Use element size of the pointer's target, not HEAP_STRIDE.
        const elemSize = b.elementSize || 4
        return {block:b,index:offset,address:base+offset*elemSize}
      }
      const resolved = resolveAddress(base)
      if (resolved && resolved.kind === 'stack') {
        const slot = resolved.slot
        const targetIndex = resolved.index + offset
        return { stackSlot: slot, index: targetIndex, address: slot.address + targetIndex }
      }
    }
    return null
  }

  function lvalue(node,frame) {
    if(node.type==='var') {const r=resolveVar(node.name,frame); if(r.slot.field){return {get:()=>r.slot.obj.fields[r.slot.name],set:v=>{r.slot.obj.fields[r.slot.name]=clone(v)},address:0,slot:r.slot}} if(r.slot.reference){return {get:()=>deref(r.slot.reference,node.line),set:v=>writeAddr(r.slot.reference,v,node.line),address:r.slot.reference,slot:r.slot}} return {get:()=>r.slot.value,set:v=>{r.slot.value=clone(v)},address:r.slot.address,slot:r.slot}}
    if(node.type==='unary'&&node.op==='*'){const pt=pointerTarget(node.expr,frame); if(pt){if(pt.stackSlot){const arr=pt.stackSlot.value;if(pt.index<0||pt.index>=arr.length)throw new InterpError(`pointer arithmetic out of bounds (index ${pt.index})`,node.line);return {get:()=>arr[pt.index],set:v=>{arr[pt.index]=clone(v)},address:pt.address,slot:pt.stackSlot}} if(pt.block.freed)throw new InterpError('dereferenced freed memory (use-after-free)',node.line);const arr=Array.isArray(pt.block.value)?pt.block.value:[pt.block.value];if(pt.index<0||pt.index>=arr.length)throw new InterpError(`pointer arithmetic out of bounds (index ${pt.index})`,node.line);return {get:()=>arr[pt.index],set:v=>{arr[pt.index]=clone(v)},address:pt.address}} const addr=evalNode(node.expr,frame); return {get:()=>deref(addr,node.line),set:v=>writeAddr(addr,v,node.line),address:addr}}
    if(node.type==='index'){const base=evalNode(node.target,frame); const idx=Math.trunc(evalNode(node.index,frame)); const targetSlot=node.target.type==='var'?resolveVar(node.target.name,frame).slot:null; const b=findBlock(base); if(b){if(b.freed)throw new InterpError('invalid array access: freed memory',node.line); const arr=Array.isArray(b.value)?b.value:[b.value]; if(idx<0||idx>=arr.length)throw new InterpError(`index ${idx} out of bounds (size ${arr.length})`,node.line); return {get:()=>arr[idx],set:v=>{arr[idx]=clone(v)},address:base+idx}} if(targetSlot&&Array.isArray(targetSlot.value)){const arr=targetSlot.value;if(idx<0||idx>=arr.length)throw new InterpError(`index ${idx} out of bounds (size ${arr.length})`,node.line);return {get:()=>arr[idx],set:v=>{arr[idx]=clone(v)},address:targetSlot.address+idx}} if(typeof base==='string'){if(idx<0||idx>=base.length)throw new InterpError(`string index ${idx} out of bounds (size ${base.length})`,node.line); return {get:()=>base[idx],set:v=>{throw new InterpError('cannot assign to string element',node.line)}}} throw new InterpError('invalid array access',node.line)}
    if(node.type==='member'||node.type==='memberPtr'){
      let obj = node.type==='memberPtr' ? evalNode(node.target,frame) : evalNode(node.target,frame)
      if(node.type==='memberPtr' && typeof obj==='number') obj=deref(obj,node.line)
      if(!obj||!obj.__struct)throw new InterpError(`member '${node.prop}' accessed on non-object`,node.line)
      // [PATCH 2] Auto-create pointer-typed members on first assignment (N* next).
      return {get:()=>obj.fields[node.prop],set:v=>{obj.fields[node.prop]=clone(v)}}
    }
    throw new InterpError('expression is not assignable',node.line)
  }

  function sizeofType(type){const t=String(type||'').replace(/\s+/g,' '); if(/char|bool/.test(t))return 1; if(/double/.test(t))return 8; if(/long/.test(t))return 8; return 4}

  function collectClassFields(def, allDefs, seen=new Set()) {
    if (!def || seen.has(def.name)) return {}
    seen.add(def.name)
    const out = {}
    for (const base of def.bases || []) Object.assign(out, collectClassFields(allDefs[base], allDefs, seen))
    Object.assign(out, def.fields || {})
    return out
  }

  function chooseOverload(fn, args) {
    const list = Array.isArray(fn) ? fn : [fn]
    return list.find(x => x && x.params.length === args.length) || list[0] || null
  }

  function findMethod(typeName, methodName, seen=new Set(), args=[]) {
    const def=functions.__structDefs?.[typeName]
    if(!def || seen.has(typeName)) return null
    seen.add(typeName)
    if(def.methods?.[methodName]) return {method:chooseOverload(def.methods[methodName],args),def}
    for(const base of def.bases||[]) { const found=findMethod(base,methodName,seen,args); if(found)return found }
    return null
  }

  function runConstructor(typeName, obj, addr, argsNodes, caller, state = null) {
    if(!obj?.__struct) return
    const construction = state || { virtualConstructed: new Set() }
    const def=functions.__structDefs?.[typeName]
    for(const base of def?.bases||[]) {
      const isVirtual = (def?.virtualBases || []).includes(base)
      if (isVirtual && construction.virtualConstructed.has(base)) continue
      if (isVirtual) construction.virtualConstructed.add(base)
      runConstructor(base,obj,addr,[],caller,construction)
    }
    const found=findMethod(typeName,typeName)
    if(found?.method) invokeMethod(found.method,obj,addr,argsNodes,caller,`${typeName}::${typeName}()` )
    snapshot(found?.method?.line || caller.line,`construct ${typeName} object${addr ? ` at ${fmtAddr(addr)}` : ''}`)
  }

  function invokeMethod(method,obj,addr,argsNodes,caller,frameName) {
    if(callFrames.length>=MAX_CALL_DEPTH)throw new InterpError('maximum call depth exceeded',caller?.line)
    const frame={name:frameName,values:new Map(),scopes:[new Map()],line:method.line}
    callFrames.push(frame)
    makeSlot(frame,'this',addr ? addr : obj,{pointer:Boolean(addr),type:addr ? `${obj.type}*` : obj.type})
    const values=argsNodes.map(a=>evalNode(a,caller))
    method.params.forEach((p,i)=>{
      let v = values[i] ?? 0
      if (!p.pointerDepth && !p.reference && p.type) v = truncateForType(v, p.type, 0)
      makeSlot(frame,p.name,v,{pointer:p.pointerDepth>0,reference:p.reference,type:'parameter'})
    })
    // [PATCH 7] Apply constructor initializer list to the object's fields.
    if (method.initList?.length && obj?.__struct) {
      for (const init of method.initList) {
        try {
          const ep = new Parser(init.argTokens, '', new Set())
          const v = evalNode(ep.parseExpression(), frame)
          obj.fields[init.member] = v
        } catch {}
      }
    }
    snapshot(method.line,`enter ${frameName}`)
    let result=0
    try {execList(method.body,frame); result=frame.__return??0}
    finally {snapshot(caller?.line || method.line,`return from ${frameName}`);callFrames.pop()}
    return result
  }

  function evalNode(node,frame) {
    switch(node.type){
      case 'literal':return node.value
      case 'var':{
        try { const r=resolveVar(node.name,frame); return r.slot.field?r.slot.obj.fields[r.slot.name]:r.slot.value }
        catch {
          for(const values of Object.values(functions.__enumDefs||{})) if(Object.prototype.hasOwnProperty.call(values,node.name)) return values[node.name]
          if (functions[node.name]) return { __functionRef: true, name: node.name }
          throw new InterpError(`'${node.name}' is not defined`,frame?.line)
        }
      }
      case 'cast': {
        const v = evalNode(node.expr,frame)
        return truncateForType(v, node.dataType, node.pointerDepth || 0)
      }
      case 'new': {
        const count=node.count ? Math.max(1,Math.trunc(evalNode(node.count,frame))) : 1
        const def=functions.__structDefs?.[node.dataType]
        if(def && !node.count){
          const obj={__struct:true,type:node.dataType,fields:{}}
          const allFields=collectClassFields(def,functions.__structDefs)
          for(const [k,meta] of Object.entries(allFields)) obj.fields[k]=meta.initializer ? evalNode(meta.initializer,frame) : (meta.pointerDepth>0 ? 0 : 0)
          const addr=allocateHeap(1,obj,'new-object')
          runConstructor(node.dataType,findBlock(addr)?.value,addr,node.initArgs||[],frame)
          return addr
        }
        const init=node.initArgs?.length ? evalNode(node.initArgs[0],frame) : 0
        return allocateHeap(count,init,'new',{elementSize: sizeofType(node.dataType)})
      }
      case 'ternary':return evalNode(node.cond,frame)?evalNode(node.yes,frame):evalNode(node.no,frame)
      case 'member':return lvalue(node,frame).get()
      case 'memberPtr':return lvalue(node,frame).get()
      case 'index':return lvalue(node,frame).get()
      case 'unary': {
        if(node.op==='&') return lvalue(node.expr,frame).address
        if(node.op==='*'){const pt=pointerTarget(node.expr,frame);if(pt){if(pt.stackSlot){const arr=pt.stackSlot.value;if(pt.index<0||pt.index>=arr.length)throw new InterpError(`pointer arithmetic out of bounds (index ${pt.index})`,node.line);return arr[pt.index]} if(pt.block.freed)throw new InterpError('dereferenced freed memory (use-after-free)',node.line);const arr=Array.isArray(pt.block.value)?pt.block.value:[pt.block.value];if(pt.index<0||pt.index>=arr.length)throw new InterpError(`pointer arithmetic out of bounds (index ${pt.index})`,node.line);return arr[pt.index]} return deref(evalNode(node.expr,frame),node.line)}
        if(node.op==='++'||node.op==='--'){
          const lv=lvalue(node.expr,frame)
          const old=Number(lv.get()||0)
          // [PATCH 5] Advance by element size for typed pointers.
          const stride = lv.slot?.isPointer ? pointerStride(lv.slot) : 1
          const n = old + (node.op==='++' ? stride : -stride)
          lv.set(n); return n
        }
        const v=evalNode(node.expr,frame); if(node.op==='!')return v?0:1; if(node.op==='-')return-v; if(node.op==='+')return+v; if(node.op==='~')return~v
        return v
      }
      case 'postfix': {
        const lv=lvalue(node.expr,frame)
        const old=lv.get()
        const stride = lv.slot?.isPointer ? pointerStride(lv.slot) : 1
        lv.set(Number(old||0) + (node.op==='++' ? stride : -stride))
        return old
      }
      case 'binary': {
        if(node.op==='&&'){const l=evalNode(node.left,frame);return l&&evalNode(node.right,frame)?1:0}
        if(node.op==='||'){const l=evalNode(node.left,frame);return l||evalNode(node.right,frame)?1:0}
        const l=evalNode(node.left,frame),r=evalNode(node.right,frame)
        // [PATCH 8] Operator overloading for structs.
        if (typeof l === 'object' && l?.__struct && ['+','-','==','!=','<','>'].includes(node.op)) {
          const found = findMethod(l.type, `operator${node.op}`, new Set(), [node.right])
          if (found) {
            const addr = findObjectAddress(l)
            return invokeMethod(found.method, l, addr, [node.right], frame, `${l.type}::operator${node.op}()`)
          }
        }
        if((node.op==='+'||node.op==='-') && typeof l==='number' && (findBlock(l)||resolveAddress(l))) {
          // [PATCH 5] Pointer arithmetic scales by element size.
          const b = findBlock(l)
          const elemSize = b?.elementSize || 1
          return l + (node.op==='+'?r:-r)*elemSize
        }
        switch(node.op){case '+':return typeof l==='string'||typeof r==='string'?`${l}${r}`:l+r;case '-':return l-r;case '*':return l*r;case '/':return r===0?0:(Number.isInteger(l)&&Number.isInteger(r)?Math.trunc(l/r):l/r);case '%':return r===0?0:l%r;case '<':return l<r?1:0;case '>':return l>r?1:0;case '<=':return l<=r?1:0;case '>=':return l>=r?1:0;case '==':return l===r?1:0;case '!=':return l!==r?1:0;case '&':return (l|0)&(r|0);case '|':return (l|0)|(r|0);case '^':return (l|0)^(r|0);case '<<':return (l|0)<<(r|0);case '>>':return (l|0)>>(r|0);default:return 0}
      }
      case 'assignExpr': {const lv=lvalue(node.left,frame);const r=evalNode(node.right,frame);let v=r;if(node.op!=='='){const l=lv.get();const map={'+=':(a,b)=>a+b,'-=':(a,b)=>a-b,'*=':(a,b)=>a*b,'/=':(a,b)=>b===0?a:(Number.isInteger(a)&&Number.isInteger(b)?Math.trunc(a/b):a/b),'%=':(a,b)=>b===0?a:a%b,'&=':(a,b)=>(a|0)&(b|0),'|=':(a,b)=>(a|0)|(b|0),'^=':(a,b)=>(a|0)^(b|0),'<<=':(a,b)=>(a|0)<<(b|0),'>>=':(a,b)=>(a|0)>>(b|0)};v=map[node.op]?.(l,r)??r} const slot=lv.slot; if(slot&&!slot.reference&&!slot.field&&slot.type){v=truncateForType(v,slot.type,slot.isPointer?1:0)} lv.set(v);return v }
      case 'commaExpr': { let last = 0; for (const e of node.exprs) last = evalNode(e, frame); return last }
      case 'call':return callFunction(node,frame)
      default:return 0
    }
  }

  function evalPrintCall(node,frame) {
    const name=node.callee?.name || node.callee?.prop
    if(!name || !['printf','puts','putchar','Write','WriteLine'].includes(name)) return null
    const args=node.args.map(a=>evalNode(a,frame))
    if(name==='printf'){let fmt=String(args.shift()??'');let i=0;return fmt.replace(/%[diuoxXfpcs]/g,s=>{const v=args[i++]; if(s==='%p')return fmtAddr(v); if(s==='%c')return String.fromCharCode(Number(v)||0);return valueToString(v)})}
    if(name==='puts'){return `${args[0]??''}\n`}
    if(name==='putchar'){return String.fromCharCode(Number(args[0])||0)}
    if(name==='strlen')return String(args[0]?.length??0)
    return null
  }

  function findObjectAddress(obj) {
    const block=heap.find(b=>!b.freed && b.value===obj)
    return block?.address || 0
  }

  function callFunction(node,caller) {
    let name=node.callee?.name
    if (node.callee?.type === 'var' && !functions[node.callee.name] && node.callee.name !== 'lambda_create') {
      try {
        const ref = evalNode(node.callee, caller)
        if (ref?.__functionRef) name = ref.name
      } catch {}
    }
    const print=evalPrintCall(node,caller); if(print!==null){stdout+=print;return print}

    // [PATCH 9] memcpy / memset / strcpy / strcat / strcmp byte-level ops.
    if(['memcpy','memmove','memset','strcpy','strcat','strcmp'].includes(name)){
      const args=node.args.map(a=>evalNode(a,caller))
      if(name==='memcpy'||name==='memmove'){
        const [dst,src,n]=args; const db=findBlock(dst),sb=findBlock(src)
        if(db&&sb){const bytes=Math.min(n,db.size*4,sb.size*4);for(let i=0;i<bytes;i++)db.value[i]=sb.value[i]??0}
        return dst
      }
      if(name==='memset'){const [dst,val,n]=args;const db=findBlock(dst);if(db)for(let i=0;i<n;i++)db.value[i]=val&0xff;return dst}
      if(name==='strcpy'||name==='strcat'){
        const [dst,src]=args; const db=findBlock(dst)
        const bytes=String(src).split('').map(c=>c.charCodeAt(0))
        if(db){ if(name==='strcpy')db.value=bytes.concat([0]); else db.value=db.value.concat(bytes,[0]) }
        return dst
      }
      if(name==='strcmp'){const [a,b]=args;return String(a)<String(b)?-1:String(a)>String(b)?1:0}
    }

    if(node.callee?.type==='member' || node.callee?.type==='memberPtr') {
      let target = evalNode(node.callee.target,caller)
      let obj = target
      if(node.callee.type==='memberPtr' && typeof target==='number') obj=deref(target,node.line)

      // [PATCH 4] map/set/stack/queue containers.
      if (obj && typeof obj === 'object' && obj.__containerType) {
        const ct = obj.__containerType
        const vals = node.args.map(a => evalNode(a, caller))
        const prop = node.callee.prop
        if (/map|unordered_map/.test(ct)) {
          if (!obj.__data) obj.__data = new Map()
          if (prop === 'at') { return obj.__data.get(vals[0]) ?? 0 }
          if (prop === 'insert') { obj.__data.set(vals[0], vals[1] ?? 0); snapshot(node.line, `map.insert(${valueToString(vals[0])})`); return 0 }
          if (prop === 'size') return obj.__data.size
          if (prop === 'count') return obj.__data.has(vals[0]) ? 1 : 0
          if (prop === 'erase') { obj.__data.delete(vals[0]); return 0 }
          if (prop === 'clear') { obj.__data.clear(); return 0 }
          if (prop === 'empty') return obj.__data.size === 0 ? 1 : 0
        }
        if (/set|unordered_set/.test(ct)) {
          if (!obj.__data) obj.__data = new Set()
          if (prop === 'insert') { obj.__data.add(vals[0]); snapshot(node.line, `set.insert(${valueToString(vals[0])})`); return 0 }
          if (prop === 'size') return obj.__data.size
          if (prop === 'count') return obj.__data.has(vals[0]) ? 1 : 0
          if (prop === 'erase') { obj.__data.delete(vals[0]); return 0 }
          if (prop === 'clear') { obj.__data.clear(); return 0 }
          if (prop === 'empty') return obj.__data.size === 0 ? 1 : 0
        }
        if (/stack/.test(ct)) {
          if (!obj.__data) obj.__data = []
          if (prop === 'push') { obj.__data.push(vals[0]); snapshot(node.line, `stack.push(${valueToString(vals[0])})`); return 0 }
          if (prop === 'pop') { obj.__data.pop(); return 0 }
          if (prop === 'top') return obj.__data[obj.__data.length - 1] ?? 0
          if (prop === 'size') return obj.__data.length
          if (prop === 'empty') return obj.__data.length === 0 ? 1 : 0
        }
        if (/queue/.test(ct)) {
          if (!obj.__data) obj.__data = []
          if (prop === 'push') { obj.__data.push(vals[0]); snapshot(node.line, `queue.push(${valueToString(vals[0])})`); return 0 }
          if (prop === 'pop') { obj.__data.shift(); return 0 }
          if (prop === 'front') return obj.__data[0] ?? 0
          if (prop === 'back') return obj.__data[obj.__data.length - 1] ?? 0
          if (prop === 'size') return obj.__data.length
          if (prop === 'empty') return obj.__data.length === 0 ? 1 : 0
        }
      }

      if(typeof obj === 'string' && typeof node.callee.prop === 'string') {
        const vals=node.args.map(a=>evalNode(a,caller))
        if(node.callee.prop==='size' || node.callee.prop==='length') return obj.length
        if(node.callee.prop==='empty') return obj.length===0 ? 1 : 0
        if(node.callee.prop==='at' || node.callee.prop==='substr') return node.callee.prop==='at' ? (obj[Math.trunc(vals[0]??0)] ?? '') : obj.substring(Math.trunc(vals[0]??0), vals[1] == null ? undefined : Math.trunc(vals[0]??0)+Math.trunc(vals[1]))
        if(node.callee.prop==='c_str') return obj
      }
      if(Array.isArray(obj) && typeof node.callee.prop==='string') {
        const vals=node.args.map(a=>evalNode(a,caller))
        if(node.callee.prop==='push_back' || node.callee.prop==='push_front') { node.callee.prop==='push_back' ? obj.push(vals[0]) : obj.unshift(vals[0]); snapshot(node.line,`${node.callee.prop}(${valueToString(vals[0])})`); return 0 }
        if(node.callee.prop==='pop_back') { const v=obj.pop(); snapshot(node.line,'pop_back()'); return v ?? 0 }
        if(node.callee.prop==='pop_front') { const v=obj.shift(); snapshot(node.line,'pop_front()'); return v ?? 0 }
        if(node.callee.prop==='size') return obj.length
        if(node.callee.prop==='empty') return obj.length===0 ? 1 : 0
        if(node.callee.prop==='clear') { obj.length=0; snapshot(node.line,'clear()'); return 0 }
        if(node.callee.prop==='at') { const i=Math.trunc(vals[0]??0); if(i<0||i>=obj.length) throw new InterpError(`container index ${i} out of bounds`,node.line); return obj[i] }
        if(node.callee.prop==='front') return obj[0] ?? 0
        if(node.callee.prop==='back') return obj[obj.length-1] ?? 0
      }
      if(!obj?.__struct) throw new InterpError(`method '${node.callee.prop}' called on non-object`,node.line)
      const found=findMethod(obj.type,node.callee.prop,new Set(),node.args)
      if(!found) { const e=new InterpError(`unsupported method '${obj.type}::${node.callee.prop}'`,node.line); e.mockUnsupported=true; throw e }
      const addr=typeof target==='number' ? target : findObjectAddress(obj)
      return invokeMethod(found.method,obj,addr,node.args,caller,`${obj.type}::${node.callee.prop}()` )
    }
    if(name==='lambda_create') {
      const ref = evalNode(node.args[0], caller)
      if (!ref?.__functionRef) throw new InterpError('lambda_create requires a function reference', node.line)
      // [PATCH 10] Support captured-by-reference markers: {__refName, addr}
      const bound = node.args.slice(1).map(a => {
        const v = evalNode(a, caller)
        if (v && typeof v === 'object' && v.__refAddress !== undefined) {
          return { __refAddress: v.__refAddress, __refName: v.__refName }
        }
        return clone(v)
      })
      return { __functionRef: true, name: ref.name, bound }
    }
    // [PATCH 10] Reference capture helper used by advancedFeatures.js.
    if (name === '__make_ref') {
      const lv = lvalue(node.args[0], caller)
      return { __refAddress: lv.address, __refName: node.args[0]?.name || 'ref' }
    }
    // [PATCH 10] Reference load/store inside lambda body.
    if (name === '__ref_load') {
      const r = evalNode(node.args[0], caller)
      if (r?.__refAddress !== undefined) return deref(r.__refAddress, node.line)
      return r
    }
    if (name === '__ref_store') {
      const r = evalNode(node.args[0], caller)
      const v = evalNode(node.args[1], caller)
      if (r?.__refAddress !== undefined) { writeAddr(r.__refAddress, v, node.line); return v }
      return v
    }
    if(name==='sizeof'){ const a=node.args?.[0]; if(a?.type==='var'){try{const v=resolveVar(a.name,caller).slot; if(v.isPointer)return 8; if(Array.isArray(v.value))return v.value.length*4; return sizeofType(v.type)}catch{ return sizeofType(a.name)}} if(a?.type==='cast'||a?.type==='new')return sizeofType(a.dataType||a.type); return 4 }
    if(name==='scanf') { const args=node.args.map(a=>evalNode(a,caller)); const fmt=String(args[0]??''); let ai=1; for(const spec of fmt.match(/%[difsc]/g)||[]){ const raw=inputQueue[inputPos++]??''; const argNode=node.args[ai++]; const lv=argNode?.type==='unary'&&argNode.op==='&' ? lvalue(argNode.expr,caller) : lvalue(argNode,caller); lv.set(spec==='%s'||spec==='%c'?raw:Number(raw)) } return 0 }
    if(['malloc','calloc','realloc','free'].includes(name)){
      const args=node.args.map(a=>evalNode(a,caller));
      if(name==='malloc')return allocateHeap(Math.max(1,Math.ceil((args[0]||4)/4)),0,'malloc',{elementSize:1})
      if(name==='calloc')return allocateHeap(Math.max(1,Math.trunc(args[0]||1)),0,'calloc',{elementSize:1})
      if(name==='realloc'){const old=args[0], bytes=args[1]||4,b=findBlock(old); if(!b)return allocateHeap(Math.ceil(bytes/4),0,'realloc'); const n=Math.max(1,Math.ceil(bytes/4)),oldArr=Array.isArray(b.value)?b.value:[b.value];b.value=n>1?Array.from({length:n},(_,i)=>oldArr[i]??0):oldArr[0]??0;b.size=n;return old}
      if(name==='free'){const b=findBlock(args[0]);if(b){if(b.freed)throw new InterpError(`double free of ${fmtAddr(args[0])}`,node.line);b.freed=true}return 0}
    }
    if(name==='abs'||name==='labs')return Math.abs(Number(evalNode(node.args[0],caller)||0))
    if(name==='max'||name==='min'){const a=node.args.map(x=>Number(evalNode(x,caller)));return name==='max'?Math.max(...a):Math.min(...a)}
    const rawFn=functions[name]
    const fn=chooseOverload(rawFn,node.args)
    if(!fn){const e=new InterpError(`unsupported function '${name}'`,node.line);e.mockUnsupported=true;throw e}
    if(callFrames.length>=MAX_CALL_DEPTH)throw new InterpError('maximum call depth exceeded',node.line)
    const frame={name:`${name}()`,values:new Map(),scopes:[new Map()],line:node.line}
    callFrames.push(frame)
    let calleeRef = null
    if (node.callee?.type === 'var') {
      try { calleeRef = evalNode(node.callee, caller) } catch { calleeRef = null }
    }
    const bound = calleeRef?.__functionRef ? (calleeRef.bound || []) : []
    const values = [...bound, ...node.args.map(a => evalNode(a,caller))]
    fn.params.forEach((p,i)=>{
      let v = values[i] ?? 0
      // [PATCH 10] Unwrap captured references for by-ref captures.
      if (v && typeof v === 'object' && v.__refAddress !== undefined) {
        v = deref(v.__refAddress, node.line)
      }
      if (!p.pointerDepth && !p.reference && p.type) v = truncateForType(v, p.type, 0)
      makeSlot(frame,p.name,v,{pointer:p.pointerDepth>0,reference:p.reference,type:'parameter'})
    })
    snapshot(fn.line,`enter ${name}()`)
    let result=0
    try {execList(fn.body,frame); result=frame.__return??0} finally {snapshot(node.line,`return from ${name}()`);callFrames.pop()}
    return result
  }

  function execList(list,frame) {for(const s of list){if(returned)break;const signal=execStmt(s,frame);if(signal==='return'||signal==='break'||signal==='continue')return signal} }
  function execStmt(s,frame){
    guard(s.line); if(stepCount>MAX_STEPS)return
    switch(s.type){
      case 'block': { frame.scopes.push(new Map()); try { return execList(s.body,frame) } finally { frame.scopes.pop() } }
      // [PATCH 1] Multiple declarations sharing a type: int a=1, b=2, c;
      case 'multiDecl': {
        for (const d of s.decls) execStmt({...d, line: s.line}, frame)
        return
      }
      case 'decl': {
        let value=0; let pointer=s.pointerDepth>0
        const structDef=functions.__structDefs?.[s.dataType]
        // [PATCH 2] Array of structs: struct Point pts[3];
        if(structDef && !pointer && s.dimensions.length){
          const n=Math.max(1,Math.trunc(evalNode(s.dimensions[0],frame)))
          const allFields=collectClassFields(structDef,functions.__structDefs)
          value=Array.from({length:n},()=>{
            const obj={__struct:true,type:s.dataType,fields:{}}
            for(const [k,meta] of Object.entries(allFields)) obj.fields[k]=meta.initializer ? evalNode(meta.initializer,frame) : (meta.pointerDepth>0 ? 0 : 0)
            return obj
          })
          if (s.initializer?.type==='array') {
            s.initializer.values.forEach((row, i) => {
              if (row.type === 'array' && value[i]) {
                Object.keys(allFields).forEach((k, j) => { if (row.values[j]) value[i].fields[k] = evalNode(row.values[j], frame) })
              }
            })
          }
        } else if(structDef && !pointer){
          value={__struct:true,type:s.dataType,fields:{}}
          const allFields=collectClassFields(structDef,functions.__structDefs)
          for(const [k,meta] of Object.entries(allFields)) value.fields[k]=meta.initializer ? evalNode(meta.initializer,frame) : (meta.pointerDepth>0 ? 0 : 0)
          if(s.initializer?.type==='array'){ const vals=s.initializer.values.map(x=>evalNode(x,frame)); Object.keys(allFields).forEach((k,i)=>{value.fields[k]=vals[i]??value.fields[k]}) }
        } else if(/^(?:std::)?(?:vector|array|deque|list)/.test(s.dataType) && s.initializer?.type==='array'){
          value=s.initializer.values.map(x=>x.type==='array' ? x.values.map(y=>evalNode(y,frame)) : evalNode(x,frame)); value.__containerType=s.dataType
        } else if(/^(?:std::)?(?:vector|array|deque|list)/.test(s.dataType)){
          if (s.initializer?.type==='constructorInit') {
            // [PATCH 3] vector<int> v(N) → N zeros, backed by a heap block.
            const first = s.initializer.args[0] ? Math.max(0, Math.trunc(evalNode(s.initializer.args[0], frame))) : 0
            value = Array.from({length:first},()=>0)
            const addr = allocateHeap(Math.max(1, first), 0, 'vector', {elementSize:4, containerType:s.dataType})
            const blk = findBlock(addr)
            blk.value = value
            value.__heapAddress = addr
          } else {
            value=s.initializer?.type==='array' ? s.initializer.values.map(x=>evalNode(x,frame)) : []
            value.__containerType=s.dataType
          }
        // [PATCH 4] map / set / stack / queue get a tagged container object.
        } else if(/^(?:std::)?(?:map|unordered_map|set|unordered_set|stack|queue)/.test(s.dataType)){
          value = { __containerType: s.dataType, __data: null }
          const addr = allocateHeap(1, value, 'container', {containerType:s.dataType})
          value.__heapAddress = addr
        } else if(s.initializer?.type==='array'){
          // [PATCH 1] Nested initializer lists for N-D arrays.
          const buildValue = (node) => node.type==='array'
            ? node.values.map(buildValue)
            : evalNode(node, frame)
          value = buildValue(s.initializer)
        }
        else if(s.initializer && s.initializer.type!=='constructorInit')value=evalNode(s.initializer,frame)
        else if(s.dimensions.length && !s.initializer){
          // [PATCH 1] N-D row-major allocation.
          const dims = s.dimensions.map(d => Math.max(1, Math.trunc(evalNode(d, frame))))
          const build = (level) => {
            if (level === dims.length - 1) return Array.from({length: dims[level]}, () => 0)
            return Array.from({length: dims[level]}, () => build(level + 1))
          }
          value = build(0)
        }
        if (pointer) {
          value = truncateForType(value, s.dataType, 1)
        } else {
          value = truncateForType(value, s.dataType, 0)
        }
        const slot=makeSlot(frame,s.name,value,{pointer,reference:s.reference,type:s.dataType})
        if(structDef && !pointer && !s.dimensions.length){
          const ctorArgs=s.initializer?.type==='constructorInit' ? s.initializer.args : []
          runConstructor(s.dataType,value,0,ctorArgs,frame)
          snapshot(s.line,`construct ${s.dataType} ${s.name}`)
        }
        if(s.reference && s.initializer){ const lv=lvalue(s.initializer,frame); slot.reference=lv.address; slot.value=lv.get() }
        snapshot(s.line,`declare ${s.name} = ${valueToString(value)}`);return
      }
      case 'input': { for(const target of s.targets){ const lv=lvalue(target,frame); const raw=inputQueue[inputPos++] ?? ''; const current=lv.get(); let v=raw; if(typeof current==='number')v=Number(raw); else if(typeof current==='string')v=String(raw); lv.set(v) } snapshot(s.line,'read input'); return }
      case 'print': {
        if(s.kind==='cout') { for(const p of s.parts){ if(p.type==='endl') stdout+='\n'; else stdout+=valueToString(evalNode(p.expr,frame)) } }
        else { const vals=s.args.map(a=>evalNode(a,frame)); stdout+=vals.map(valueToString).join('')+(s.kind==='WriteLine'?'\n':'') }
        snapshot(s.line,'print output'); return
      }
      case 'throw': { const value=evalNode(s.expr,frame); snapshot(s.line,`throw ${valueToString(value)}`); throw {__cppThrow:true,value,line:s.line} }
      case 'try': {
        try { return execStmt(s.body,frame) }
        catch(err) {
          if(!err?.__cppThrow) throw err
          for(const c of s.catches){
            frame.scopes.push(new Map())
            try { if(c.name) makeSlot(frame,c.name,clone(err.value),{type:c.type||'auto'}); snapshot(c.line,`catch ${c.name||'...'}`); return execStmt(c.body,frame) } finally { frame.scopes.pop() }
          }
          throw err
        }
      }
      case 'delete': { const addr=evalNode(s.target,frame); const b=findBlock(addr); if(b?.value?.__struct){ const dtor=findMethod(b.value.type,`~${b.value.type}`); if(dtor) invokeMethod(dtor.method,b.value,addr,[],frame,`${b.value.type}::~${b.value.type}()`)} if(b){if(b.freed)throw new InterpError(`double delete of ${fmtAddr(addr)}`,s.line);b.freed=true} snapshot(s.line,`${s.array?'delete[]':'delete'} → ${fmtAddr(addr)}`); return }
      case 'expr': {const v=evalNode(s.expr,frame); const c=s.expr.type==='call'&&s.expr.callee?.name; snapshot(s.line,c?`call ${c}()`:v===undefined?'expression':`expression → ${valueToString(v)}`);return}
      case 'if': {const ok=!!evalNode(s.cond,frame);snapshot(s.line,`if (${renderExpr(s.cond)}) → ${ok?'true':'false'}`);if(ok)return execStmt(s.then,frame);if(s.else)return execStmt(s.else,frame);return}
      case 'rangeFor': {
        const iterable=evalNode(s.iterable,frame);
        if(!Array.isArray(iterable)) throw new InterpError(`range-for requires an iterable container`,s.line);
        frame.scopes.push(new Map());
        try {
          for(let i=0;i<iterable.length;i++){
            if(i>=MAX_LOOP_ITERATIONS) throw new InterpError('loop iteration limit exceeded',s.line);
            let existing=null
            try { existing=resolveVar(s.name,frame)?.slot } catch {}
            if(existing) existing.value=clone(iterable[i]); else makeSlot(frame,s.name,clone(iterable[i]),{type:s.dataType});
            snapshot(s.line,`range-for ${s.name} = ${valueToString(iterable[i])}`);
            const sig=execStmt(s.body,frame);
            if(sig==='return') return sig;
            if(sig==='break') break;
          }
        } finally { frame.scopes.pop() }
        snapshot(s.line,'range-for exit'); return
      }
      case 'for': {
        if(s.init){ if(s.init.type==='decl'||s.init.type==='multiDecl')execStmt(s.init,frame); else if(s.init.expr)evalNode(s.init.expr,frame)}
        let i=0;
        while(!!evalNode(s.cond,frame)){
          if(i++>=MAX_LOOP_ITERATIONS)throw new InterpError('loop iteration limit exceeded',s.line);
          snapshot(s.line,`for condition → true`);
          const sig=execStmt(s.body,frame);
          if(sig==='return')return sig;
          if(sig==='break')break;
          if(s.update)evalNode(s.update,frame)
        }
        snapshot(s.line,'for loop exit');return
      }
      case 'while': {let i=0;while(!!evalNode(s.cond,frame)){if(i++>=MAX_LOOP_ITERATIONS)throw new InterpError('loop iteration limit exceeded',s.line);snapshot(s.line,'while condition → true');const sig=execStmt(s.body,frame);if(sig==='return')return sig;if(sig==='break')break}snapshot(s.line,'while loop exit');return}
      case 'do': {let i=0;do{if(i++>=MAX_LOOP_ITERATIONS)throw new InterpError('loop iteration limit exceeded',s.line);const sig=execStmt(s.body,frame);if(sig==='return')return sig;if(sig==='break')break}while(!!evalNode(s.cond,frame));snapshot(s.line,'do/while exit');return}
      case 'switch': {const value=evalNode(s.expr,frame);let active=false;for(const c of s.cases){if(c.value===null||(!active&&evalNode(c.value,frame)===value))active=true;if(active){const sig=execList(c.body,frame);if(sig==='return')return sig;if(sig==='break')break}}snapshot(s.line,`switch (${valueToString(value)})`);return}
      case 'break':return 'break'
      case 'continue':return 'continue'
      case 'return': {const value=s.expr?evalNode(s.expr,frame):0;frame.__return=value; if(frame===callFrames[0])returned=true; snapshot(s.line,`return ${valueToString(value)}`);return 'return'}
      default: {const e=new InterpError(`unsupported statement '${s.type}'`,s.line);e.mockUnsupported=true;throw e}
    }
  }

  function renderExpr(n){if(!n)return '';if(n.type==='var')return n.name;if(n.type==='literal')return JSON.stringify(n.value);if(n.type==='binary')return `${renderExpr(n.left)} ${n.op} ${renderExpr(n.right)}`;return n.type}

  // [PATCH 1] Initialise globals before main().
  if (functions.__globals) {
    for (const g of functions.__globals) {
      let value = 0
      try {
        if (g.initializer) {
          const fakeFrame = { line: g.line, scopes: [new Map()], values: new Map() }
          value = evalNode(g.initializer, fakeFrame)
        }
      } catch {}
      value = truncateForType(value, g.dataType, g.pointerDepth)
      makeGlobalSlot(g.name, value, { pointer: g.pointerDepth > 0, reference: g.reference, type: g.dataType })
    }
  }

  const main=functions.main
  const mainFrame={name:'main()',values:new Map(),scopes:[new Map()],line:main.line}
  callFrames.push(mainFrame); snapshot(main.line,'start of main()'); execList(main.body,mainFrame); if(!returned)snapshot(main.line,'end of main()'); callFrames.pop()
  return {steps,stdout}
}