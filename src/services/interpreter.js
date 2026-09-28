// Compatibility entry point for the native educational interpreter.
// The implementation lives in ./interpreter/{cppParser,advancedFeatures,runtime}
// so C/C++ parsing and execution logic is not duplicated in one giant file.
export { runInterpreter, InterpError } from "./interpreter/runtime.js";
export { fmtAddr } from "./interpreter/cppParser.js";
