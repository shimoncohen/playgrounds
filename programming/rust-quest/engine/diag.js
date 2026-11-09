/* Wording is ours; only the ids (rustc error codes, lint names) are claims about rustc, and tests assert ids and lines.
   Code in the text is in backticks, which the UI turns into <code>. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};

const BOUND=o=>o.trait==='Display'?'`'+o.type+'` doesn\'t implement `std::fmt::Display`':o.trait==='Debug'?'`'+o.type+'` doesn\'t implement `Debug`':o.trait==='PartialEq'||o.trait==='PartialOrd'?'can\'t compare `'+o.type+'` with `'+o.type+'`':'the trait bound `'+o.type+': '+o.trait+'` is not satisfied';
const ARITH_WORD={'+':['add','to'],'-':['subtract','from'],'*':['multiply','by'],'/':['divide','by'],'%':['calculate the remainder of','divided by']};
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
  E0107:{
    title:'wrong number of generic arguments',
    msg:o=>o.missing?'missing generics for '+o.kind+' `'+o.name+'`':o.kind+' takes '+o.want+' generic argument'+(o.want===1?'':'s')+' but '+o.got+' generic argument'+(o.got===1?' was':'s were')+' supplied',
    tip:'A generic type has to be written with one type for each parameter it declares, like `Pair<i32>`.'
  },
  E0046:{
    title:'an impl is missing a method of its trait',
    msg:o=>'not all trait items implemented, missing: '+o.missing.map(m=>'`'+m+'`').join(', '),
    tip:'`impl Trait for Type` has to write every method the trait declares without a body. Add the missing ones, or give them a default body in the `trait`.'
  },
  E0407:{
    title:'a method is not part of the trait',
    msg:o=>'method `'+o.name+'` is not a member of trait `'+o.trait+'`',
    tip:'An `impl Trait for Type` block may only hold the methods the trait declares. Move this one to a plain `impl Type` block, or add it to the trait.'
  },
  E0119:{
    title:'two impls of one trait for one type',
    msg:o=>'conflicting implementations of trait `'+o.trait+'` for type `'+o.type+'`',
    tip:'A type can implement a trait only once. Merge the two blocks into one.'
  },
  E0405:{
    title:'no trait with that name',
    msg:o=>'cannot find trait `'+o.name+'` in this scope',
    tip:'Check the spelling, and that the trait is declared with `trait '+'Name { .. }` in this file. `Debug` and `Display` need `use std::fmt::Debug;` or `use std::fmt::Display;` first.'
  },
  E0404:{
    title:'that name is not a trait',
    msg:o=>o.kind?'expected trait, found '+o.kind+' `'+o.name+'`':'cannot find trait `'+o.name+'` in this scope',
    tip:'After `impl` and after a `:` bound, only a trait name fits. A `struct`, an `enum` or a function with that name is not one: declare a `trait` or use the right name.'
  },
  E0184:{
    title:'Copy on a type with a destructor',
    msg:o=>'the trait `Copy` cannot be implemented for this type; the type has a destructor',
    tip:'A type with `impl Drop` runs code when it goes away, so it cannot be copied bit by bit. Remove `Copy` from the derive, or give the type no `Drop` code.'
  },
  E0449:{
    title:'visibility on a trait item',
    msg:o=>'visibility qualifiers are not permitted here',
    tip:'The items of a trait, and of any `impl Trait for Type` block, are as visible as the trait itself. Remove the `pub`.'
  },
  E0053:{
    title:'a method does not match its trait',
    msg:o=>'method `'+o.name+'` has an incompatible type for trait',
    tip:'The `impl` has to repeat the trait\'s signature exactly: the same parameter types and the same return type.'
  },
  E0050:{
    title:'a method has the wrong number of parameters',
    msg:o=>'method `'+o.name+'` has '+o.got+' parameter'+(o.got===1?'':'s')+' but the declaration in trait `'+o.trait+'::'+o.name+'` has '+o.want,
    tip:'The `impl` has to take the same parameters as the trait declares, `self` included.'
  },
  E0040:{
    title:'a destructor cannot be called by hand',
    msg:()=>'explicit use of destructor method',
    tip:'Rust runs `drop` for you when the value goes out of scope. To drop a value earlier, call `drop(value)`, the free function, which takes it by value.'
  },
  E0170:{
    title:'a pattern name is also a variant',
    msg:o=>'pattern binding `'+o.name+'` is named the same as one of the variants of the type `'+o.enum+'`',
    tip:'A bare name in a pattern is a new variable that matches anything, not the variant. Write the variant by its full path, like `Shape::Circle`, or rename the variable.'
  },
  E0277:{
    title:'a type is missing a trait this code needs',
    msg:o=>o.what==='fn'?'expected a `'+o.text+'` closure, found `'+o.type+'`':o.what==='cmp'?'can\'t compare `'+o.left+'` with `'+o.right+'`':o.what==='collect'?'a value of type `'+o.type+'` cannot be built from an iterator over elements of type `'+o.item+'`':o.what==='sum'?'a value of type `'+o.type+'` cannot be made by '+(o.op==='product'?'multiplying':'summing')+' an iterator over elements of type `'+o.item+'`':o.what==='try-ret'?'the `?` operator can only be used in a function that returns `Result` or `Option` (or another type that implements `FromResidual`)':o.what==='try-kind'?'the `?` operator can only be used on `'+(o.from==='Option'?'Result`s, not `Option`s':'Option`s, not `Result`s')+', in a function that returns `'+(o.from==='Option'?'Result':'Option')+'`':o.what==='try-convert'?'`?` couldn\'t convert the error to `'+o.to+'`':o.what==='bound'?BOUND(o):o.trait==='Ord'?'the trait bound `'+o.type+': Ord` is not satisfied':o.trait==='PartialEq'?'can\'t compare `'+o.type+'` with `'+o.type+'`':'`'+o.type+'` doesn\'t implement '+(o.debug?'`Debug`':'`std::fmt::Display`'),
    tipFor:o=>o.what==='fn'?'The function asks for something it can call. Pass a closure like `|x| x + 1`, or a value of a type that has the bound.':o.what==='cmp'?'`==` and the other comparisons need the same number of `&` on both sides. A closure for `filter` receives a reference to each item, which is a reference to a reference for `iter()`: write `**x`, or `*x == &2`, to compare with a plain number.':o.what==='collect'?'`collect` builds the type you ask for out of the items the iterator gives. A `Vec<i32>` needs `i32` items, and `iter()` gives `&i32`, so add `.copied()` or `.cloned()` before `collect`, or `map(|x| *x)`.':o.what==='sum'?'`sum` gives back the same number type as the items. Convert the items first, or ask for the type the items have.':o.what==='bound'?'A bound such as `T: '+o.trait+'` is a promise the caller keeps: the type you pass in has to have an `impl '+o.trait+' for '+o.type+'`'+(o.trait==='Display'||o.trait==='Debug'||o.trait==='Clone'||o.trait==='PartialEq'||o.trait==='PartialOrd'?' (or a derive, where the trait can be derived)':'')+'. Add the impl, or pass a type that has it.':o.what==='try-convert'?'`?` hands the error to the caller as the error type that the function returns. Nothing turns the error of the call into the error of the function here, so write an `impl From<...>` for it, or make the two error types the same.':o.what&&o.what.startsWith('try-')?'`?` hands an `Err` (or a `None`) back to the caller, so the function must return a `Result` for a `Result` and an `Option` for an `Option`. Change its return type and end the happy path with `Ok(...)` or `Some(...)`.':'',
    tip:'`{}` needs the type to know how to show itself, and your own types do not: print with `{:?}` after adding `#[derive(Debug)]` above the type, or print its fields one by one. `contains` needs `PartialEq`, and `sort` needs `Ord`, which a decimal number never has because of `NaN`: derive them above the type, or compare and sort by a field.'
  },
  E0369:{
    title:'two values of this type cannot be compared',
    msg:o=>ARITH_WORD[o.op]?'cannot '+ARITH_WORD[o.op][0]+' `'+o.type+'` '+ARITH_WORD[o.op][1]+' `'+o.type+'`':'binary operation `'+o.op+'` cannot be applied to type `'+o.type+'`',
    tipFor:o=>o.param?'A type parameter only has what its bounds give it. Add `'+o.type+': '+(o.op==='=='||o.op==='!='?'PartialEq':ARITH_WORD[o.op]?'std::ops::Add':'PartialOrd')+'` to the bounds, or compare something the bounds already allow.':'',
    tip:'`==` needs the type to say what equal means. Add `#[derive(PartialEq)]` above the type, or compare the fields one by one.'
  },
  E0594:{
    title:'a field is assigned, but it cannot change',
    msg:o=>o.closure?'cannot assign to `'+o.name+'`, as it is a captured variable in a `'+o.closure+'` closure':o.plain?'cannot assign to `'+o.name+'`, as it is not declared as mutable':o.ref?'cannot assign to `'+o.name+'`, which is behind a `&` reference':'cannot assign to `'+o.name+'`, as `'+o.root+'` is not declared as mutable',
    tip:'Changing a field changes the value that holds it, so that value has to be `mut`. Write `let mut` for the variable, or take a `&mut` parameter instead of a `&` one.'
  },
  E0507:{
    title:'a value moves out of a place that keeps it',
    msg:o=>o.closure?'cannot move out of `'+o.name+'`, a captured variable in an `'+o.closure+'` closure':o.index?'cannot move out of index of `'+o.type+'`':'cannot move out of `'+o.name+'`'+(o.variant?' as enum variant `'+o.variant+'`':'')+' which is behind a '+(o.mut?'mutable':'shared')+' reference',
    tip:'A reference only lends the value, and a `Vec` keeps its elements, so neither lets you take one away. Copy it with `.clone()`, borrow it with `&`, or take the whole value by value in the signature.'
  },
  E0609:{
    title:'a value has no such field',
    msg:o=>'no field `'+o.name+'` on type `'+o.type+'`',
    tip:'Check the spelling against the fields in the type\'s definition. A tuple\'s fields are numbered from 0.'
  },
  E0599:{
    title:'no such method or item',
    msg:o=>o.what==='bounds'?'the method `'+o.name+'` exists for '+(o.kind||'struct')+' `'+o.type+'`, but its trait bounds were not satisfied':o.what==='method'?'no method named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope':'no '+(o.kind==='enum'?'variant, associated function, or constant':'associated function or constant')+' named `'+o.name+'` found for '+o.kind+' `'+o.type+'` in the current scope',
    tipFor:o=>o.kind==='type parameter'?'Inside a generic function the type is only known by its bounds, so `'+o.name+'` has to come from a trait named in them. Add the trait that has `'+o.name+'`, as in `'+o.type+': TraitName`.':o.kind!=='enum'&&o.what==='method'&&o.trait?'`'+o.name+'` belongs to the trait `'+o.trait+'`, and `'+o.type+'` has no `impl '+o.trait+' for '+o.type+'`. Add that impl.':'',
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
    msg:o=>o.closure?'cannot borrow `'+o.name+'` as mutable, as it is a captured variable in a `'+o.closure+'` closure':o.ref?'cannot borrow `'+o.name+'` as mutable, as it is behind a `&` reference':'cannot borrow `'+o.name+'` as mutable, as '+(o.root?'`'+o.root+'`':'it')+' is not declared as mutable',
    tip:'Changing a value through a borrow needs the right to change it. Write `let mut` for the variable, or take a `&mut` parameter instead of a `&` one.'
  },
  E0282:{
    title:'a type is needed here',
    msg:()=>'type annotations needed',
    tip:'Rust works out a type from how a value is used, but a closure parameter that is used before anything fixes its type, like `|s| s.len()`, has none yet. Write it: `|s: &str| s.len()`.'
  },
  E0283:{
    title:'a type is needed here',
    msg:()=>'type annotations needed',
    tip:'`collect`, `sum` and `product` can build several types, so Rust cannot guess which one you want. Name it on the variable, like `let v: Vec<i32> = ...`, or on the call, like `.collect::<Vec<i32>>()`.'
  },
  E0525:{
    title:'a closure is not the kind the function asks for',
    msg:o=>'expected a closure that implements the `'+o.want+'` trait, but this closure only implements `'+o.has+'`',
    tip:'A closure that changes a captured variable is `FnMut`, and one that moves a captured value out is `FnOnce`. A function that asks for `Fn` or `FnMut` may call the closure many times, so it needs a closure that can be called again: change the bound to the kind the closure is, or stop the closure from changing or moving what it captured.'
  },
  E0593:{
    title:'a closure takes the wrong number of arguments',
    msg:o=>'closure is expected to take '+o.want+' argument'+(o.want===1?'':'s')+', but it takes '+o.got+' argument'+(o.got===1?'':'s'),
    tip:'The function that receives the closure decides what it is called with. Write one parameter for each value it passes, like `|a, b|` for two.'
  },
  E0631:{
    title:'a closure parameter has the wrong type',
    msg:()=>'type mismatch in closure arguments',
    tip:'The closure is called with values of one type, and the type you wrote for a parameter is a different one. Remove the annotation, or write the type the function passes.'
  },
  E0057:{
    title:'a closure is called with the wrong number of arguments',
    msg:o=>'this function takes '+o.want+' argument'+(o.want===1?'':'s')+' but '+o.got+' argument'+(o.got===1?' was':'s were')+' supplied',
    tip:'Call the closure with one value for each parameter between its `|` bars.'
  },
  E0618:{
    title:'a value that is not a function is called',
    msg:o=>'expected function, found `'+o.type+'`',
    tip:'Only a function or a closure can be followed by `( ... )`. Check the name: it may be a variable that holds a plain value.'
  },
  E0373:{
    title:'a closure outlives what it borrows',
    msg:o=>'closure may outlive the current function, but it borrows `'+o.name+'`, which is owned by the current function',
    tip:'A closure that only borrows a local variable cannot leave the function that owns the variable. Write `move` before the bars, like `move || x + 1`, so the closure takes its own copy or owns the value.'
  },
  E0597:{
    title:'a borrowed value goes out of scope too soon',
    msg:o=>'`'+o.name+'` does not live long enough',
    tip:'A variable disappears at the end of the block that declares it, and a borrow of it cannot outlast that. Declare the variable in the outer block, or use the borrow before the block ends.'
  },
  E0261:{
    title:'a lifetime name was never declared',
    msg:o=>'use of undeclared lifetime name `\''+o.name+'`',
    tip:'A lifetime name has to be declared before it is used, in angle brackets after the name: `fn longest<\'a>(...)`, `struct Excerpt<\'a>` or `impl<\'a> Excerpt<\'a>`.'
  },
  E0621:{
    title:'a parameter needs a lifetime name to be returned',
    msg:o=>'explicit lifetime required in the type of `'+o.name+'`',
    tip:'The function promises to return data that lives as long as a named lifetime, but this parameter was written without it, so Rust cannot promise that. Give the parameter the same lifetime name, like `y: &\'a str`.'
  },
  E0392:{
    title:'a generic parameter is declared but never used',
    msg:o=>o.ty?'type parameter `'+o.name+'` is never used':'lifetime parameter `\''+o.name+'` is never used',
    tipFor:o=>o.ty?'A generic type has to use each parameter, like `value: '+o.name+'`. If nothing uses it, remove it from the angle brackets.':'',
    tip:'A `struct` that declares a lifetime has to use it on a field, like `text: &\'a str`. If nothing in the `struct` borrows, remove the lifetime.'
  },
  E0726:{
    title:'an `impl` for a struct with a lifetime leaves it out',
    msg:()=>'implicit elided lifetime not allowed here',
    tip:'A `struct` with a lifetime parameter needs it written in its `impl`: declare it with `impl<\'a> Name<\'a>`, or write `impl Name<\'_>` when the body never names it.'
  },
  E0106:{
    title:'a returned reference has no lifetime to borrow from',
    msg:()=>'missing lifetime specifier',
    tipFor:o=>o.field?'A `struct` that holds a reference has to say how long the reference must stay valid. Declare a lifetime on the struct, `struct Excerpt<\'a>`, and use it on the field: `part: &\'a str`.':'',
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
  struct:'A `struct` is modeled with named, tuple or unit fields. Its generics are one lifetime name (`struct Name<\'a>`, whose fields may hold a `&\'a T`) or plain type names (`struct Name<T>`) with no bounds, no defaults and no reference fields. A field cannot be a `&mut` or a `&&`, and the name cannot be one of a built-in type. A tuple or unit `struct` cannot share its name with a `fn` or a `const`.',
  enum:'An `enum` is modeled with at least one variant, written as `Name`, `Name(T)` or `Name { field: T }`. It may have plain type names (`enum Name<T>`) with no bounds or defaults, but no lifetime name, no reference in a variant and no `= value` numbers on the variants.',
  derive:'Only `#[derive(...)]` of `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `PartialOrd`, `Ord`, `Default` and `Hash` is modeled. Every field must have the trait too. `Copy` needs `Clone`, `Eq` and `PartialOrd` need `PartialEq`, and `Ord` needs `PartialOrd` and `Eq`. An `enum` derives `Default` from the one unit variant marked `#[default]`.',
  'match guard':'A `match` guard that moves a name its arm binds, like `Some(s) if eat(s)` (rustc reports `E0507`), or assigns to or borrows mutably part of the value being matched (`E0506`, `E0502`), is not modeled. Make the guard only read.',
  impl:'Modeled: `impl Name { ... }`, `impl Trait for Name` for your own traits, and the std traits `Display`, `Drop` and `From`. Writing `impl Iterator for Name`, `impl Debug` or `impl Clone` by hand is not modeled: derive what can be derived, or give the type a method that returns a `Vec`.',trait:'A `trait` is modeled with plain methods, with or without a default body. A supertrait (`trait A: B`), a generic trait, an associated type or constant, an attribute and a method declared twice are not modeled. Write a trait of methods, and use a generic function with a bound for the rest.',static:'`static` items are not modeled. Use a `const`, which the quest does model.',
  'type alias':'A `type` alias is not modeled. Write the full type each time, or give it a name with a `struct`.',use:'The only `use` modeled is `use std::collections::HashMap;` once at the top of the file. The missions otherwise use what Rust gives every program.',mod:'Modules are not modeled. Put every `fn`, `struct`, `enum` and `trait` at the top of the file.',generics:'Modeled: type names with bounds, like `<T: Trait>`, and lifetime names. A type name that reuses the name of a type, a default like `T = i32` and `const` generics are not.',
  method:'A method takes `self`, `&self` or `&mut self` as its first parameter. A receiver with a type written out, like `self: Box<Self>`, is not modeled.','nested item':'Put `fn` and `const` items at the top of the file, outside `main`.',closure:'This use of a closure is not modeled. Bind it with `let f = |x| x + 1;` or pass it straight to a function or an iterator method.',
  match:'A `match` on a `&mut` reference is not modeled. Match on the value itself, or on a `&` reference.',
  'method call':'This method is not modeled on this type. Modeled: the methods you write in an `impl` or a `trait`; `clone` on a type that derives `Clone`; `len`, `clone`, `to_string`, `to_owned`, `as_str` and `push_str` on text; `is_some`, `is_none`, `is_ok`, `is_err`, `unwrap`, `expect`, `unwrap_or`, `unwrap_or_default`, `ok_or`, `ok`, `err`, `copied` and `cloned` on `Option` and `Result`; the methods named by the `collection method` and `iterator` hints. Numbers have no methods here: use an operator, or `as` to change the type.','field access':'Only the numbered fields of a tuple, like `t.0`, and the fields of your own `struct` are modeled. An `enum` has no fields: use a `match`. For anything else, call a method.',
  'field of a temporary':'Reading a field of a value that is not in a variable, like `make().id`, is not modeled. Put the value in a variable first.',slice:'A bare slice type `[T]` has no size, so it only appears behind a `&`, as `&[T]`.',
  'slice of non-ASCII text':'Slicing text with accented letters, emoji or other non-English characters is not modeled, because one letter can take several bytes. Use plain English letters, which take one byte each.',
  reference:'Only `&T` and `&mut T` on a `String` or a number are modeled, `&str` for text, and `&[T]` for a slice. Use one of those, or pass the value itself.',
  dereference:'`*` works on a reference, like `*r` where `r` is a `&i32` or `&mut i32`. This value is not a reference.',
  'explicit lifetime':'Lifetime names are modeled only as `&\'a T` (not `&\'a mut T`) on a `fn` or a `struct` field, with one lifetime in the result, and a method result tied to a lifetime of the `impl` is not modeled. Write `&T` and let Rust work the lifetime out, or return `&\'static str` from a `fn` for a string literal. `&\'static str` is modeled only as the return type of a `fn`.',
  'lifetime elision':'A function that returns a reference is modeled only as `-> &T` with exactly one `&` (not `&mut`) parameter, or `&self`, and no lifetime names on the parameters. Otherwise name the lifetime, like `-> &\'a T`, or return an owned value, like a `String`.',
  'lifetime mismatch':'This function returns data from a parameter whose lifetime is not the one the result promises. Rust stops it with an error that has no code (`lifetime may not live long enough`), which the quest does not model. Give that parameter the result\'s lifetime, or return something else.',
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
  cast:'This kind of `as` conversion is not modeled. Convert between numbers, or turn a `bool` or a `char` into a number.','try operator':'`?` is modeled on a `Result` or an `Option` that holds no reference, in a function that returns the same kind. Match on the value or use `unwrap` for anything else.','error conversion':'`?` here would have to turn one error type into another, and Rust Quest does not model that conversion. Write an `impl From<...>` for your own error type, or make both error types the same.','struct literal':'Write every field of the `struct` exactly once, as `Name { field: value, ... }`, with no `..` base.','qualified path':'A qualified path like `<T as Trait>::name` is not modeled. Call the method on a value, as `x.name()`, or on the type, as `Type::name(x)`.',
  'fn pointer':'A function pointer type like `fn(i32) -> i32` is not modeled. Take a closure instead, as `f: impl Fn(i32) -> i32` or `<F: Fn(i32) -> i32>`.','impl Trait':'`impl Trait` is modeled for an argument, like `x: &impl Speak` or `f: impl Fn(i32) -> i32`, and for a returned closure, like `-> impl Fn(i32) -> i32`. A returned `impl Iterator` or any other `impl Trait` is not modeled: return a `Vec` instead.','inferred type':'Write the type out, like `let x: Option<i32> = None;`. Rust Quest does not infer a type behind `_`, or for a `None` that nothing else gives a type.',
  pattern:'Modeled patterns: a name or `_`, literals, ranges like `1..=5`, `|` between patterns that bind nothing, tuples, `struct` and `enum` variants (`Shape::Rect { w, h }`, `Some(n)`), and `n @ 1..=5`. Not modeled: `ref`, `&` patterns, slices, constants, floats, a `&` met inside a tuple or `struct`, a wrong field list, and a name that repeats.',
  'deferred initialization':'Give the variable its value right in the `let`, like `let x = 5;`. To set it later, write its type: `let x: i32;`.',
  'format spec':'Only `{}`, `{:?}`, `{:#?}`, `{:.N}` on a decimal number and `{:>N}` are modeled. Print the value with one of those.',
  'assignment target':'Assign to a variable, a field, or an element of a `Vec` you own or hold by `&mut`, like `v[0] = 1`.',
  'assigned string reference':'Assigning a `&String` to a `&str` place is not modeled. Write `&b[..]` or `b.as_str()` instead of `&b`.',
  'type checking':'Rust Quest cannot tell whether these types fit together, so it gives no verdict. Keep each value to one type, change a number\'s type with `as`, and write the type on a `let` that is unclear.',
  'const initializer':'A `const` can only hold a literal, or simple maths on other constants. For anything else, use a `let` in `main`, or a function that gives the value back.',
  'integer overflow':'Dividing the smallest number of a type by `-1` overflows. Rust Quest does not model that case; use another divisor.',
  'const folding':'Rust Quest cannot tell whether the compiler would catch this overflow before the program runs. Pass the value in as a function parameter, or use numbers that cannot overflow.',
  'range expression':'A range like `0..5` is modeled right after `for ... in`, inside `&text[0..5]` to take a slice, and as the start of an iterator chain like `(0..5).map(...)`. Put the range in parentheses to call a method on it.',
  'closure kind':'A parameter that is itself an `Fn`, `FnMut` or `FnOnce` value can only be passed on to a bound of the same kind or a weaker one. Pass a closure instead.',
  'closure bound':'A closure passed where `Clone` is required is not modeled. Pass a closure that captures nothing as a `fn` item, or drop the `Clone` bound.',
  'zip with a side effect on its longer side':'Rust decides whether `zip` pulls one more item from its longer side by how the iterators are built, and Rust Quest does not model that when a closure would run. Keep the closures out of the longer side, or make both sides the same length.',
  'closure returning a reference':'A closure that gives back a reference, or a bound like `Fn(&str) -> &str`, is not modeled, because the lifetime of the result would have to be worked out. Return an owned value, like a number or a `String`.',
  'closure capture of a field':'A closure that moves or changes a field of a `struct` it captures is not modeled. Capture the whole variable, or copy the field into a variable first.',
  'closure capture of a mutable reference':'A closure that uses a `&mut` variable is not modeled. Change the value through a plain variable, or call the function that takes the `&mut` directly.',
  'closure that owns a value with Drop':'A closure that moves a value that implements `Drop` into itself is not modeled.',
  'iterator over values with Drop':'Iterating over owned values that implement `Drop` is not modeled. Loop over references with `.iter()` instead.',
  'sort_by_key with side effects':'`sort_by_key` is modeled for a key closure that only reads its argument, because the sort calls it a number of times that Rust decides. Print and count outside the closure.',
  'iterator sum overflow':'An overflow inside `sum` or `product` panics inside the standard library, with a message Rust Quest does not model. Use numbers that cannot overflow.',
  'for iterable':'`for` loops over a range like `0..5`, over a `Vec` or `HashMap`, over `&v`, `&mut v`, `v.iter()`, `m.keys()` and the like, and over any iterator built from them, like `v.iter().enumerate()`. An array or a slice with `&` in front is not modeled: loop over a `Vec`, or call `.iter()`.',
  'let condition':'A `let` inside an `if` or `while` condition next to other tests, like `if x > 0 && let Some(n) = o`, is not modeled. Use `if let` or `while let` on its own, and put the other test inside the block.',
  nesting:'Code nested this deeply, in a pattern, an expression or a type, is not modeled. Split it into smaller pieces.',
  'array length':'Write the array length as a plain number, like `[i32; 3]`, no bigger than 10000.',
  'break outside loop':'`break` and `continue` only work inside a loop.',
  'main signature':'`main` takes no parameters and returns nothing, or `Result<(), E>` where `E` can be printed with `{:?}`. Write `fn main() { ... }` or `fn main() -> Result<(), String> { ... }`.',
  'path call':'Only `Name::function` for a function in your own `impl Name { ... }`, an `enum` variant, `Name::default()` for a type that derives `Default`, `String::new`, `String::from`, `Vec::new` and `HashMap::new` are modeled.',
  'function value':'Using a function as a value is not modeled. Call it with `name(...)`, or wrap it in a closure like `|x| name(x)`.',
  'bit shift':'Shifts are not modeled. Multiply or divide instead.',
  'block label':'A labeled loop or block, like `\'outer: loop`, is not modeled. Use a variable that says when to stop, or `return` from a function.',
  call:'A call is modeled on one of your own functions, like `name(1, 2)`, and on a closure or an `Fn` parameter in a variable. Anything else is not modeled: write a function, or put the closure in a variable first.',
  'wrong argument count':'Rust stops a call with the wrong number of arguments, but Rust Quest does not report it. Pass exactly what the function declares.',
  String:'Only a plain `String` is modeled, with no type arguments or path in front. Build one with `String::from("hi")` or `String::new()`.',
  Vec:'Write `Vec<T>` with its element type, like `Vec<i32>`, and build one with `Vec::new()` or `vec![1, 2, 3]`. The elements cannot be references.',
  HashMap:'Add `use std::collections::HashMap;` at the top, then write `HashMap<K, V>` with both types, like `HashMap<String, i32>`, and build one with `HashMap::new()`.',
  'map index':'Indexing a `HashMap` with `m[&key]` is not modeled: a missing key panics inside the standard library. Use `m.get(&key)`, which gives an `Option`, and match on it.',
  'collection method':'Modeled on a `Vec`: `push`, `pop`, `len`, `is_empty`, `insert`, `remove`, `clear`, `truncate`, `swap`, `reverse`, `sort`, `contains`, `get`, `get_mut`, `first`, `last`, `extend` and `clone`. On a `HashMap`: `insert`, `get`, `get_mut`, `contains_key`, `remove`, `extend`, `len`, `is_empty`, `clear`, `clone` and `entry(k).or_insert(v)`, plus the closure methods `retain`, `sort_by_key` and `entry(k).or_insert_with(f)`, and iterators with `iter()`.',
  iterator:'Modeled iterators come from a `Vec`, an array, a slice, a `HashMap`, a range or `chars()`. Adapters: `map`, `filter`, `enumerate`, `zip`, `rev`, `take`, `skip`, `take_while`, `skip_while`, `copied` and `cloned`. Consumers: `sum`, `product`, `count`, `collect`, `fold`, `any`, `all`, `find`, `position`, `min`, `max`, `last`, `for_each` and `next`. `rev` works on a plain source, `map`, `filter`, `copied`, `cloned` and `enumerate`. Write the loop by hand for anything else, or use one of those.',
  'hash key':'A `HashMap` key must be `Eq` and `Hash`, and Rust Quest could not tell whether this key is. Write the map\'s type out, like `let mut m: HashMap<String, i32> = HashMap::new();`.',
  'reference in collection':'A `Vec` or `HashMap` that holds a reference, like `Vec<&str>` or `v.push(&x)`, is not modeled. Keep owned values in it, like `String`.',
  Option:'Write `Option<T>` with its type argument, like `Option<i32>`, and build it with `Some(x)` or `None`.',Result:'Write `Result<T, E>` with both type arguments, like `Result<i32, String>`, and build it with `Ok(x)` or `Err(e)`.',Box:'`Box` is not modeled. Keep the value itself, borrow it with `&`, or use a `Vec` for a growing collection.',
  str:'A bare `str` has no size, so it only appears behind a `&`. Write `&str` for text you read and `String` for text you own.',
  'panic!':'`panic!` is not modeled. Print a message with `println!`, or give the error back in a `Result`.',
  'assert!':'`assert!` is not modeled. Print the value with `println!` and look at it.',
  'assert_eq!':'`assert_eq!` is not modeled. Print both values with `println!` and compare them by eye.',
  'assert_ne!':'`assert_ne!` is not modeled. Print both values with `println!`.',
  'debug_assert!':'`debug_assert!` is not modeled. Print the value with `println!`.',
  'debug_assert_eq!':'`debug_assert_eq!` is not modeled. Print both values with `println!`.',
  'vec!':'Write `vec![1, 2, 3]`, `vec![0; 5]` or `vec![]` with a type given by the `let`.',
  'write!':'`write!` is not modeled. Use `println!` to print.',
  'writeln!':'`writeln!` is not modeled. Use `println!` to print.',
  'todo!':'`todo!` is not modeled. Write the real body, or give back a plain value.',
  'unimplemented!':'`unimplemented!` is not modeled. Write the real body, or give back a plain value.',
  'unreachable!':'`unreachable!` is not modeled. Write the real body, or give back a plain value.'
};
const DEFAULT_HINT='Rust Quest does not model this.';

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
