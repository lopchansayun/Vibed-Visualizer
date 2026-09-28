# C / C++ visualizer support matrix

CodeViz has separate **execution** and **visualization** layers. Judge0 can execute many constructs that the educational interpreter does not need to understand. The visualizer only claims support when it can build a deterministic source-level trace.

## Supported C/C++ visualization

### Core language
- Variables: integral, floating-point, `char`, `bool`, `string`, `auto`
- Arithmetic, comparison, logical, bitwise, assignment, casts, ternary
- `if/else`, `for`, `while`, `do/while`, `switch`, `break`, `continue`, `return`
- User-defined functions, parameters, return values, basic overload selection
- C/C++ input/output: `printf`, `puts`, `putchar`, limited `scanf`, `cout`, `cin`, `endl`
- Arrays and initializer lists

### Pointers and memory
- Pointers, references, address-of, dereference
- Pointer arithmetic and multi-level pointers
- `malloc`, `calloc`, `realloc`, `free`
- `new`, `new[]`, `delete`, `delete[]`
- Null dereference, use-after-free, and bounds checks

### OOP
- Classes/structs and objects
- Fields and member functions
- Constructors/destructors
- `this`, `.`, and `->`
- Single and multiple inheritance
- Virtual inheritance metadata and diamond-base deduplication
- `virtual`, `override`, `final`
- Runtime member dispatch through base/object references at the educational level

### Requested advanced C++ features
- **Function pointers**, including passing a function pointer to another function
- **Structured bindings** for 2- and 3-element array/pair-like values
- **Lambdas**, including captureless and basic value/reference captures
- **Function templates / template instantiation** for simple type-parameter templates
- Explicit template call syntax such as `max<int>(a, b)` is normalized for the educational runtime

### STL educational model
- `std::vector`, `std::array`, `std::deque`, `std::list`, `std::set`, `std::unordered_set`, basic `stack`/`queue`
- Basic container operations such as `push_back`, `push_front`, `pop_back`, `pop_front`, `size`, `empty`, `clear`, `at`, `front`, `back`
- `std::string` basic size/length/empty/index/substr operations

## Still outside the visualizer subset

These may still compile/run through Judge0, but the educational interpreter does not claim full semantics for them:

- Full STL iterator/algorithm semantics
- `std::map` / `std::unordered_map` complex APIs
- Template specialization, partial specialization, non-type template parameters, and complex dependent types
- Generic lambdas with complex captures or generic `auto` parameters
- Operator overloading
- Complex constructor initializer-list semantics
- Explicit virtual-table memory layout
- Complex virtual inheritance/cast semantics
- `dynamic_cast`, `typeid`, RTTI
- Smart pointers and complete RAII semantics
- Move semantics/rvalue references
- Concepts, modules, coroutines
- Variadic templates/functions
- Function pointers with complex member-function-pointer syntax
- Unions, bit-fields, inline assembly, OS/thread/network APIs

## C# visualization

**C# visualization is intentionally disabled.** C# can still be run through the compiler path, but the Visualize action is disabled and reports **“Visualization not available for C#.”**

## Memory UI

The visualizer now has independent **Stack** and **Heap** toggles. When both are visible they share the memory area. When only one is enabled, that view automatically takes the full available width. When both are hidden, a compact placeholder explains how to restore either view. Address display remains an independent toggle.

## Advanced test programs

See `examples/support-tests/advanced/`:

- `function_pointers.cpp`
- `structured_bindings.cpp`
- `lambdas.cpp`
- `templates.cpp`
- `virtual_multiple_inheritance.cpp`
