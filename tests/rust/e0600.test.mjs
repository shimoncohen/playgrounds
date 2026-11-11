import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();

describe('E0600 for a negated unsigned operand', () => {
  it('E0600 is for a literal an annotated let or a cast types, one error per minus on an unsigned operand', () => {
    const state = (src) => { const c = RQ.run(src); return c.status === 'error' ? [...c.errors].map((e) => e.code).join() : c.status; };
    assert.equal(state("fn main() {\n    let x = 5;\n    let y: u32 = -x;\n    println!(\"{}\", y);\n}\n"), 'unsupported', 'n1');
    assert.equal(state("fn main() {\n    let x = 3;\n    let z: u8 = -x;\n    println!(\"{}\", z);\n}\n"), 'unsupported', 'n2');
    assert.equal(state("fn main() {\n    let y: u32 = -(1 + 2);\n    println!(\"{}\", y);\n}\n"), 'unsupported', 'n3');
    assert.equal(state("fn main() {\n    let y: u32 = - -1;\n    println!(\"{}\", y);\n}\n"), 'unsupported', 'n9');
    assert.equal(state("fn main() {\n    let x = 5;\n    let y = -x as u32;\n    println!(\"{}\", y);\n}\n"), "ok", 'n4');
    assert.equal(state("fn main() {\n    let y: u32 = -1;\n    println!(\"{}\", y);\n}\n"), "E0600", 'n7');
    assert.equal(state("fn main() {\n    let y: u32 = -(1);\n    println!(\"{}\", y);\n}\n"), "E0600", 'n8');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = - - y;\n    println!(\"{}\", z);\n}\n"), "E0600,E0600", 'n5');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = -(-y);\n    println!(\"{}\", z);\n}\n"), "E0600,E0600", 'n6');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = - - -y;\n    println!(\"{}\", z);\n}\n"), "E0600,E0600,E0600", 'n10');
  });
});
