/* Wording is ours; only the ids (rustc error codes, lint names) are claims about rustc, and tests assert ids and lines.
   Code in the text is in backticks, which the UI turns into <code>. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};

const ERRORS={
  E0384:{
    title:'assigned twice to an immutable variable',
    msg:o=>o.kind==='param'?'cannot assign to the immutable argument `'+o.name+'`':'cannot assign twice to the immutable variable `'+o.name+'`',
    tip:'Variables are immutable unless you say otherwise. Write `let mut` to let the value change, or use a new `let` to make a fresh variable with the same name.',
    guide:'E0384'
  },
  E0428:{
    title:'a name is defined twice',
    msg:o=>'the name `'+o.name+'` is defined multiple times',
    tip:'Every function and constant in a file needs its own name. Rename one of them.'
  },
  E0415:{
    title:'a parameter name is used twice',
    msg:o=>'the identifier `'+o.name+'` is bound more than once in this parameter list',
    tip:'Give each parameter its own name.'
  }
};

const LATER='Rust Quest teaches this in a later chapter. For now, use `let`, `fn` and `println!`.';
const HINTS={
  HashSet:'Rust Quest does not model `HashSet`. A `HashMap<T, ()>`, or a `Vec` with `contains`, does the same job.',
  VecDeque:'Rust Quest does not model `VecDeque`. A `Vec` with `push` and `remove(0)` covers the same ground.',
  BTreeMap:'Rust Quest does not model `BTreeMap`. A `HashMap` or a sorted `Vec` does the same job.',
  BTreeSet:'Rust Quest does not model `BTreeSet`. A sorted `Vec` does the same job.',
  BinaryHeap:'Rust Quest does not model `BinaryHeap`. A `Vec` you sort does the same job.',
  LinkedList:'Rust Quest does not model `LinkedList`. A `Vec` does the same job.',
  Rc:'Shared ownership is not modeled. Pass a reference (`&`) or return the value instead.',
  Arc:'Shared ownership across threads is not modeled. Pass a reference (`&`) or return the value instead.',
  Weak:'Shared ownership is not modeled, so neither is `Weak`. Pass a reference (`&`) instead.',
  RefCell:'Interior mutability is not modeled. Take the value as `&mut` instead.',
  Cell:'Interior mutability is not modeled. Take the value as `&mut` instead.',
  OnceCell:'Interior mutability is not modeled. Compute the value up front and pass it in.',
  Mutex:'Threads and locks are not modeled. A plain `mut` variable does the same job here.',
  RwLock:'Threads and locks are not modeled. A plain `mut` variable does the same job here.',
  Cow:'`Cow` is not modeled. Use `String` when you need to own the text and `&str` when you only read it.',
  Pin:'Pinning is not modeled, and no mission needs it.',
  i128:'Rust Quest does not model `i128`. `i64` is big enough for every mission.',
  u128:'Rust Quest does not model `u128`. `u64` is big enough for every mission.',
  f32:'Rust Quest does not model `f32`. Use `f64`, the float type it knows.',
  unsafe:'Rust Quest only runs safe Rust. Every mission can be solved without `unsafe`.',
  dyn:'Trait objects are not modeled. Use a generic type, or an `enum` with one variant per case, instead.',
  async:'Async code is not modeled. Write the same logic as plain functions that run one after another.',
  'static mut':'Mutable statics need `unsafe` and are not modeled. Pass the value around as a parameter instead.',
  union:'Unions are not modeled. An `enum` does the same job safely.',
  macro_rules:'Writing your own macros is not modeled. A plain `fn` does the same job here.',
  'dbg!':'`dbg!` is not modeled. Use `println!` to print a value.',
  'other macro':'Only the built-in print and format macros are modeled. A plain `fn` does the same job here.',
  'byte literal':'Byte strings and byte chars are not modeled. Use a normal string or a `char`.',
  'raw pointer':'Raw pointers are not modeled. Use a reference (`&` or `&mut`) instead.',
  extern:'Linking to other code is not modeled. Everything a mission needs fits in one file.',
  'const fn':'`const fn` is not modeled. Use a normal `fn`.',
  'higher-ranked bound':'Higher-ranked bounds (`for<...>`) are not modeled. Plain lifetime names cover every mission.',
  'lifetime bound':'Bounds between lifetimes (like `\'a: \'b`) are not modeled. Plain lifetime names cover every mission.',
  'never type':'The `!` type is not modeled. Give the function a normal return type instead.',
  struct:LATER,enum:LATER,impl:LATER,trait:LATER,static:'`static` items are not modeled. Use a `const`, which the quest does model.',
  'type alias':LATER,use:'`use` is not needed yet: the missions only use what Rust gives every program.',mod:LATER,generics:LATER,
  method:LATER,'nested item':'Put `fn` and `const` items at the top of the file, outside `main`.',closure:LATER,
  if:LATER,match:LATER,loop:LATER,while:LATER,for:LATER,
  'method call':LATER,'field access':LATER,tuple:LATER,array:LATER,slice:LATER,index:LATER,range:LATER,
  reference:LATER,dereference:LATER,cast:LATER,'try operator':LATER,'struct literal':LATER,'qualified path':LATER,
  'fn pointer':LATER,'impl Trait':LATER,'inferred type':'Write the type out. Rust Quest does not infer a type behind `_` yet.',
  pattern:'Rust Quest only models a plain name (or `_`) on the left of a `let`, `mut name` included.',
  'let else':LATER,
  'deferred initialization':'Give the variable its value right in the `let`, like `let x = 5;`.',
  float:'Decimal numbers are not modeled yet. Use whole numbers for now.',
  'format spec':'Only a plain `{}` is modeled yet. Print the value with `{}`.',
  'assignment target':'Only a plain variable name can be assigned to for now.',
  'type checking':'Rust Quest cannot tell yet whether these types fit together. Keep each value to one type for now.',
  'unresolved name':'Rust Quest cannot find that name. Check the spelling, and that it is declared before it is used.',
  'unused function':'Rust Quest only checks the functions that `main` calls. Call this one from `main`, or remove it.',
  'const initializer':'A `const` can only hold a literal, or simple maths on other constants, for now.',
  'integer overflow':'A number went outside its type here. Rust Quest does not model overflow yet; use smaller numbers.',
  'division by zero':'Dividing by zero is not modeled yet. Use a divisor that is not zero.',
  'main signature':'`main` takes no parameters and returns nothing in this quest. Write `fn main() { ... }`.',
  'path call':'Calling functions that live inside a type or module (`Name::function`) is not modeled yet.',
  'function value':'Using a function as a value is not modeled yet. Call it with `name(...)` instead.',
  'bit shift':'Shifts are not modeled yet. Multiply or divide instead.',
  'block label':LATER,
  call:'Only a call to one of your own functions, like `name(1, 2)`, is modeled for now.',
  'wrong argument count':'Rust Quest does not check argument counts yet. Pass exactly what the function declares.',
  String:'`String` is not modeled yet. Use a string literal like `"hi"` for now.',
  Vec:LATER,HashMap:LATER,Option:LATER,Result:LATER,Box:LATER,
  str:'Use the `&str` type for text for now.',
  'format!':'`format!` is not modeled yet. Use `println!` to print.',
  'panic!':'`panic!` is not modeled yet. Print a message with `println!` instead.',
  'assert!':'`assert!` is not modeled yet. Print the value with `println!` and look at it.',
  'assert_eq!':'`assert_eq!` is not modeled yet. Print both values with `println!` and compare them by eye.',
  'assert_ne!':'`assert_ne!` is not modeled yet. Print both values with `println!`.',
  'debug_assert!':'`debug_assert!` is not modeled yet. Print the value with `println!`.',
  'debug_assert_eq!':'`debug_assert_eq!` is not modeled yet. Print both values with `println!`.',
  'vec!':LATER,
  'write!':'`write!` is not modeled yet. Use `println!` to print.',
  'writeln!':'`writeln!` is not modeled yet. Use `println!` to print.',
  'todo!':'`todo!` is not modeled yet. Leave the body empty for now.',
  'unimplemented!':'`unimplemented!` is not modeled yet. Leave the body empty for now.',
  'unreachable!':'`unreachable!` is not modeled yet. Leave the body empty for now.'
};
const DEFAULT_HINT='Rust Quest does not model this yet.';

RQ.diag={
  ERRORS,
  UNSUPPORTED:HINTS,
  hint:feature=>HINTS[feature]||DEFAULT_HINT,
  make:(code,line,col,o)=>{const d=ERRORS[code];return {code,line,col,msg:d?d.msg(o||{}):code};},
  tip:id=>(ERRORS[id]&&ERRORS[id].tip)||'',
  title:id=>(ERRORS[id]&&ERRORS[id].title)||''
};
})();
