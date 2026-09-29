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
- Template specialization, supported specialization, non-type template parameters, and complex dependent types
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
## Advanced C support added

The native C visualizer now supports these additional constructs:

- `union` declarations and member access, including `typedef union { ... } Name;`
- Function-pointer declarations such as `int (*operation)(int, int);`
- Function-pointer assignment and invocation, e.g. `operation = add; operation(1, 2);`
- `sizeof(type)` and `sizeof(expression)` for the visualizer's type-size model
- Heap-pointer aliasing (`int *a = malloc(...); int *b = a;`)
- Freed-memory tracking through aliases; dereferencing an alias after `free()` reports a use-after-free error
- Null function-pointer calls are detected explicitly instead of being reported as an unrelated unsupported function

These features are implemented in the educational interpreter used for visualization. Judge0 remains responsible for actual C compilation/execution.


## C DSA practice target

The native C visualizer is intended to support practical DSA implementations rather than only toy examples. The deterministic VM therefore prioritizes:

- arrays and multidimensional arrays
- pointers and pointer arithmetic
- malloc/calloc/realloc/free
- structs, typedefs, unions and self-referential nodes
- recursion and function call stacks
- queues, stacks and linked-list implementations
- tree and graph representations
- searching, sorting, BFS/DFS, backtracking and dynamic programming
- multi-file `.c` projects

The in-app **C Support** page at `/c-support` is the source of truth for feature-level support status and explains the difference between compiler execution and source-level visualization.


## Coverage policy

All 90 tracked C/DSA capabilities have a defined status: **79 supported, 11 supported, 0 unsupported**. Supported means the feature is recognized or usable for practice, but some ABI, OS, concurrency, or advanced language semantics are intentionally not modeled by the deterministic visualizer VM.
