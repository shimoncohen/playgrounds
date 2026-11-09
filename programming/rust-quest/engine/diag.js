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
  E0005:{
    title:'a pattern can fail',
    msg:()=>'refutable pattern in local binding',
    tip:'A plain `let` needs a pattern that matches every value. Use `let ... else { ... }` for the other case, or `if let`, or `match`.'
  },
  E0530:{
    title:'a pattern name is also a variant',
    msg:o=>'match bindings cannot shadow tuple variants',
    tip:'`Some`, `Ok` and `Err` hold a value, so write the part in parentheses, like `Some(x)`. A bare name in a pattern is a new variable, and it may not reuse a variant\'s name.'
  },
  E0004:{
    title:'a match leaves some cases out',
    msg:o=>{
      if(o.empty)return 'non-exhaustive patterns: type `'+o.empty+'` is non-empty';
      const m=o.missing.map(x=>'`'+x+'`'),n=m.length;
      return 'non-exhaustive patterns: '+(n===1?m[0]:n<=3?m.slice(0,-1).join(', ')+' and '+m[n-1]:m.slice(0,3).join(', ')+' and '+(n-3)+' more')+' not covered';
    },
    tip:'A `match` has to handle every possible value. Add an arm for each case the message lists, or a last arm with `_` to catch the rest.'
  },
  E0170:{
    title:'a pattern name is also a variant',
    msg:o=>'pattern binding `'+o.name+'` is named the same as one of the variants of the type `'+o.enum+'`',
    tip:'A bare name in a pattern is a new variable that matches anything, not the variant. Write the variant by its full path, like `Shape::Circle`, or rename the variable.'
  },
  E0277:{
    title:'a type is missing a trait this code needs',
    msg:o=>o.what==='try-ret'?'the `?` operator can only be used in a function that returns `Result` or `Option` (or another type that implements `FromResidual`)':o.what==='try-kind'?'the `?` operator can only be used on `'+(o.from==='Option'?'Result`s, not `Option`s':'Option`s, not `Result`s')+', in a function that returns `'+(o.from==='Option'?'Result':'Option')+'`':o.what==='try-convert'?'`?` couldn\'t convert the error to `'+o.to+'`':o.trait==='Ord'?'the trait bound `'+o.type+': Ord` is not satisfied':o.trait==='PartialEq'?'can\'t compare `'+o.type+'` with `'+o.type+'`':'`'+o.type+'` doesn\'t implement '+(o.debug?'`Debug`':'`std::fmt::Display`'),
    tipFor:o=>o.what==='try-convert'?'`?` hands the error to the caller as the error type that the function returns. Rust Quest has no conversion between your own error types yet, so make the error type of the call and of the function the same.':o.what&&o.what.startsWith('try-')?'`?` hands an `Err` (or a `None`) back to the caller, so the function must return a `Result` for a `Result` and an `Option` for an `Option`. Change its return type and end the happy path with `Ok(...)` or `Some(...)`.':'',
    tip:'`{}` needs the type to know how to show itself, and your own types do not: print with `{:?}` after adding `#[derive(Debug)]` above the type, or print its fields one by one. `contains` needs `PartialEq`, and `sort` needs `Ord`, which a decimal number never has because of `NaN`: derive them above the type, or compare and sort by a field.'
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
    title:'a value moves out of a place that keeps it',
    msg:o=>o.index?'cannot move out of index of `'+o.type+'`':'cannot move out of `'+o.name+'`'+(o.variant?' as enum variant `'+o.variant+'`':'')+' which is behind a '+(o.mut?'mutable':'shared')+' reference',
    tip:'A reference only lends the value, and a `Vec` keeps its elements, so neither lets you take one away. Copy it with `.clone()`, borrow it with `&`, or take the whole value by value in the signature.'
  },
  E0609:{
    title:'a value has no such field',
    msg:o=>'no field `'+o.name+'` on type `'+o.type+'`',
    tip:'Check the spelling against the fields in the type\'s definition. A tuple\'s fields are numbered from 0.'
  },
  E0599:{
    title:'no such method or item',
    msg:o=>o.what==='bounds'?'the method `'+o.name+'` exists for struct `'+o.type+'`, but its trait bounds were not satisfied':o.what==='method'?'no method named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope':'no '+(o.kind==='enum'?'variant, associated function, or constant':'associated function or constant')+' named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope',
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
    // rustc names a number literal's open type in words, without backticks
    msg:o=>{
      const q=t=>t==='integer'||t==='floating-point number'?t:'`'+t+'`';
      const head={match:'`match` arms have incompatible types',else:'`if` and `else` have incompatible types',letelse:'`else` clause of `let...else` does not diverge',try:'`?` operator has incompatible types'}[o.what]||'mismatched types';
      return head+': expected '+q(o.expected)+', found '+q(o.found);
    },
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
  derive:'Only `#[derive(...)]` of `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `PartialOrd`, `Ord`, `Default` and `Hash` is modeled. Every field must have the trait too. `Copy` needs `Clone`, `Eq` and `PartialOrd` need `PartialEq`, and `Ord` needs `PartialOrd` and `Eq`. An `enum` derives `Default` from the one unit variant marked `#[default]`.',
  'match guard':'A `match` guard that moves a name its arm binds, like `Some(s) if eat(s)` (rustc reports `E0507`), or assigns to or borrows mutably part of the value being matched (`E0506`, `E0502`), is not modeled. Make the guard only read.',
  impl:'Only `impl Name { ... }` with plain methods and associated functions (no generics, attributes or constants), and `impl Drop for Name` whose `drop` only prints with `println!`, are modeled.',trait:LATER,static:'`static` items are not modeled. Use a `const`, which the quest does model.',
  'type alias':LATER,use:'The only `use` modeled is `use std::collections::HashMap;` once at the top of the file. The missions otherwise use what Rust gives every program.',mod:LATER,generics:LATER,
  method:'A method takes `self`, `&self` or `&mut self` as its first parameter. A receiver with a type written out, like `self: Box<Self>`, is not modeled.','nested item':'Put `fn` and `const` items at the top of the file, outside `main`.',closure:LATER,
  match:'A `match` on a `&mut` reference is not modeled. Match on the value itself, or on a `&` reference.',
  'method call':'Modeled for now: `len`, `clone`, `to_string`, `to_owned`, `as_str` and `push_str` on a `String` (and `len`, `to_string` and `to_owned` on a `&str`); the methods you write in an `impl`; `clone` on a type that derives `Clone`; `is_some`, `is_none`, `is_ok`, `is_err`, `unwrap`, `expect` and `unwrap_or` on `Option` and `Result`; `len`, `is_empty` and `clone` on a `Vec` or `HashMap`, `push` on a `Vec` and `insert` on a `HashMap`.','field access':'Only the numbered fields of a tuple, like `t.0`, and the fields of your own `struct` are modeled for now. An `enum` has no fields: use a `match`.',
  'field of a temporary':'Reading a field of a value that is not in a variable, like `make().id`, is not modeled. Put the value in a variable first.',slice:'A bare slice type `[T]` has no size, so it only appears behind a `&`, as `&[T]`.',
  'slice of non-ASCII text':'Slicing text with accented letters, emoji or other non-English characters is not modeled, because one letter can take several bytes. Use plain English letters for now.',
  reference:'Only `&T` and `&mut T` on a `String` or a number are modeled, `&str` for text, and `&[T]` for a slice. Use one of those, or pass the value itself.',
  dereference:'`*` works on a reference, like `*r` where `r` is a `&i32` or `&mut i32`. This value is not a reference.',
  'explicit lifetime':'Lifetime names like `\'a` are not modeled. Write `&T` and let Rust work the lifetime out, or return `&\'static str` from a `fn` for a string literal. `&\'static str` is modeled only as the return type of a `fn`.',
  'lifetime elision':'A function that returns a reference is modeled only as `-> &T` with exactly one `&` (not `&mut`) parameter. Otherwise return an owned value, like a `String`.',
  'reference coercion':'Rust Quest only converts a `&String` into a `&str` for you. Pass the same kind of reference the function asks for.',
  'reference to reference':'A reference to a reference, like `&&str` or `&t` where `t` is already a `&str`, is not modeled. Pass `t` itself instead.',
  reborrow:'Reborrowing a `&mut`, like `&*r`, borrowing a field behind a `&mut`, like `&mut self.items`, or calling `as_str` on a `&mut String`, is not modeled. Use the `&mut` variable directly instead.',
  'borrow of a field':'Borrowing an array element, like `&a[0]`, or a method call on one, is not modeled. Borrow the whole variable instead. A `Vec` element, like `&v[0]`, is modeled.',
  'temporary borrow':'Borrowing a temporary value, like `&5`, `&String::new()` or `String::from("a").as_str()`, is not modeled. Put the value in a variable first, then borrow the variable.',
  'partial move':'Moving an element out of an array, a field out of a type with `impl Drop`, or a name out of a `match` on such a value is not modeled. Use `.clone()`, or a field that is a number. A match that moves a name the compiler may already see as moved is not modeled either.',
  'move out of reference':'Moving a value out from behind a reference, like `let t = *r;` on a `&String`, is not modeled. Use `r.clone()` to copy it instead.',
  'two-phase borrow':'A `&mut` method call whose argument borrows or changes the same variable, like `s.push_str(&s)` or `v.push(v.pop().unwrap())`, is not modeled. Reading it is: `v.push(v.len())` works. Copy the argument into a variable first.',
  'constant condition':'An `if` or `while` whose condition is the literal `true` or `false` is not modeled. Put the condition in a variable, or use `loop`.',
  'use while borrowed':'Reading or updating a number while a `&mut` borrow of it is still in use is not modeled. Finish with the `&mut` first, or read the value through the reference.',
  'reference in aggregate':'A tuple or array that holds a reference, like `(&x, 1)`, is not modeled. Keep the reference in its own variable.',
  'repeated error':'Several `&mut` borrows of a variable that is not `mut` are one error in Rust, and Rust Quest does not model how it is reported. Write `let mut` for the variable first.',
  'program too large':'This function is too big for the borrow checker in Rust Quest. Split it into smaller functions.',
  cast:'This kind of `as` conversion is not modeled. Convert between numbers, or turn a `bool` or a `char` into a number.','try operator':'`?` is modeled on a `Result` or an `Option` that holds no reference, in a function that returns the same kind. Match on the value or use `unwrap` for anything else.','error conversion':'`?` here would have to turn one error type into another with `From`, which Rust Quest teaches in a later chapter. Make both error types the same, for now.','struct literal':'Write every field of the `struct` exactly once, as `Name { field: value, ... }`, with no `..` base.','qualified path':LATER,
  'fn pointer':LATER,'impl Trait':LATER,'inferred type':'Write the type out, like `let x: Option<i32> = None;`. Rust Quest does not infer a type behind `_`, or for a `None` that nothing else gives a type.',
  pattern:'Modeled patterns: a name or `_`, literals, ranges like `1..=5`, `|` between patterns that bind nothing, tuples, `struct` and `enum` variants (`Shape::Rect { w, h }`, `Some(n)`), and `n @ 1..=5`. Not modeled yet: `ref`, `&` patterns, slices, constants, floats, a `&` met inside a tuple or `struct`, a wrong field list, and a name that repeats.',
  'deferred initialization':'Give the variable its value right in the `let`, like `let x = 5;`. To set it later, write its type: `let x: i32;`.',
  'format spec':'Only `{}`, `{:?}`, `{:#?}`, `{:.N}` on a decimal number and `{:>N}` are modeled. Print the value with one of those.',
  'assignment target':'Assign to a variable, a field, or an element of a `Vec` you own or hold by `&mut`, like `v[0] = 1`.',
  'type checking':'Rust Quest cannot tell yet whether these types fit together. Keep each value to one type for now.',
  'const initializer':'A `const` can only hold a literal, or simple maths on other constants, for now.',
  'integer overflow':'Dividing the smallest number of a type by `-1` overflows. Rust Quest does not model that case; use another divisor.',
  'const folding':'Rust Quest cannot tell whether the compiler would catch this overflow before the program runs. Pass the value in as a function parameter, or use numbers that cannot overflow.',
  'range expression':'A range like `0..5` is modeled only right after `for ... in`, or inside `&text[0..5]` to take a slice.',
  'for iterable':'`for` loops over a range like `0..5`, over a `Vec` or `HashMap`, and over `&v`, `&mut v`, `v.iter()`, `v.iter_mut()`, `m.keys()` and `m.values()`. Arrays, slices and other iterators are not modeled yet: loop over a `Vec`, or count with a range and index.',
  'let condition':'A `let` inside an `if` or `while` condition next to other tests, like `if x > 0 && let Some(n) = o`, is not modeled. Use `if let` or `while let` on its own, and put the other test inside the block.',
  nesting:'Code nested this deeply, in a pattern, an expression or a type, is not modeled. Split it into smaller pieces.',
  'array length':'Write the array length as a plain number, like `[i32; 3]`, no bigger than 10000.',
  'break outside loop':'`break` and `continue` only work inside a loop.',
  'main signature':'`main` takes no parameters and returns nothing, or `Result<(), E>` where `E` can be printed with `{:?}`. Write `fn main() { ... }` or `fn main() -> Result<(), String> { ... }`.',
  'path call':'Only `Name::function` for a function in your own `impl Name { ... }`, an `enum` variant, `Name::default()` for a type that derives `Default`, `String::new`, `String::from`, `Vec::new` and `HashMap::new` are modeled.',
  'function value':'Using a function as a value is not modeled yet. Call it with `name(...)` instead.',
  'bit shift':'Shifts are not modeled yet. Multiply or divide instead.',
  'block label':LATER,
  call:'Only a call to one of your own functions, like `name(1, 2)`, is modeled for now.',
  'wrong argument count':'Rust Quest does not check argument counts yet. Pass exactly what the function declares.',
  String:'Only a plain `String` is modeled, with no type arguments or path in front. Build one with `String::from("hi")` or `String::new()`.',
  Vec:'Write `Vec<T>` with its element type, like `Vec<i32>`, and build one with `Vec::new()` or `vec![1, 2, 3]`. The elements cannot be references.',
  HashMap:'Add `use std::collections::HashMap;` at the top, then write `HashMap<K, V>` with both types, like `HashMap<String, i32>`, and build one with `HashMap::new()`.',
  'map index':'Indexing a `HashMap` with `m[&key]` is not modeled yet: a missing key panics inside the standard library. Use `m.get(&key)`, which gives an `Option`, and match on it.',
  'collection method':'Modeled on a `Vec`: `push`, `pop`, `len`, `is_empty`, `insert`, `remove`, `clear`, `truncate`, `swap`, `reverse`, `sort`, `contains`, `get`, `get_mut`, `first`, `last`, `extend` and `clone`. On a `HashMap`: `insert`, `get`, `get_mut`, `contains_key`, `remove`, `extend`, `len`, `is_empty`, `clear`, `clone` and `entry(k).or_insert(v)`. Closures and iterator adapters wait for a later chapter.',
  iterator:'`iter()`, `iter_mut()`, `keys()`, `values()` and `values_mut()` are modeled right after `for ... in`, like `for x in v.iter()`. An iterator in a variable, or with `map`, `filter` and the like, is not modeled yet. Loop over the collection instead.',
  'hash key':'A `HashMap` key must be `Eq` and `Hash`, and Rust Quest could not tell whether this key is. Write the map\'s type out, like `let mut m: HashMap<String, i32> = HashMap::new();`.',
  'reference in collection':'A `Vec` or `HashMap` that holds a reference, like `Vec<&str>` or `v.push(&x)`, is not modeled. Keep owned values in it, like `String`.',
  Option:'Write `Option<T>` with its type argument, like `Option<i32>`, and build it with `Some(x)` or `None`.',Result:'Write `Result<T, E>` with both type arguments, like `Result<i32, String>`, and build it with `Ok(x)` or `Err(e)`.',Box:LATER,
  str:'Use the `&str` type for text for now.',
  'panic!':'`panic!` is not modeled yet. Print a message with `println!` instead.',
  'assert!':'`assert!` is not modeled yet. Print the value with `println!` and look at it.',
  'assert_eq!':'`assert_eq!` is not modeled yet. Print both values with `println!` and compare them by eye.',
  'assert_ne!':'`assert_ne!` is not modeled yet. Print both values with `println!`.',
  'debug_assert!':'`debug_assert!` is not modeled yet. Print the value with `println!`.',
  'debug_assert_eq!':'`debug_assert_eq!` is not modeled yet. Print both values with `println!`.',
  'vec!':'Write `vec![1, 2, 3]`, `vec![0; 5]` or `vec![]` with a type given by the `let`.',
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
  make:(id,line,col,o)=>{const d=ERRORS[id],msg=d?d.msg(o||{}):id,tip=d&&d.tipFor&&d.tipFor(o||{});return d&&d.lint?{lint:id,line,col,msg}:{code:id,line,col,msg,...tip&&{tip}};},
  tip:id=>(ERRORS[id]&&ERRORS[id].tip)||'',
  title:id=>(ERRORS[id]&&ERRORS[id].title)||''
};
})();
