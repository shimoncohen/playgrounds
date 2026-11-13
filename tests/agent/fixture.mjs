import { loadAgent } from './harness.mjs';

export const AQ = loadAgent();
const BAD = 'bad';
export const scenario = {
  vfs: { 'CLAUDE.md': '', 'src/price.js': 'bug', 'src/tax.js': 'x', 'migrations/001.sql': 'old', 'docs/big.md': 'w'.repeat(6000) },
  commands: { 'npm test': (v) => (v.read('src/price.js') === 'fixed' ? { ok: true, out: 'pass' } : { ok: false, out: 'fail' }) },
  tools: ['mail.send'],
  script: [
    { verb: 'read', target: 'src/price.js' },
    { verb: 'edit', target: 'migrations/001.sql', write: 'new' },
    { verb: 'edit', target: 'src/price.js', needs: ['src/price.js'], write: BAD },
  ],
  correction: (v) => (v.read('src/price.js') === BAD ? { verb: 'edit', target: 'src/price.js', write: 'fixed' } : null),
  hidden: [{ verb: 'edit', target: 'migrations/' }],
  accept: (o) => o.vfs.read('src/price.js') === 'fixed' || 'price.js is not fixed',
};

export function run(promptText, { scn = scenario, files = {}, history, approved, allow } = {}) {
  const vfs = AQ.vfs.create({ ...scn.vfs, ...files });
  const setup = AQ.config.parseSetup(vfs);
  const prompt = AQ.config.parsePrompt(promptText, scn, setup, allow);
  return { setup, prompt, outcome: AQ.policy.run(scn, setup, prompt, { vfs, history, approved }) };
}
