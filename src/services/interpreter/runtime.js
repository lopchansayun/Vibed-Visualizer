import {
  InterpError,
  fmtAddr,
  TYPES,
  stripCommentsAndPreprocessor,
  collectFunctions,
  valueToString,
  Parser,
  lex,
} from "./cppParser.js";
import {
  normalizeAdvancedCpp,
  normalizeFunctionPointerDeclarations,
} from "./advancedFeatures.js";

const MAX_STEPS = 2500;
const MAX_LOOP_ITERATIONS = 5000;
const MAX_CALL_DEPTH = 100;
const STACK_BASE = 0x7ffe6a3b2c80;
const STACK_STRIDE = 0x8;
const HEAP_BASE = 0x55b8c3a01000;
const HEAP_STRIDE = 0x20;

export { InterpError };

const INTEGER_TYPES =
  /^(?:const\s+|static\s+|volatile\s+|unsigned\s+|signed\s+|short\s+|long\s+)*(?:bool|_Bool|char|short|int|long|size_t|std::size_t|ptrdiff_t|wchar_t|int8_t|uint8_t|int16_t|uint16_t|int32_t|uint32_t|int64_t|uint64_t|intptr_t|uintptr_t|unsigned|signed)(?:\s+int|\s+long)?$/;

function isIntegerType(type) {
  const t = String(type || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return false;
  if (/float|double/.test(t)) return false;
  if (/string|vector|array|deque|list|set|map|pair|stack|queue/.test(t))
    return false;
  return (
    INTEGER_TYPES.test(t) || /^(?:bool|char|short|int|long|size_t)$/.test(t)
  );
}

function truncateForType(value, type, pointerDepth = 0) {
  if (pointerDepth > 0) return value;
  if (!isIntegerType(type)) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const t = String(type || "");
  if (/\b(?:bool|_Bool)\b/.test(t)) return value ? 1 : 0;
  const n = Math.trunc(value);
  if (/\b(?:uint8_t)\b/.test(t)) return n & 0xff;
  if (/\b(?:int8_t)\b/.test(t)) {
    const x = n & 0xff;
    return x & 0x80 ? x - 0x100 : x;
  }
  if (/\b(?:uint16_t)\b/.test(t)) return n & 0xffff;
  if (/\b(?:int16_t)\b/.test(t)) {
    const x = n & 0xffff;
    return x & 0x8000 ? x - 0x10000 : x;
  }
  if (/\b(?:uint32_t|uintptr_t)\b/.test(t)) return n >>> 0;
  if (/\b(?:int32_t|intptr_t)\b/.test(t)) return n | 0;
  if (/\bchar\b/.test(t)) return n & 0xff;
  if (/\bunsigned\b|\buint64_t\b/.test(t)) return n >>> 0;
  if (/\blong\b|\bsize_t\b|\bptrdiff_t\b/.test(t)) return n;
  return n;
}

// [PATCH 5] Element-size lookup for pointer arithmetic.
function pointerStride(slot) {
  if (!slot || !slot.isPointer) return 1;
  const t = String(slot.type || "");
  if (/char|bool/.test(t)) return 1;
  if (/double|long/.test(t)) return 8;
  if (/short/.test(t)) return 2;
  return 4;
}

function resolveTypedef(type, typedefs = {}) {
  let t = String(type || "")
    .trim()
    .replace(/\s+/g, " ");
  let guard = 0;
  while (typedefs[t] && guard++ < 20)
    t = String(typedefs[t]).trim().replace(/\s+/g, " ");
  t = t.replace(/^(?:struct|union|enum)\s+/, "");
  return t;
}

function formatPrintf(fmt, args) {
  let out = "";
  let argIndex = 0;
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== "%") {
      out += fmt[i];
      continue;
    }
    if (fmt[i + 1] === "%") {
      out += "%";
      i++;
      continue;
    }

    const start = i;
    i++;
    while (i < fmt.length && "-+ 0#'".includes(fmt[i])) i++;
    while (i < fmt.length && /\d/.test(fmt[i])) i++;
    if (fmt[i] === ".") {
      i++;
      while (i < fmt.length && /\d/.test(fmt[i])) i++;
    }
    if (fmt[i] === "*") i++;
    if (
      fmt[i] === "h" ||
      fmt[i] === "l" ||
      fmt[i] === "L" ||
      fmt[i] === "j" ||
      fmt[i] === "z" ||
      fmt[i] === "t"
    ) {
      const length = fmt[i];
      i++;
      if (
        (length === "h" && fmt[i] === "h") ||
        (length === "l" && fmt[i] === "l")
      )
        i++;
    }

    const spec = fmt[i];
    if (!spec) {
      out += fmt.slice(start);
      break;
    }
    const value = args[argIndex++];
    const n = Number(value ?? 0);
    switch (spec) {
      case "d":
      case "i":
        out += String(Math.trunc(Number.isFinite(n) ? n : 0));
        break;
      case "u":
        out += String(Math.trunc(Number.isFinite(n) ? n : 0) >>> 0);
        break;
      case "x":
        out += Math.trunc(Number.isFinite(n) ? n : 0).toString(16);
        break;
      case "X":
        out += Math.trunc(Number.isFinite(n) ? n : 0)
          .toString(16)
          .toUpperCase();
        break;
      case "o":
        out += Math.trunc(Number.isFinite(n) ? n : 0).toString(8);
        break;
      case "f":
      case "F": {
        const m = fmt.slice(start, i).match(/\.(\d+)/);
        const precision = m ? Number(m[1]) : 6;
        out += Number.isFinite(n) ? n.toFixed(precision) : "nan";
        break;
      }
      case "e":
      case "E": {
        const m = fmt.slice(start, i).match(/\.(\d+)/);
        const precision = m ? Number(m[1]) : 6;
        let text = Number.isFinite(n) ? n.toExponential(precision) : "nan";
        if (spec === "E") text = text.toUpperCase();
        out += text;
        break;
      }
      case "g":
      case "G": {
        const m = fmt.slice(start, i).match(/\.(\d+)/);
        const precision = m ? Number(m[1]) : 6;
        let text = Number.isFinite(n)
          ? Number(n)
              .toPrecision(precision)
              .replace(/(?:\.0+|(?<=\d)0+)(?=e|$)/i, "")
          : "nan";
        if (spec === "G") text = text.toUpperCase();
        out += text;
        break;
      }
      case "c":
        out +=
          typeof value === "string"
            ? value.charAt(0)
            : String.fromCharCode(Math.trunc(n) || 0);
        break;
      case "s": {
        if (
          Array.isArray(value) &&
          value.every(
            (v) =>
              typeof v === "number" || (typeof v === "string" && v.length <= 1),
          )
        ) {
          const end = value.indexOf(0);
          out += value
            .slice(0, end >= 0 ? end : value.length)
            .map((v) =>
              typeof v === "string"
                ? v
                : String.fromCharCode(Math.trunc(v) & 0xff),
            )
            .join("");
        } else out += valueToString(value);
        break;
      }
      case "p":
        out += fmtAddr(value);
        break;
      default:
        // Preserve unknown conversion text instead of silently dropping it.
        out += fmt.slice(start, i + 1);
        argIndex--;
        break;
    }
  }
  return out;
}

