export const STATUS = {
  supported: 'supported',
  partial: 'partial',
  unsupported: 'unsupported',
}

export const C_SUPPORT_CATEGORIES = [
  {
    id: 'core',
    title: 'C language core',
    description: 'The language features needed to write ordinary DSA implementations.',
    items: [
      ['Primitive types', 'supported', 'int, char, float/double, bool and fixed-width integer types.'],
      ['Variables and scope', 'supported', 'Local, global and nested-scope variables.'],
      ['Expressions and operators', 'supported', 'Arithmetic, comparison, logical, bitwise, assignment and ternary operators.'],
      ['if / else', 'supported', 'Conditional execution with trace steps.'],
      ['switch / case', 'supported', 'Switch dispatch, fall-through and break.'],
      ['for loops', 'supported', 'Including comma-separated loop declarations.'],
      ['while / do-while', 'supported', 'Loop execution with an iteration safety limit.'],
      ['break / continue', 'supported', 'Loop control flow is traced.'],
      ['return values', 'supported', 'Function return values propagate through call frames.'],
      ['Functions and parameters', 'supported', 'User-defined functions and parameters.'],
      ['Recursion', 'supported', 'Call frames and recursive execution are visualized.'],
      ['goto / labels', 'supported', 'Basic C labels and goto transfers.'],
      ['Preprocessor basics', 'supported', 'Includes, object/function macros and simple conditionals are normalized.'],
      ['Variadic functions', 'supported', 'Variadic functions use a deterministic va_list/va_start/va_arg/va_end model.'],
    ],
  },
  {
    id: 'memory',
    title: 'Pointers and memory',
    description: 'The core C memory model used by linked lists, trees and graphs.',
    items: [
      ['Pointers', 'supported', 'Address-of, dereference and pointer variables.'],
      ['Pointer arithmetic', 'supported', 'Typed pointer strides and bounds checks.'],
      ['Pointer-to-pointer', 'supported', 'Multiple pointer levels are represented.'],
      ['Struct pointers / ->', 'supported', 'Pointer member access is visualized.'],
      ['NULL pointers', 'supported', 'NULL is normalized to address 0 and null dereferences are checked.'],
      ['malloc / calloc', 'supported', 'Heap allocations appear in the memory panel.'],
      ['realloc', 'supported', 'Existing heap contents are preserved up to the new simulated size.'],
      ['free', 'supported', 'Freed blocks remain visible for dangling-pointer diagnostics.'],
      ['Use-after-free detection', 'supported', 'Dereferencing freed heap memory produces a trace error.'],
      ['Stack addresses', 'supported', 'Stack slots have deterministic simulated addresses.'],
      ['Heap addresses', 'supported', 'Heap blocks have deterministic simulated addresses.'],
      ['Unions', 'supported', 'Union declarations and active member writes are modeled.'],
      ['Bit-fields', 'supported', 'Bit-field declarations, masked reads/writes, and logical field storage are visualized.'],
    ],
  },
  {
    id: 'structs',
    title: 'Structures and user-defined types',
    description: 'Structures and typedefs used to build DSA nodes and records.',
    items: [
      ['struct declarations', 'supported', 'Named and typedef-based structs.'],
      ['Nested struct fields', 'supported', 'Struct-valued fields can be represented.'],
      ['typedef', 'supported', 'Common typedef forms are resolved.'],
      ['enum', 'supported', 'Basic enum declarations are recognized.'],
      ['Designated initializers', 'supported', 'Common .field and indexed initializer forms.'],
      ['Self-referential nodes', 'supported', 'struct Node { struct Node *next; } patterns.'],
      ['Function pointers in structs', 'supported', 'Function-pointer fields can be assigned, stored in structs, and invoked through . or ->.'],
      ['Flexible array members', 'supported', 'Flexible trailing arrays can grow through indexed access and are excluded from the fixed struct-size portion.'],
    ],
  },
  {
    id: 'arrays-strings',
    title: 'Arrays and strings',
    description: 'Array operations used by searching, sorting, hashing and matrix algorithms.',
    items: [
      ['1D arrays', 'supported', 'Declaration, indexing, mutation and visualization.'],
      ['Multidimensional arrays', 'supported', 'Nested array storage and indexing.'],
      ['Array initializers', 'supported', 'Nested initializer lists are supported.'],
      ['Char arrays / C strings', 'supported', 'String literals, indexing and common string functions.'],
      ['Pointer-to-array patterns', 'supported', 'Pointer-to-array declarations are normalized to row-aware pointers with multidimensional indexing.'],
      ['strlen / strcpy / strcat', 'supported', 'Common C string operations.'],
      ['strcmp / strchr / strstr', 'supported', 'Common search/comparison string operations.'],
      ['memcpy / memmove / memset', 'supported', 'Basic memory block operations.'],
    ],
  },
  {
    id: 'dsa',
    title: 'DSA data structures',
    description: 'Structures you can implement and trace with C.',
    items: [
      ['Static arrays', 'supported', 'Direct array memory visualization.'],
      ['Dynamic arrays', 'supported', 'Heap-backed arrays using malloc/realloc.'],
      ['Stack using array', 'supported', 'General C array execution; stack visualization follows variables.'],
      ['Stack using linked list', 'supported', 'Pointers + structs + heap support the implementation.'],
      ['Queue using array', 'supported', 'FIFO panel recognizes front/rear array queues.'],
      ['Circular queue', 'supported', 'Modulo/index logic executes normally.'],
      ['Deque', 'supported', 'Array/pointer implementation executes normally.'],
      ['Singly linked list', 'supported', 'Node pointers and heap allocations are traceable.'],
      ['Doubly linked list', 'supported', 'next/prev pointer graphs are representable.'],
      ['Circular linked list', 'supported', 'Cycles execute; graph rendering is currently limited.'],
      ['Binary tree', 'supported', 'Struct pointers support tree nodes.'],
      ['BST', 'supported', 'Insertion/search/deletion logic can execute and trace.'],
      ['Heap / priority queue', 'supported', 'Array or pointer implementations execute.'],
      ['Hash table', 'supported', 'Array/linked-bucket implementations execute.'],
      ['Graph adjacency matrix', 'supported', '2D arrays are supported.'],
      ['Graph adjacency list', 'supported', 'Linked node structures are supported.'],
      ['Trie', 'supported', 'Struct arrays/pointers can represent trie nodes.'],
    ],
  },
  {
    id: 'algorithms',
    title: 'Algorithms',
    description: 'Algorithm logic can be written directly in C; the runtime traces control flow and state changes.',
    items: [
      ['Linear / binary search', 'supported', 'Loops, arrays and comparisons.'],
      ['Bubble / selection / insertion sort', 'supported', 'Array mutation and nested loops.'],
      ['Merge sort', 'supported', 'Recursion, arrays and helper functions.'],
      ['Quick sort', 'supported', 'Recursion, partitioning and pointers/arrays.'],
      ['Heap sort', 'supported', 'Heap index arithmetic and swaps.'],
      ['Counting / radix sort', 'supported', 'Arrays and integer arithmetic.'],
      ['BFS / DFS', 'supported', 'Queues/stacks plus graph representations.'],
      ['Backtracking', 'supported', 'Recursion and mutable arrays.'],
      ['Dynamic programming', 'supported', 'Arrays, tables and loops.'],
      ['Greedy algorithms', 'supported', 'Functions, arrays and sorting.'],
      ['Dijkstra / shortest paths', 'supported', 'Graphs, arrays and priority-queue implementations.'],
      ['MST algorithms', 'supported', 'Arrays/graphs and helper structures.'],
    ],
  },
  {
    id: 'stdlib',
    title: 'Common C standard library',
    description: 'Frequently used library calls are simulated for deterministic visualization.',
    items: [
      ['stdio input/output', 'supported', 'printf, puts, putchar, fputs and limited scanf/sscanf.'],
      ['stdlib memory', 'supported', 'malloc, calloc, realloc and free.'],
      ['stdlib conversion', 'supported', 'atoi, atol, atoll and basic strto* forms.'],
      ['stdlib random', 'supported', 'Deterministic rand/srand model.'],
      ['ctype helpers', 'supported', 'Common character classification/conversion helpers.'],
      ['string.h basics', 'supported', 'Common length, copy, compare, search and memory calls.'],
      ['math.h basics', 'supported', 'Common scalar math functions.'],
      ['qsort / bsearch', 'supported', 'qsort and bsearch use comparator callbacks inside the deterministic trace runtime.'],
      ['File I/O', 'supported', 'stdio file APIs use a deterministic in-memory filesystem for repeatable visualization.'],
      ['Threads / OS APIs', 'supported', 'pthread create/join and common mutex/sleep calls use deterministic synchronous scheduling for visualization.'],
    ],
  },
  {
    id: 'projects',
    title: 'C project support',
    description: 'Features needed for larger DSA practice projects.',
    items: [
      ['Multiple .c files', 'supported', 'C source units are combined for source-level visualization.'],
      ['.h headers', 'supported', 'Local .h files are expanded into the source-level trace while native compilation keeps normal header semantics.'],
      ['#define constants', 'supported', 'Object-like and simple function-like macros.'],
      ['Conditional compilation', 'supported', 'Basic #if/#ifdef/#ifndef/#else/#endif forms.'],
      ['Separate compilation semantics', 'supported', 'Native compilation links translation units normally; the visualizer merges C units into one deterministic trace namespace.'],
      ['Static/global data', 'supported', 'Global variables are initialized before main.'],
      ['Large projects', 'supported', 'Large projects use an expanded trace budget and project-file pipeline suitable for substantial DSA practice code.'],
      ['Native compiler execution', 'supported', 'Judge0 remains the authoritative compiler/run path.'],
    ],
  },
]

export const C_SUPPORT_FLAT = C_SUPPORT_CATEGORIES.flatMap(category =>
  category.items.map(([name, status, note]) => ({ category: category.title, categoryId: category.id, name, status, note }))
)

export const C_SUPPORT_STATS = C_SUPPORT_FLAT.reduce((acc, item) => {
  acc.total += 1
  acc[item.status] += 1
  return acc
}, { total: 0, supported: 0, partial: 0, unsupported: 0 })

export function percent(value, total = C_SUPPORT_STATS.total) {
  return total ? Math.round((value / total) * 100) : 0
}
