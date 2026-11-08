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
  E0381:{
    title:'a variable is used before it has a value',
    msg:o=>'used binding `'+o.name+'` isn\'t initialized',
    tip:'A `let` with only a type has no value until you assign one. Give it a value on every path that reaches this line, or give it one in the `let` itself.'
  },
  E0382:{
    title:'a value is used after it moved',
    msg:o=>o.assign?'assign to part of moved value: `'+o.name+'`':(o.borrow?'borrow':'use')+' of '+(o.partial?'partially moved':'moved')+' value: `'+o.name+'`',
    tip:'A `String` has one owner. Passing it on, or writing `let t = s;`, moves it, and the old name stops working. A field moves on its own too: after `let n = p.name;` the rest of `p` still works, but `p` as a whole does not. Make a copy with `.clone()`, or lend it with `&`.'
  },
  E0004:{
    title:'a match leaves some cases out',
    msg:o=>{
      const m=o.missing.map(x=>'`'+x+'`'),n=m.length;
      return 'non-exhaustive patterns: '+(n===1?m[0]:n<=3?m.slice(0,-1).join(', ')+' and '+m[n-1]:m.slice(0,3).join(', ')+' and '+(n-3)+' more')+' not covered';
    },
    tip:'A `match` has to handle every variant of the `enum`. Add an arm for each missing one, or a last arm with `_` to catch the rest.'
  },
  E0170:{
    title:'a pattern name is also a variant',
    msg:o=>'pattern binding `'+o.name+'` is named the same as one of the variants of the type `'+o.enum+'`',
    tip:'A bare name in a pattern is a new variable that matches anything, not the variant. Write the variant by its full path, like `Shape::Circle`, or rename the variable.'
  },
  E0277:{
    title:'a value cannot be printed this way',
    msg:o=>'`'+o.type+'` doesn\'t implement '+(o.debug?'`Debug`':'`std::fmt::Display`'),
    tip:'`{}` needs the type to know how to show itself, and your own types do not. Print it with `{:?}` after adding `#[derive(Debug)]` above the type, or print its fields one by one.'
  },
  E0369:{
    title:'two values of this type cannot be compared',
    msg:o=>'binary operation `'+o.op+'` cannot be applied to type `'+o.type+'`',
    tip:'`==` needs the type to say what equal means. Add `#[derive(PartialEq)]` above the type, or compare the fields one by one.'
  },
  E0594:{
    title:'a field is assigned, but it cannot change',
    msg:o=>o.ref?'cannot assign to `'+o.name+'`, which is behind a `&` reference':'cannot assign to `'+o.name+'`, as `'+o.root+'` is not declared as mutable',
    tip:'Changing a field changes the value that holds it, so that value has to be `mut`. Write `let mut` for the variable, or take a `&mut` parameter instead of a `&` one.'
  },
  E0507:{
    title:'a value moves out from behind a reference',
    msg:o=>'cannot move out of `'+o.name+'`'+(o.variant?' as enum variant `'+o.variant+'`':'')+' which is behind a '+(o.mut?'mutable':'shared')+' reference',
    tip:'A reference only lends the value, so you cannot take it away from the owner. Copy it with `.clone()`, borrow it with `&`, or take the whole value by value in the signature.'
  },
  E0609:{
    title:'a value has no such field',
    msg:o=>'no field `'+o.name+'` on type `'+o.type+'`',
    tip:'Check the spelling against the fields in the type\'s definition. A tuple\'s fields are numbered from 0.'
  },
  E0599:{
    title:'no such method or item',
    msg:o=>o.what==='method'?'no method named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope':'no '+(o.kind==='enum'?'variant or associated item':'function or associated item')+' named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope',
    tip:'Rust cannot find that name on this type. Check the spelling, that it is defined in an `impl` block for the type, and that a method has `self` as its first parameter. `.clone()` also needs `#[derive(Clone)]` on the type.'
  },
  E0499:{
    title:'a value is borrowed as mutable twice',
    msg:o=>'cannot borrow `'+o.name+'` as mutable more than once at a time',
    tip:'A `&mut` borrow is exclusive: while it is still going to be used, nothing else can borrow the same variable. Finish with the first borrow before you make the second.'
  },
  E0502:{
    title:'a value is borrowed as mutable and as immutable at once',
    msg:o=>'cannot borrow `'+o.name+'` as '+(o.mut?'mutable':'immutable')+' because it is also borrowed as '+(o.mut?'immutable':'mutable'),
    tip:'You can have many `&` borrows or one `&mut`, but not both while the first is still going to be used. Use the first borrow up before you make the other.'
  },
  E0505:{
    title:'a value moves while it is borrowed',
    msg:o=>'cannot move out of `'+o.name+'` because it is borrowed',
    tip:'Moving a value ends its old name, so no borrow of it may still be in use. Use the borrow before the move, or `.clone()` the value and move the copy.'
  },
  E0506:{
    title:'a variable is assigned while it is borrowed',
    msg:o=>'cannot assign to `'+o.name+'` because it is borrowed',
    tip:'Changing a variable that a borrow still points at would change what the borrow sees. Use the borrow before the assignment, or assign first.'
  },
  E0596:{
    title:'a value is borrowed as mutable, but it cannot change',
    msg:o=>o.ref?'cannot borrow `'+o.name+'` as mutable, as it is behind a `&` reference':'cannot borrow `'+o.name+'` as mutable, as '+(o.root?'`'+o.root+'`':'it')+' is not declared as mutable',
    tip:'Changing a value through a borrow needs the right to change it. Write `let mut` for the variable, or take a `&mut` parameter instead of a `&` one.'
  },
  E0597:{
    title:'a borrowed value goes out of scope too soon',
    msg:o=>'`'+o.name+'` does not live long enough',
    tip:'A variable disappears at the end of the block that declares it, and a borrow of it cannot outlast that. Declare the variable in the outer block, or use the borrow before the block ends.'
  },
  E0106:{
    title:'a returned reference has no lifetime to borrow from',
    msg:()=>'missing lifetime specifier',
    tip:'A function that returns a reference has to say whose data it points at. With exactly one reference parameter Rust knows, but with none or with several it cannot guess. Return an owned value, like a `String`, instead.'
  },
  E0515:{
    title:'a function returns a reference to its own local',
    msg:o=>'cannot return '+(o.direct?'reference to ':'value referencing ')+(o.path?'local data':o.param?'function parameter':'local variable')+' `'+o.name+'`',
    tip:'A local variable is freed when the function ends, so a reference to it would point at nothing. Return the value itself (for text, a `String`) so the caller becomes its owner.'
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
  },
  E0308:{
    title:'mismatched types',
    msg:o=>'mismatched types: expected `'+o.expected+'`, found `'+o.found+'`',
    tip:'Every value has one type, and the two sides here have to agree. Change the value to the type the other side expects, or change the type you wrote.'
  },
  E0425:{
    title:'a name cannot be found',
    msg:o=>'cannot find `'+o.name+'` in this scope',
    tip:'Rust only knows a name after it is declared, and only inside the block that declares it. Check the spelling, or add a `let` for it first.'
  },
  arithmetic_overflow:{
    lint:true,
    title:'this arithmetic operation will overflow',
    msg:()=>'this arithmetic operation will overflow',
    tip:'The compiler worked out this sum ahead of time and the answer does not fit the type. Use a bigger type, like `u16` or `i64`, or smaller numbers.'
  },
  unconditional_panic:{
    lint:true,
    title:'this operation will panic at runtime',
    msg:o=>'this operation will panic at runtime: '+o.why,
    tip:'The compiler can see that this always panics when it runs, so it refuses to build it. Change the divisor or the index.'
  },
  overflowing_literals:{
    lint:true,
    title:'a number is out of range for its type',
    msg:o=>'literal out of range for `'+o.ty+'`',
    tip:'The number does not fit in the type. Use a bigger type, like `i64`, or a smaller number.'
  }
};
// the stderr a panic prints, minus the thread id rustc adds (verify-rustc.mjs drops it from the real output); rustc starts it with a blank line
const panicText=p=>"\nthread 'main' panicked at src/main.rs:"+p.line+':'+p.col+':\n'+p.msg+'\n';

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
  struct:'A `struct` is modeled with named, tuple or unit fields that own their value (no `&`) and no generics. A tuple or unit `struct` cannot share its name with a `fn` or a `const`.',
  enum:'An `enum` is modeled with variants written as `Name`, `Name(T)` or `Name { field: T }`, no generics, and no `= value` numbers on the variants.',
  derive:'Only `#[derive(...)]` of `Debug`, `Clone`, `Copy`, `PartialEq` and `Eq` is modeled. Every field must have the trait too, `Copy` needs `Clone` beside it, and `Eq` needs `PartialEq`.',
  'match guard':'A `match` arm with an `if` guard is not modeled. Put the condition inside the arm instead.',
  impl:'Only `impl Name { ... }` with plain methods and associated functions (no generics, attributes or constants), and `impl Drop for Name` whose `drop` only prints with `println!`, are modeled.',trait:LATER,static:'`static` items are not modeled. Use a `const`, which the quest does model.',
  'type alias':LATER,use:'`use` is not needed yet: the missions only use what Rust gives every program.',mod:LATER,generics:LATER,
  method:'A method takes `self`, `&self` or `&mut self` as its first parameter. A receiver with a type written out, like `self: Box<Self>`, is not modeled.','nested item':'Put `fn` and `const` items at the top of the file, outside `main`.',closure:LATER,
  match:'A `match` is modeled on an `enum`, or a `&` to one, only. Use `if` for other values.',
  'method call':'Modeled for now: `len`, `clone`, `to_string`, `to_owned`, `as_str` and `push_str` on a `String` (and `len`, `to_string` and `to_owned` on a `&str`); the methods you write in an `impl`; `clone` on a type that derives `Clone`; `is_some`, `is_none`, `is_ok`, `is_err`, `unwrap`, `expect` and `unwrap_or` on `Option` and `Result`.','field access':'Only the numbered fields of a tuple, like `t.0`, and the fields of your own `struct` are modeled for now. An `enum` has no fields: use a `match`.',
  'field of a temporary':'Reading a field of a value that is not in a variable, like `make().id`, is not modeled. Put the value in a variable first.',slice:'A bare slice type `[T]` has no size, so it only appears behind a `&`, as `&[T]`.',
  'slice of non-ASCII text':'Slicing text with accented letters, emoji or other non-English characters is not modeled, because one letter can take several bytes. Use plain English letters for now.',
  reference:'Only `&T` and `&mut T` on a `String` or a number are modeled, `&str` for text, and `&[T]` for a slice. Use one of those, or pass the value itself.',
  dereference:'`*` works on a reference, like `*r` where `r` is a `&i32` or `&mut i32`. This value is not a reference.',
  'explicit lifetime':'Lifetime names like `\'a` are not modeled. Write `&T` and let Rust work the lifetime out, or return `&\'static str` from a `fn` for a string literal. `&\'static str` is modeled only as the return type of a `fn`.',
  'lifetime elision':'A function that returns a reference is modeled only as `-> &T` with exactly one `&` (not `&mut`) parameter. Otherwise return an owned value, like a `String`.',
  'reference coercion':'Rust Quest only converts a `&String` into a `&str` for you. Pass the same kind of reference the function asks for.',
  'reference to reference':'A reference to a reference, like `&&str` or `&t` where `t` is already a `&str`, is not modeled. Pass `t` itself instead.',
  reborrow:'Reborrowing a `&mut`, like `&*r`, borrowing a field behind a `&mut`, like `&mut self.items`, or calling `as_str` on a `&mut String`, is not modeled. Use the `&mut` variable directly instead.',
  'borrow of a field':'Borrowing an array element, like `&a[0]`, is not modeled. Borrow the whole variable instead.',
  'temporary borrow':'Borrowing a temporary value, like `&5`, `&String::new()` or `String::from("a").as_str()`, is not modeled. Put the value in a variable first, then borrow the variable.',
  'partial move':'Moving an element out of an array, a field out of a type with `impl Drop`, or a name out of a `match` on such a value is not modeled. Use `.clone()`, or a field that is a number. A match that moves a name the compiler may already see as moved is not modeled either.',
  'move out of reference':'Moving a value out from behind a reference, like `let t = *r;` on a `&String`, is not modeled. Use `r.clone()` to copy it instead.',
  'two-phase borrow':'A `&mut` method call whose argument uses the same variable, like `s.push_str(&s)`, is not modeled. Copy the argument into a variable first.',
  'constant condition':'An `if` or `while` whose condition is the literal `true` or `false` is not modeled. Put the condition in a variable, or use `loop`.',
  'use while borrowed':'Reading or updating a number while a `&mut` borrow of it is still in use is not modeled. Finish with the `&mut` first, or read the value through the reference.',
  'reference in aggregate':'A tuple or array that holds a reference, like `(&x, 1)`, is not modeled. Keep the reference in its own variable.',
  'repeated error':'Several `&mut` borrows of a variable that is not `mut` are one error in Rust, and Rust Quest does not model how it is reported. Write `let mut` for the variable first.',
  'program too large':'This function is too big for the borrow checker in Rust Quest. Split it into smaller functions.',
  cast:'This kind of `as` conversion is not modeled. Convert between numbers, or turn a `bool` or a `char` into a number.','try operator':LATER,'struct literal':'Write every field of the `struct` exactly once, as `Name { field: value, ... }`, with no `..` base.','qualified path':LATER,
  'fn pointer':LATER,'impl Trait':LATER,'inferred type':'Write the type out, like `let x: Option<i32> = None;`. Rust Quest does not infer a type behind `_`, or for a `None` that nothing else gives a type.',
  pattern:'A `let` takes a plain name (or `_`), `mut name` included. A `match` arm takes a variant like `Shape::Circle(r)` whose parts are plain names or `_`, a `_`, or a name that catches the rest.',
  'let else':LATER,
  'deferred initialization':'Give the variable its value right in the `let`, like `let x = 5;`. To set it later, write its type: `let x: i32;`.',
  'format spec':'Only `{}`, `{:?}`, `{:#?}`, `{:.N}` on a decimal number and `{:>N}` are modeled. Print the value with one of those.',
  'assignment target':'Only a plain variable name can be assigned to for now.',
  'type checking':'Rust Quest cannot tell yet whether these types fit together. Keep each value to one type for now.',
  'const initializer':'A `const` can only hold a literal, or simple maths on other constants, for now.',
  'integer overflow':'Dividing the smallest number of a type by `-1` overflows. Rust Quest does not model that case; use another divisor.',
  'const folding':'Rust Quest cannot tell whether the compiler would catch this overflow before the program runs. Pass the value in as a function parameter, or use numbers that cannot overflow.',
  'range expression':'A range like `0..5` is modeled only right after `for ... in`, or inside `&text[0..5]` to take a slice.',
  'for iterable':'`for` loops over a range like `0..5` or `1..=5` for now.',
  'let condition':'`if let` and `while let` are not modeled yet. Use a plain `if` with a condition that is true or false.',
  'array length':'Write the array length as a plain number, like `[i32; 3]`, no bigger than 10000.',
  'break outside loop':'`break` and `continue` only work inside a loop.',
  'main signature':'`main` takes no parameters and returns nothing in this quest. Write `fn main() { ... }`.',
  'path call':'Only `Name::function` for a function in your own `impl Name { ... }`, an `enum` variant, `String::new` and `String::from` are modeled.',
  'function value':'Using a function as a value is not modeled yet. Call it with `name(...)` instead.',
  'bit shift':'Shifts are not modeled yet. Multiply or divide instead.',
  'block label':LATER,
  call:'Only a call to one of your own functions, like `name(1, 2)`, is modeled for now.',
  'wrong argument count':'Rust Quest does not check argument counts yet. Pass exactly what the function declares.',
  String:'Only a plain `String` is modeled, with no type arguments or path in front. Build one with `String::from("hi")` or `String::new()`.',
  Vec:LATER,HashMap:LATER,Option:'Write `Option<T>` with its type argument, like `Option<i32>`, and build it with `Some(x)` or `None`.',Result:'Write `Result<T, E>` with both type arguments, like `Result<i32, String>`, and build it with `Ok(x)` or `Err(e)`.',Box:LATER,
  str:'Use the `&str` type for text for now.',
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
  hint:feature=>Object.hasOwn(HINTS,feature)?HINTS[feature]:DEFAULT_HINT,
  panicText,
  make:(id,line,col,o)=>{const d=ERRORS[id],msg=d?d.msg(o||{}):id;return d&&d.lint?{lint:id,line,col,msg}:{code:id,line,col,msg};},
  tip:id=>(ERRORS[id]&&ERRORS[id].tip)||'',
  title:id=>(ERRORS[id]&&ERRORS[id].title)||''
};
})();