function readScanfToken(source, state) {
  while (state.pos < source.length && /\s/.test(source[state.pos])) state.pos++;
  const start = state.pos;
  while (state.pos < source.length && !/\s/.test(source[state.pos]))
    state.pos++;
  return source.slice(start, state.pos);
}

export function runInterpreter(code, language = "cpp", stdin = "") {
  if (language !== "c") {
    const error = new InterpError(
      `Native interpreter is only available for C; use Judge0 for ${language}.`,
    );
    error.mockUnsupported = true;
    throw error;
  }
  const normalized =
    language === "cpp"
      ? normalizeAdvancedCpp(code)
      : language === "c"
        ? normalizeFunctionPointerDeclarations(code)
        : code;
  const clean = stripCommentsAndPreprocessor(normalized);
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
  const inputSource = String(stdin || "");
  const inputQueue = inputSource.trim().split(/\s+/).filter(Boolean);
  let inputPos = 0;
  let inputCharPos = 0;
  let stackAddressCount = 0;
  const callFrames = [];
  const ctx = { heap, heapByAddress, functions, __rand: 1 };

  function allocateHeap(size, value = 0, kind = "malloc", meta = {}) {
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
      ...meta,
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

  const globals = new Map();
  function makeGlobalSlot(
    name,
    value,
    { pointer = false, reference = null, type = "auto", address = null } = {},
  ) {
    if (!address) {
      address = STACK_BASE - stackAddressCount * STACK_STRIDE;
      stackAddressCount++;
    }
    const slot = {
      name,
      value,
      address,
      isPointer: pointer,
      reference,
      type,
      global: true,
    };
    globals.set(name, slot);
    return slot;
  }

  function resolveVar(name, frame) {
    for (let i = callFrames.length - 1; i >= 0; i--) {
      const f = callFrames[i];
      for (let j = f.scopes.length - 1; j >= 0; j--) {
        if (f.scopes[j].has(name))
          return { frame: f, slot: f.scopes[j].get(name) };
      }
    }
    if (globals.has(name)) return { frame: null, slot: globals.get(name) };
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
    const slot =
      callFrames
        .flatMap((f) => Array.from(f.values.values()))
        .find((s) => s.address === addr) ||
      Array.from(globals.values()).find((s) => s.address === addr);
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
    const slot =
      callFrames
        .flatMap((f) => Array.from(f.values.values()))
        .find((s) => s.address === addr) ||
      Array.from(globals.values()).find((s) => s.address === addr);
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

  // [PATCH 5] Resolve a raw address to either a heap block or a stack array element.
  function resolveAddress(addr) {
    if (typeof addr !== "number") return null;
    const block = findBlock(addr);
    if (block) return { kind: "heap", block, index: 0, address: addr };
    const allSlots = [
      ...callFrames.flatMap((f) => Array.from(f.values.values())),
      ...Array.from(globals.values()),
    ];
    for (const slot of allSlots) {
      if (!Array.isArray(slot.value)) continue;
      const idx = addr - slot.address;
      if (idx >= 0 && idx < slot.value.length) {
        return { kind: "stack", slot, index: idx, address: addr };
      }
    }
    return null;
  }

  function pointerTarget(node, frame) {
    if (node?.type === "binary" && (node.op === "+" || node.op === "-")) {
      const base = evalNode(node.left, frame);
      const offset =
        Math.trunc(evalNode(node.right, frame)) * (node.op === "-" ? -1 : 1);
      const b = findBlock(base);
      if (b) {
        // [PATCH 5] Use element size of the pointer's target, not HEAP_STRIDE.
        const elemSize = b.elementSize || 4;
        return { block: b, index: offset, address: base + offset * elemSize };
      }
      const resolved = resolveAddress(base);
      if (resolved && resolved.kind === "stack") {
        const slot = resolved.slot;
        const targetIndex = resolved.index + offset;
        return {
          stackSlot: slot,
          index: targetIndex,
          address: slot.address + targetIndex,
        };
      }
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
          r.slot.value = clone(
            truncateForType(v, r.slot.type, r.slot.isPointer ? 1 : 0),
          );
        },
        address: r.slot.address,
        slot: r.slot,
      };
    }
    if (node.type === "unary" && node.op === "*") {
      const pt = pointerTarget(node.expr, frame);
      if (pt) {
        if (pt.stackSlot) {
          const arr = pt.stackSlot.value;
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
            slot: pt.stackSlot,
          };
        }
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
      if (typeof base === "string") {
        if (idx < 0 || idx >= base.length)
          throw new InterpError(
            `string index ${idx} out of bounds (size ${base.length})`,
            node.line,
          );
        return {
          get: () => base[idx],
          set: (v) => {
            throw new InterpError("cannot assign to string element", node.line);
          },
        };
      }
      throw new InterpError("invalid array access", node.line);
    }
    if (node.type === "member" || node.type === "memberPtr") {
      let obj = evalNode(node.target, frame);
      if (node.type === "memberPtr" && typeof obj === "number")
        obj = deref(obj, node.line);
      if (!obj || !obj.__struct)
        throw new InterpError(
          `member '${node.prop}' accessed on non-object`,
          node.line,
        );
      if (obj.__union) {
        return {
          get: () => obj.unionValues?.[node.prop] ?? obj.fields[node.prop] ?? 0,
          set: (v) => {
            obj.__activeField = node.prop;
            obj.unionValues = obj.unionValues || {};
            obj.unionValues[node.prop] = clone(v);
            obj.fields[node.prop] = clone(v);
          },
        };
      }
      const meta = functions.__structDefs?.[obj.type]?.fields?.[node.prop];
      const mask =
        meta?.bitWidth > 0 && meta.bitWidth < 32
          ? 2 ** meta.bitWidth - 1
          : null;
      return {
        get: () => obj.fields[node.prop],
        set: (v) => {
          obj.fields[node.prop] =
            mask == null ? clone(v) : Math.trunc(Number(v)) & mask;
        },
      };
    }
    throw new InterpError("expression is not assignable", node.line);
  }

  function sizeofType(type) {
    const t = resolveTypedef(type, functions.__typedefs)
      .replace(/\s+/g, " ")
      .trim();
    if (/\*/.test(t)) return 8;
    if (/char|bool|_Bool|int8_t|uint8_t/.test(t)) return 1;
    if (/int16_t|uint16_t/.test(t)) return 2;
    if (/int32_t|uint32_t/.test(t)) return 4;
    if (/int64_t|uint64_t|intptr_t|uintptr_t|ptrdiff_t/.test(t)) return 8;
    if (/double/.test(t)) return 8;
    if (/long/.test(t)) return 8;
    const def = functions.__structDefs?.[t];
    if (def) {
      const fields = collectClassFields(def, functions.__structDefs);
      return Math.max(
        1,
        Object.keys(fields).reduce(
          (n, k) =>
            n +
            (fields[k]?.pointerDepth > 0
              ? 8
              : sizeofType(fields[k]?.type || "int")),
          0,
        ),
      );
    }
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

  function runConstructor(
    typeName,
    obj,
    addr,
    argsNodes,
    caller,
    state = null,
  ) {
    if (!obj?.__struct) return;
    const construction = state || { virtualConstructed: new Set() };
    const def = functions.__structDefs?.[typeName];
    for (const base of def?.bases || []) {
      const isVirtual = (def?.virtualBases || []).includes(base);
      if (isVirtual && construction.virtualConstructed.has(base)) continue;
      if (isVirtual) construction.virtualConstructed.add(base);
      runConstructor(base, obj, addr, [], caller, construction);
    }
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
    method.params.forEach((p, i) => {
      let v = values[i] ?? 0;
      if (!p.pointerDepth && !p.reference && p.type)
        v = truncateForType(v, p.type, 0);
      makeSlot(frame, p.name, v, {
        pointer: p.pointerDepth > 0,
        reference: p.reference,
        type: "parameter",
      });
    });
    // [PATCH 7] Apply constructor initializer list to the object's fields.
    if (method.initList?.length && obj?.__struct) {
      for (const init of method.initList) {
        try {
          const ep = new Parser(init.argTokens, "", new Set());
          const v = evalNode(ep.parseExpression(), frame);
          obj.fields[init.member] = v;
        } catch {}
      }
    }
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

  function applyInitializer(target, init, frame) {
    if (!init?.values) return;
    if (target?.__struct) {
      let positional = 0;
      for (const item of init.values) {
        if (item?.type === "designatedField") {
          target.fields[item.name] = clone(evalNode(item.value, frame));
          if (target.__union) {
            target.__activeField = item.name;
            target.unionValues = target.unionValues || {};
            target.unionValues[item.name] = clone(target.fields[item.name]);
          }
        } else if (item?.type === "array") {
          const keys = Object.keys(target.fields);
          if (keys[positional])
            target.fields[keys[positional++]] = clone(
              buildInitializerValue(item, frame),
            );
        } else {
          const keys = Object.keys(target.fields);
          if (keys[positional])
            target.fields[keys[positional++]] = clone(evalNode(item, frame));
        }
      }
      return;
    }
  }
  function buildInitializerValue(node, frame) {
    return node?.type === "array"
      ? node.values.map((x) => buildInitializerValue(x, frame))
      : evalNode(node, frame);
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
          if (functions[node.name])
            return { __functionRef: true, name: node.name };
          throw new InterpError(`'${node.name}' is not defined`, frame?.line);
        }
      }
      case "cast": {
        const v = evalNode(node.expr, frame);
        return truncateForType(v, node.dataType, node.pointerDepth || 0);
      }
      case "compoundLiteral": {
        const type = resolveTypedef(node.dataType, functions.__typedefs);
        const def = functions.__structDefs?.[type];
        if (!def) {
          const build = (n) =>
            n?.type === "array" ? n.values.map(build) : evalNode(n, frame);
          return build(node.initializer);
        }
        const obj = { __struct: true, type, fields: {} };
        if (def.union) obj.__union = true;
        const allFields = collectClassFields(def, functions.__structDefs);
        for (const [k, meta] of Object.entries(allFields))
          obj.fields[k] = meta.initializer
            ? evalNode(meta.initializer, frame)
            : 0;
        applyInitializer(obj, node.initializer, frame);
        return obj;
      }
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
              : meta.pointerDepth > 0
                ? 0
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
        return allocateHeap(count, init, "new", {
          elementSize: sizeofType(node.dataType),
        });
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
        if (node.op === "&") {
          if (node.expr?.type === "var" && functions[node.expr.name])
            return { __functionRef: true, name: node.expr.name };
          return lvalue(node.expr, frame).address;
        }
        if (node.op === "*") {
          const pt = pointerTarget(node.expr, frame);
          if (pt) {
            if (pt.stackSlot) {
              const arr = pt.stackSlot.value;
              if (pt.index < 0 || pt.index >= arr.length)
                throw new InterpError(
                  `pointer arithmetic out of bounds (index ${pt.index})`,
                  node.line,
                );
              return arr[pt.index];
            }
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
          // [PATCH 5] Advance by element size for typed pointers.
          const stride = lv.slot?.isPointer ? pointerStride(lv.slot) : 1;
          const n = old + (node.op === "++" ? stride : -stride);
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
        const stride = lv.slot?.isPointer ? pointerStride(lv.slot) : 1;
        lv.set(Number(old || 0) + (node.op === "++" ? stride : -stride));
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
        // [PATCH 8] Operator overloading for structs.
        if (
          typeof l === "object" &&
          l?.__struct &&
          ["+", "-", "==", "!=", "<", ">"].includes(node.op)
        ) {
          const found = findMethod(l.type, `operator${node.op}`, new Set(), [
            node.right,
          ]);
          if (found) {
            const addr = findObjectAddress(l);
            return invokeMethod(
              found.method,
              l,
              addr,
              [node.right],
              frame,
              `${l.type}::operator${node.op}()`,
            );
          }
        }
        if (
          (node.op === "+" || node.op === "-") &&
          typeof l === "number" &&
          (findBlock(l) || resolveAddress(l))
        ) {
          // [PATCH 5] Pointer arithmetic scales by element size.
          const b = findBlock(l);
          const elemSize = b?.elementSize || 1;
          return l + (node.op === "+" ? r : -r) * elemSize;
        }
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
            return r === 0
              ? 0
              : Number.isInteger(l) && Number.isInteger(r)
                ? Math.trunc(l / r)
                : l / r;
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
            "/=": (a, b) =>
              b === 0
                ? a
                : Number.isInteger(a) && Number.isInteger(b)
                  ? Math.trunc(a / b)
                  : a / b,
            "%=": (a, b) => (b === 0 ? a : a % b),
            "&=": (a, b) => (a | 0) & (b | 0),
            "|=": (a, b) => a | 0 | (b | 0),
            "^=": (a, b) => (a | 0) ^ (b | 0),
            "<<=": (a, b) => (a | 0) << (b | 0),
            ">>=": (a, b) => (a | 0) >> (b | 0),
          };
          v = map[node.op]?.(l, r) ?? r;
        }
        const slot = lv.slot;
        if (slot && !slot.reference && !slot.field && slot.type) {
          v = truncateForType(v, slot.type, slot.isPointer ? 1 : 0);
        }
        lv.set(v);
        return v;
      }
      case "commaExpr": {
        let last = 0;
        for (const e of node.exprs) last = evalNode(e, frame);
        return last;
      }
      case "call":
        return callFunction(node, frame);
      default:
        return 0;
    }
  }

  function evalPrintCall(node, frame) {
    const name = node.callee?.name || node.callee?.prop;
    if (!name || !["printf", "puts", "putchar", "fputs"].includes(name))
      return null;
    const args = node.args.map((a) => evalNode(a, frame));
    if (name === "printf")
      return formatPrintf(String(args.shift() ?? ""), args);
    if (name === "puts") return `${valueToString(args[0] ?? "")}\n`;
    if (name === "putchar") {
      const v = args[0] ?? 0;
      return typeof v === "string"
        ? v.charAt(0)
        : String.fromCharCode(Math.trunc(Number(v)) || 0);
    }
    if (name === "fputs") return valueToString(args[0] ?? "");
    return null;
  }

  function findObjectAddress(obj) {
    const block = heap.find((b) => !b.freed && b.value === obj);
    return block?.address || 0;
  }

  function callFunction(node, caller) {
    let name = node.callee?.name;
    if (
      node.callee?.type === "var" &&
      !functions[node.callee.name] &&
      node.callee.name !== "lambda_create"
    ) {
      try {
        const ref = evalNode(node.callee, caller);
        if (ref?.__functionRef) name = ref.name;
      } catch {}
    }
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

      // [PATCH 4] map/set/stack/queue containers.
      if (obj && typeof obj === "object" && obj.__containerType) {
        const ct = obj.__containerType;
        const vals = node.args.map((a) => evalNode(a, caller));
        const prop = node.callee.prop;
        if (/map|unordered_map/.test(ct)) {
          if (!obj.__data) obj.__data = new Map();
          if (prop === "at") {
            return obj.__data.get(vals[0]) ?? 0;
          }
          if (prop === "insert") {
            obj.__data.set(vals[0], vals[1] ?? 0);
            snapshot(node.line, `map.insert(${valueToString(vals[0])})`);
            return 0;
          }
          if (prop === "size") return obj.__data.size;
          if (prop === "count") return obj.__data.has(vals[0]) ? 1 : 0;
          if (prop === "erase") {
            obj.__data.delete(vals[0]);
            return 0;
          }
          if (prop === "clear") {
            obj.__data.clear();
            return 0;
          }
          if (prop === "empty") return obj.__data.size === 0 ? 1 : 0;
        }
        if (/set|unordered_set/.test(ct)) {
          if (!obj.__data) obj.__data = new Set();
          if (prop === "insert") {
            obj.__data.add(vals[0]);
            snapshot(node.line, `set.insert(${valueToString(vals[0])})`);
            return 0;
          }
          if (prop === "size") return obj.__data.size;
          if (prop === "count") return obj.__data.has(vals[0]) ? 1 : 0;
          if (prop === "erase") {
            obj.__data.delete(vals[0]);
            return 0;
          }
          if (prop === "clear") {
            obj.__data.clear();
            return 0;
          }
          if (prop === "empty") return obj.__data.size === 0 ? 1 : 0;
        }
        if (/stack/.test(ct)) {
          if (!obj.__data) obj.__data = [];
          if (prop === "push") {
            obj.__data.push(vals[0]);
            snapshot(node.line, `stack.push(${valueToString(vals[0])})`);
            return 0;
          }
          if (prop === "pop") {
            obj.__data.pop();
            return 0;
          }
          if (prop === "top") return obj.__data[obj.__data.length - 1] ?? 0;
          if (prop === "size") return obj.__data.length;
          if (prop === "empty") return obj.__data.length === 0 ? 1 : 0;
        }
        if (/queue/.test(ct)) {
          if (!obj.__data) obj.__data = [];
          if (prop === "push") {
            obj.__data.push(vals[0]);
            snapshot(node.line, `queue.push(${valueToString(vals[0])})`);
            return 0;
          }
          if (prop === "pop") {
            obj.__data.shift();
            return 0;
          }
          if (prop === "front") return obj.__data[0] ?? 0;
          if (prop === "back") return obj.__data[obj.__data.length - 1] ?? 0;
          if (prop === "size") return obj.__data.length;
          if (prop === "empty") return obj.__data.length === 0 ? 1 : 0;
        }
      }

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
    if (name === "lambda_create") {
      const ref = evalNode(node.args[0], caller);
      if (!ref?.__functionRef)
        throw new InterpError(
          "lambda_create requires a function reference",
          node.line,
        );
      // [PATCH 10] Support captured-by-reference markers: {__refName, addr}
      const bound = node.args.slice(1).map((a) => {
        const v = evalNode(a, caller);
        if (v && typeof v === "object" && v.__refAddress !== undefined) {
          return { __refAddress: v.__refAddress, __refName: v.__refName };
        }
        return clone(v);
      });
      return { __functionRef: true, name: ref.name, bound };
    }
    // [PATCH 10] Reference capture helper used by advancedFeatures.js.
    if (name === "__make_ref") {
      const lv = lvalue(node.args[0], caller);
      return {
        __refAddress: lv.address,
        __refName: node.args[0]?.name || "ref",
      };
    }
    // [PATCH 10] Reference load/store inside lambda body.
    if (name === "__ref_load") {
      const r = evalNode(node.args[0], caller);
      if (r?.__refAddress !== undefined)
        return deref(r.__refAddress, node.line);
      return r;
    }
    if (name === "__ref_store") {
      const r = evalNode(node.args[0], caller);
      const v = evalNode(node.args[1], caller);
      if (r?.__refAddress !== undefined) {
        writeAddr(r.__refAddress, v, node.line);
        return v;
      }
      return v;
    }
    if (name === "sizeof") {
      const a = node.args?.[0];
      if (a?.type === "var") {
        try {
          const v = resolveVar(a.name, caller).slot;
          if (v.isPointer) return 8;
          if (Array.isArray(v.value)) return v.value.length * 4;
          return sizeofType(v.type);
        } catch {
          return sizeofType(a.name);
        }
      }
      if (a?.type === "cast" || a?.type === "new")
        return sizeofType(a.dataType || a.type);
      return 4;
    }
    if (name === "scanf") {
      const fmt = String(evalNode(node.args[0], caller) ?? "");
      let ai = 1;
      let assigned = 0;
      for (let fi = 0; fi < fmt.length; fi++) {
        if (/\s/.test(fmt[fi])) {
          while (fi + 1 < fmt.length && /\s/.test(fmt[fi + 1])) fi++;
          while (
            inputCharPos < inputSource.length &&
            /\s/.test(inputSource[inputCharPos])
          )
            inputCharPos++;
          continue;
        }
        if (fmt[fi] !== "%") {
          if (inputSource[inputCharPos] === fmt[fi]) inputCharPos++;
          continue;
        }
        if (fmt[fi + 1] === "%") {
          if (inputSource[inputCharPos] === "%") inputCharPos++;
          fi++;
          continue;
        }
        fi++;
        while (fi < fmt.length && "*+-#0'".includes(fmt[fi])) fi++;
        while (fi < fmt.length && /\d/.test(fmt[fi])) fi++;
        if (fmt[fi] === ".") {
          fi++;
          while (fi < fmt.length && /\d/.test(fmt[fi])) fi++;
        }
        if (
          fmt[fi] === "h" ||
          fmt[fi] === "l" ||
          fmt[fi] === "L" ||
          fmt[fi] === "j" ||
          fmt[fi] === "z" ||
          fmt[fi] === "t"
        ) {
          const l = fmt[fi];
          fi++;
          if ((l === "h" && fmt[fi] === "h") || (l === "l" && fmt[fi] === "l"))
            fi++;
        }
        const spec = fmt[fi];
        const argNode = node.args[ai++];
        const target =
          argNode?.type === "unary" && argNode.op === "&"
            ? argNode.expr
            : argNode;
        const lv = lvalue(target, caller);
        let raw;
        if (spec === "c") {
          raw = inputSource[inputCharPos++] ?? "";
        } else
          raw = readScanfToken(inputSource, {
            get pos() {
              return inputCharPos;
            },
            set pos(v) {
              inputCharPos = v;
            },
          });
        if (spec === "s" && Array.isArray(lv.get())) {
          const arr = lv.get();
          const chars = [...String(raw)];
          for (let i = 0; i < arr.length; i++)
            arr[i] = i < chars.length ? chars[i].charCodeAt(0) : 0;
          arr.__cString = true;
        } else if (spec === "c") lv.set(String(raw).charAt(0));
        else if (spec === "s") lv.set(String(raw));
        else if (spec === "f" || spec === "e" || spec === "g")
          lv.set(Number.parseFloat(raw) || 0);
        else lv.set(Number.parseInt(raw, spec === "i" ? 0 : 10) || 0);
        assigned++;
      }
      return assigned;
    }
    if (
      name === "printf" ||
      name === "puts" ||
      name === "putchar" ||
      name === "fputs"
    ) {
      const args = node.args.map((a) => evalNode(a, caller));
      if (name === "puts") {
        stdout += String(args[0] ?? "") + "\n";
        return args[0]?.length ?? 0;
      }
      if (name === "putchar") {
        stdout += String(args[0] ?? "").charAt(0);
        return Number(args[0] ?? 0);
      }
      if (name === "fputs") {
        stdout += String(args[0] ?? "");
        return 0;
      }
      const fmt = String(args[0] ?? "");
      const rendered = formatPrintf(fmt, args.slice(1));
      stdout += rendered;
      return rendered.length;
    }
    if (
      [
        "strlen",
        "strnlen",
        "strcpy",
        "strncpy",
        "strcat",
        "strncat",
        "strcmp",
        "strncmp",
        "strchr",
        "strrchr",
        "strstr",
        "memchr",
        "memcpy",
        "memmove",
        "memset",
      ].includes(name)
    ) {
      const a = node.args.map((x) => evalNode(x, caller));
      if (name === "strnlen")
        return Math.min(
          Array.isArray(a[0])
            ? a[0].indexOf(0) >= 0
              ? a[0].indexOf(0)
              : a[0].length
            : String(a[0] ?? "").length,
          Math.trunc(a[1] ?? 0),
        );
      if (name === "strlen")
        return Array.isArray(a[0])
          ? a[0].indexOf(0) >= 0
            ? a[0].indexOf(0)
            : a[0].length
          : String(a[0] ?? "").length;
      if (name === "strcmp" || name === "strncmp") {
        const n = name === "strncmp" ? Math.trunc(a[2] ?? 0) : Infinity;
        const x = String(a[0] ?? "").slice(0, n),
          y = String(a[1] ?? "").slice(0, n);
        return x === y ? 0 : x < y ? -1 : 1;
      }
      if (name === "strchr" || name === "strrchr") {
        const x = String(a[0] ?? "");
        const ch = String(a[1] ?? "").charAt(0);
        const i = name === "strrchr" ? x.lastIndexOf(ch) : x.indexOf(ch);
        return i < 0 ? 0 : x.length - i;
      }
      if (name === "strstr") {
        const x = String(a[0] ?? ""),
          y = String(a[1] ?? "");
        const i = x.indexOf(y);
        return i < 0 ? 0 : x.length - i;
      }
      if (name === "memchr") {
        const src = a[0],
          target = Number(a[1] ?? 0) & 255,
          n = Math.trunc(a[2] ?? 0);
        if (Array.isArray(src)) {
          const i = src
            .slice(0, n)
            .findIndex((v) => (Number(v) & 255) === target);
          return i < 0 ? 0 : i;
        }
        return 0;
      }
      if (name === "strcpy" || name === "strncpy") {
        const dst = lvalue(node.args[0], caller);
        const src = Array.isArray(a[1])
          ? valueToString(a[1])
          : String(a[1] ?? "");
        const cur = dst.get();
        if (Array.isArray(cur)) {
          const chars = [...src];
          for (let i = 0; i < cur.length; i++)
            cur[i] = i < chars.length ? chars[i].charCodeAt(0) : 0;
          cur.__cString = true;
        } else
          dst.set(
            name === "strncpy"
              ? src.slice(0, Math.trunc(a[2] ?? src.length))
              : src,
          );
        return a[0];
      }
      if (name === "strcat" || name === "strncat") {
        const dst = lvalue(node.args[0], caller);
        const src = Array.isArray(a[1])
          ? valueToString(a[1])
          : String(a[1] ?? "");
        const cur = dst.get();
        if (Array.isArray(cur)) {
          const base = valueToString(cur);
          const out =
            base +
            (name === "strncat"
              ? src.slice(0, Math.trunc(a[2] ?? src.length))
              : src);
          const chars = [...out];
          for (let i = 0; i < cur.length; i++)
            cur[i] = i < chars.length ? chars[i].charCodeAt(0) : 0;
          cur.__cString = true;
        } else
          dst.set(
            String(dst.get() ?? "") +
              (name === "strncat"
                ? src.slice(0, Math.trunc(a[2] ?? src.length))
                : src),
          );
        return a[0];
      }
      if (name === "memset") {
        const dst = lvalue(node.args[0], caller),
          n = Math.trunc(a[2] ?? 0),
          rawC = a[1] ?? 0,
          c = typeof rawC === "string" ? rawC.charCodeAt(0) : Number(rawC) || 0;
        const cur = dst.get();
        if (Array.isArray(cur)) {
          for (let i = 0; i < Math.min(n, cur.length); i++) cur[i] = c;
        } else dst.set(c);
        return a[0];
      }
      if (name === "memcpy" || name === "memmove") {
        const dst = lvalue(node.args[0], caller),
          src = a[1],
          n = Math.trunc(a[2] ?? 0);
        if (Array.isArray(src)) {
          const copy = src.slice(0, n);
          const cur = dst.get();
          if (Array.isArray(cur)) {
            for (let i = 0; i < copy.length; i++) cur[i] = copy[i];
          } else dst.set(copy[0] ?? 0);
        } else dst.set(src);
        return a[0];
      }
    }
    if (
      [
        "sqrt",
        "cbrt",
        "pow",
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "atan2",
        "exp",
        "log",
        "log10",
        "floor",
        "ceil",
        "round",
        "trunc",
        "fabs",
        "fmod",
        "hypot",
      ].includes(name)
    ) {
      const a = node.args.map((x) => Number(evalNode(x, caller) ?? 0));
      const fn = Math[name];
      if (name === "cbrt") return Math.cbrt(a[0] ?? 0);
      if (name === "pow") return Math.pow(a[0] ?? 0, a[1] ?? 0);
      if (name === "atan2") return Math.atan2(a[0] ?? 0, a[1] ?? 0);
      if (name === "fmod") return (a[0] ?? 0) % (a[1] ?? 1);
      if (name === "hypot") return Math.hypot(...a);
      if (typeof fn === "function") return fn(a[0] ?? 0);
    }
    if (
      [
        "INT8_MAX",
        "INT16_MAX",
        "INT32_MAX",
        "INT64_MAX",
        "UINT8_MAX",
        "UINT16_MAX",
        "UINT32_MAX",
        "SIZE_MAX",
      ].includes(name)
    ) {
      return {
        INT8_MAX: 127,
        INT16_MAX: 32767,
        INT32_MAX: 2147483647,
        INT64_MAX: 9223372036854775807,
        UINT8_MAX: 255,
        UINT16_MAX: 65535,
        UINT32_MAX: 4294967295,
        SIZE_MAX: 4294967295,
      }[name];
    }
    if (name === "rand") {
      ctx.__rand = (ctx.__rand * 1664525 + 1013904223) >>> 0;
      return ctx.__rand;
    }
    if (name === "srand") {
      ctx.__rand =
        Math.trunc(Number(evalNode(node.args[0], caller) || 1)) >>> 0;
      return 0;
    }
    if (name === "time") return 0;
    if (["abs", "labs", "llabs"].includes(name))
      return Math.abs(Math.trunc(Number(evalNode(node.args[0], caller) || 0)));
    if (
      ["atoi", "atol", "atoll", "strtol", "strtoul", "strtod"].includes(name)
    ) {
      const a = node.args.map((x) => evalNode(x, caller));
      return Number.parseFloat(String(a[0] ?? "").trim()) || 0;
    }
    if (
      [
        "isalpha",
        "isdigit",
        "isalnum",
        "isspace",
        "islower",
        "isupper",
        "tolower",
        "toupper",
      ].includes(name)
    ) {
      const c = String(evalNode(node.args[0], caller) ?? "").charAt(0);
      if (name === "isalpha") return /^[A-Za-z]$/.test(c) ? 1 : 0;
      if (name === "isdigit") return /^[0-9]$/.test(c) ? 1 : 0;
      if (name === "isalnum") return /^[A-Za-z0-9]$/.test(c) ? 1 : 0;
      if (name === "isspace") return /\s/.test(c) ? 1 : 0;
      if (name === "islower") return /^[a-z]$/.test(c) ? 1 : 0;
      if (name === "isupper") return /^[A-Z]$/.test(c) ? 1 : 0;
      if (name === "tolower") return c.toLowerCase().charCodeAt(0) || 0;
      return c.toUpperCase().charCodeAt(0) || 0;
    }
    if (["malloc", "calloc", "realloc", "free"].includes(name)) {
      const args = node.args.map((a) => evalNode(a, caller));
      if (name === "malloc")
        return allocateHeap(
          Math.max(1, Math.ceil((args[0] || 4) / 4)),
          0,
          "malloc",
          { elementSize: 1 },
        );
      if (name === "calloc")
        return allocateHeap(
          Math.max(1, Math.trunc(args[0] || 1)),
          0,
          "calloc",
          { elementSize: 1 },
        );
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
        if (b) {
          if (b.freed)
            throw new InterpError(
              `double free of ${fmtAddr(args[0])}`,
              node.line,
            );
          b.freed = true;
        }
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
    let calleeRef = null;
    if (node.callee?.type === "var") {
      try {
        calleeRef = evalNode(node.callee, caller);
      } catch {
        calleeRef = null;
      }
    }
    const bound = calleeRef?.__functionRef ? calleeRef.bound || [] : [];
    const values = [...bound, ...node.args.map((a) => evalNode(a, caller))];
    fn.params.forEach((p, i) => {
      let v = values[i] ?? 0;
      // [PATCH 10] Unwrap captured references for by-ref captures.
      if (v && typeof v === "object" && v.__refAddress !== undefined) {
        v = deref(v.__refAddress, node.line);
      }
      if (!p.pointerDepth && !p.reference && p.type)
        v = truncateForType(v, p.type, 0);
      makeSlot(frame, p.name, v, {
        pointer: p.pointerDepth > 0,
        reference: p.reference,
        type: "parameter",
      });
    });
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

  function createStructValue(typeName, frame) {
    const resolved = resolveTypedef(typeName, functions.__typedefs);
    const def = functions.__structDefs?.[resolved];
    if (!def) return null;
    const obj = {
      __struct: true,
      type: resolved,
      fields: {},
      ...(def.union ? { __union: true } : {}),
    };
    const allFields = collectClassFields(def, functions.__structDefs);
    for (const [k, meta] of Object.entries(allFields)) {
      obj.fields[k] = meta.initializer ? evalNode(meta.initializer, frame) : 0;
      if (meta.bitWidth != null && meta.bitWidth > 0)
        obj.fields[k] =
          Number(obj.fields[k]) & (2 ** Math.min(meta.bitWidth, 31) - 1);
    }
    return obj;
  }

  function allocateTypedObject(typeName, frame, kind = "malloc") {
    const obj = createStructValue(typeName, frame);
    if (!obj) return null;
    const addr = allocateHeap(1, obj, kind, {
      elementSize: Math.max(1, sizeofType(typeName)),
      objectType: obj.type,
    });
    const block = findBlock(addr);
    block.value = obj;
    block.size = Math.max(1, sizeofType(typeName));
    return addr;
  }

  function execList(list, frame) {
    for (let i = 0; i < list.length; i++) {
      if (returned) break;
      const s = list[i],
        signal = execStmt(s, frame);
      if (signal === "return" || signal === "break" || signal === "continue")
        return signal;
      if (signal?.type === "goto") {
        const target = list.findIndex(
          (x) => x.type === "label" && x.label === signal.label,
        );
        if (target >= 0) {
          i = target - 1;
          continue;
        }
        return signal;
      }
    }
  }
  function execStmt(s, frame) {
    guard(s.line);
    if (stepCount > MAX_STEPS) return;
    switch (s.type) {
      case "block": {
        frame.scopes.push(new Map());
        try {
          const sig = execList(s.body, frame);
          return sig;
        } finally {
          frame.scopes.pop();
        }
      }
      case "empty":
        return;
      case "label":
        return execStmt(s.statement, frame);
      case "goto":
        return { type: "goto", label: s.label };
      // [PATCH 1] Multiple declarations sharing a type: int a=1, b=2, c;
      case "multiDecl": {
        for (const d of s.decls) execStmt({ ...d, line: s.line }, frame);
        return;
      }
      case "decl": {
        let value = 0;
        let pointer = s.pointerDepth > 0;
        const resolvedDataType = resolveTypedef(
          s.dataType,
          functions.__typedefs,
        );
        const structDef = functions.__structDefs?.[resolvedDataType];
        // [PATCH 2] Array of structs: struct Point pts[3];
        // Typed malloc/calloc: C allocates raw bytes, but the visualizer needs the
        // declared pointer type so `node->field` can resolve the object correctly.
        if (
          pointer &&
          structDef &&
          s.initializer?.type === "call" &&
          s.initializer.callee?.type === "var" &&
          ["malloc", "calloc"].includes(s.initializer.callee.name)
        ) {
          const allocKind = s.initializer.callee.name;
          if (allocKind === "calloc") {
            const count = s.initializer.args?.[0]
              ? Math.max(1, Math.trunc(evalNode(s.initializer.args[0], frame)))
              : 1;
            const addr = allocateTypedObject(
              resolvedDataType,
              frame,
              allocKind,
            );
            if (addr !== null) {
              const b = findBlock(addr);
              if (count > 1) {
                // Keep the first object as the block's primary value; array-of-struct
                // calloc is represented as a contiguous array of struct objects.
                const allFields = collectClassFields(
                  structDef,
                  functions.__structDefs,
                );
                b.value = Array.from({ length: count }, () => {
                  const o = {
                    __struct: true,
                    type: resolvedDataType,
                    fields: {},
                    ...(structDef.union ? { __union: true } : {}),
                  };
                  for (const [k, meta] of Object.entries(allFields))
                    o.fields[k] = 0;
                  return o;
                });
                b.size = count * Math.max(1, sizeofType(resolvedDataType));
              }
              value = addr;
            }
          } else {
            const addr = allocateTypedObject(
              resolvedDataType,
              frame,
              allocKind,
            );
            if (addr !== null) value = addr;
          }
        } else if (structDef && !pointer && s.dimensions.length) {
          const n = Math.max(1, Math.trunc(evalNode(s.dimensions[0], frame)));
          const allFields = collectClassFields(
            structDef,
            functions.__structDefs,
          );
          value = Array.from({ length: n }, () => {
            const obj = {
              __struct: true,
              type: resolvedDataType,
              fields: {},
              ...(structDef?.union ? { __union: true } : {}),
            };
            for (const [k, meta] of Object.entries(allFields))
              obj.fields[k] = meta.initializer
                ? evalNode(meta.initializer, frame)
                : meta.pointerDepth > 0
                  ? 0
                  : 0;
            return obj;
          });
          if (s.initializer?.type === "array") {
            s.initializer.values.forEach((row, i) => {
              if (row.type === "array" && value[i]) {
                Object.keys(allFields).forEach((k, j) => {
                  if (row.values[j])
                    value[i].fields[k] = evalNode(row.values[j], frame);
                });
              }
            });
          }
        } else if (structDef && !pointer) {
          value = {
            __struct: true,
            type: resolvedDataType,
            fields: {},
            ...(structDef?.union ? { __union: true } : {}),
          };
          const allFields = collectClassFields(
            structDef,
            functions.__structDefs,
          );
          for (const [k, meta] of Object.entries(allFields))
            value.fields[k] = meta.initializer
              ? evalNode(meta.initializer, frame)
              : meta.pointerDepth > 0
                ? 0
                : 0;
          if (s.initializer?.type === "array")
            applyInitializer(value, s.initializer, frame);
          else if (s.initializer?.type === "compoundLiteral")
            value = evalNode(s.initializer, frame);
        } else if (
          /^(?:std::)?(?:vector|array|deque|list)/.test(s.dataType) &&
          s.initializer?.type === "array"
        ) {
          value = s.initializer.values.map((x) =>
            x.type === "array"
              ? x.values.map((y) => evalNode(y, frame))
              : evalNode(x, frame),
          );
          value.__containerType = s.dataType;
        } else if (/^(?:std::)?(?:vector|array|deque|list)/.test(s.dataType)) {
          if (s.initializer?.type === "constructorInit") {
            // [PATCH 3] vector<int> v(N) → N zeros, backed by a heap block.
            const first = s.initializer.args[0]
              ? Math.max(0, Math.trunc(evalNode(s.initializer.args[0], frame)))
              : 0;
            value = Array.from({ length: first }, () => 0);
            const addr = allocateHeap(Math.max(1, first), 0, "vector", {
              elementSize: 4,
              containerType: s.dataType,
            });
            const blk = findBlock(addr);
            blk.value = value;
            value.__heapAddress = addr;
          } else {
            value =
              s.initializer?.type === "array"
                ? s.initializer.values.map((x) => evalNode(x, frame))
                : [];
            value.__containerType = s.dataType;
          }
          // [PATCH 4] map / set / stack / queue get a tagged container object.
        } else if (
          /^(?:std::)?(?:map|unordered_map|set|unordered_set|stack|queue)/.test(
            s.dataType,
          )
        ) {
          value = { __containerType: s.dataType, __data: null };
          const addr = allocateHeap(1, value, "container", {
            containerType: s.dataType,
          });
          value.__heapAddress = addr;
        } else if (
          s.dimensions.length &&
          s.initializer?.type === "literal" &&
          typeof s.initializer.value === "string" &&
          /\bchar\b/.test(s.dataType)
        ) {
          const chars = [...s.initializer.value].map((ch) => ch.charCodeAt(0));
          const n = Math.max(
            chars.length + 1,
            Math.trunc(evalNode(s.dimensions[0], frame)),
          );
          value = Array.from({ length: n }, (_, i) =>
            i < chars.length ? chars[i] : 0,
          );
          Object.defineProperty(value, "__cString", {
            value: true,
            writable: true,
            enumerable: true,
          });
        } else if (s.initializer?.type === "array") {
          // [PATCH 1] Nested initializer lists for N-D arrays.
          const buildValue = (node) =>
            node.type === "array"
              ? (() => {
                  const arr = [];
                  let pos = 0;
                  for (const item of node.values) {
                    if (item?.type === "designatedIndex") {
                      const idx = Math.trunc(evalNode(item.index, frame));
                      arr[idx] = buildValue(item.value);
                    } else if (item?.type === "designatedField") {
                      /* invalid for plain array */
                    } else arr[pos++] = buildValue(item);
                  }
                  return arr;
                })()
              : evalNode(node, frame);
          value = buildValue(s.initializer);
        } else if (s.initializer && s.initializer.type !== "constructorInit")
          value = evalNode(s.initializer, frame);
        else if (s.dimensions.length && !s.initializer) {
          // [PATCH 1] N-D row-major allocation.
          const dims = s.dimensions.map((d) =>
            Math.max(1, Math.trunc(evalNode(d, frame))),
          );
          const build = (level) => {
            if (level === dims.length - 1)
              return Array.from({ length: dims[level] }, () => 0);
            return Array.from({ length: dims[level] }, () => build(level + 1));
          };
          value = build(0);
        }
        if (pointer) {
          value = truncateForType(value, s.dataType, 1);
        } else {
          value = truncateForType(value, s.dataType, 0);
        }
        const slot = makeSlot(frame, s.name, value, {
          pointer,
          reference: s.reference,
          type: resolvedDataType,
        });
        if (structDef && !pointer && !s.dimensions.length) {
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
        if (b) {
          if (b.freed)
            throw new InterpError(`double delete of ${fmtAddr(addr)}`, s.line);
          b.freed = true;
        }
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
        if (s.init) {
          if (s.init.type === "decl" || s.init.type === "multiDecl")
            execStmt(s.init, frame);
          else if (s.init.expr) evalNode(s.init.expr, frame);
        }
        let i = 0;
        while (!!evalNode(s.cond, frame)) {
          if (i++ >= MAX_LOOP_ITERATIONS)
            throw new InterpError("loop iteration limit exceeded", s.line);
          snapshot(s.line, `for condition → true`);
          const sig = execStmt(s.body, frame);
          if (sig === "return") return sig;
          if (sig === "break") break;
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

  // [PATCH 1] Initialise globals before main().
  if (functions.__globals) {
    for (const g of functions.__globals) {
      let value = 0;
      try {
        if (g.initializer) {
          const fakeFrame = {
            line: g.line,
            scopes: [new Map()],
            values: new Map(),
          };
          value = evalNode(g.initializer, fakeFrame);
        }
      } catch {}
      value = truncateForType(value, g.dataType, g.pointerDepth);
      makeGlobalSlot(g.name, value, {
        pointer: g.pointerDepth > 0,
        reference: g.reference,
        type: g.dataType,
      });
    }
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
