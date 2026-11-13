import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';

const scn = { ...scenario, tools: [], hidden: [], script: [{ verb: 'call', target: 'tracker.close' }] };
const MCP = (text) => ({ '.claude/mcp.txt': text });
const errs = (o) => o.prompt.errors.map((e) => e.msg).join('\n');

describe('.claude/mcp.txt is the only source of MCP tools', () => {
  it('a tool removed from the list cannot be called, and a send is skipped like a call', () => {
    for (const verb of ['call', 'send']) {
      const o = run('Goal: x', { scn: { ...scn, script: [{ verb, target: 'tracker.close' }] }, files: MCP('tracker: open') }).outcome;
      assert.ok(o.steps.some((s) => s.type === 'skip' && s.by === 'not connected'), verb);
      assert.equal(o.calls.length, 0, verb);
    }
  });
  it('a tool removed from the list is refused in a rule, in Done when and in Use', () => {
    const files = MCP('tracker: open');
    for (const line of ['Constraints: do not call tracker.close', 'Done when: call tracker.close', 'Use: tracker.close']) assert.notEqual(run(line, { scn, files }).prompt.errors.length, 0, line);
  });
  it('a tool added to the list resolves in Constraints, Done when and Use', () => {
    const files = MCP('tracker: open, close');
    for (const line of ['Constraints: do not call tracker.close', 'Constraints: do not send tracker', 'Done when: call tracker.close', 'Use: tracker.close']) assert.equal(errs(run(line, { scn, files })), '', line);
  });
  it('a standing rule in CLAUDE.md follows the same list', () => {
    const rule = (mcp) => run('Goal: x', { scn, files: { 'CLAUDE.md': 'do not call tracker.close', ...MCP(mcp) } }).outcome;
    assert.ok(rule('tracker: close').steps.some((s) => s.type === 'skip' && s.by === 'CLAUDE.md'));
    assert.ok(!rule('tracker: open').steps.some((s) => s.by === 'CLAUDE.md'));
  });
  it('a tool the mission prompt itself names resolves unlisted, and the run skips it as not connected', () => {
    const o = run('Done when: call tracker.close', { scn, allow: new Set(['tracker.close']) });
    assert.equal(errs(o), '');
    assert.ok(o.outcome.steps.some((x) => x.type === 'skip' && x.tag === 'verify' && x.by === 'not connected'));
  });
  it('a scenario tool that no server provides still resolves', () => {
    const own = { ...scn, tools: ['web.search'], script: [{ verb: 'call', target: 'web.search' }] };
    const o = run('Done when: call web.search', { scn: own });
    assert.equal(errs(o), '');
    assert.ok(o.outcome.calls.every((c) => c.target === 'web.search') && o.outcome.calls.length > 0);
  });
});

describe('shipped scenarios take their tools from mcp.txt', () => {
  it('no scenario lists a tool, and every call or send in a script is listed in its own mcp.txt unless the mission teaches leaving it out', () => {
    for (const [k, s] of Object.entries(AQ.scenarios)) {
      assert.equal((s.tools || []).length, 0, k);
      assert.equal(s.connected, undefined, k);
    }
    for (const k of ['calendar', 'vendor', 'audit', 'remind', 'quiet', 'clipping']) {
      const sc = AQ.scenarios[k];
      if (!sc) continue;
      const listed = AQ.config.parseSetup(AQ.vfs.create(sc.vfs)).mcp.flatMap((m) => m.tools.map((t) => `${m.name}.${t}`));
      for (const a of sc.script.filter((x) => x.verb === 'call' || x.verb === 'send')) assert.ok(listed.includes(a.target), `${k}: ${a.target}`);
    }
  });
});

describe('.claude/mcp.txt is editable only where the mission teaches it', () => {
  const missions = AQ.CH.flatMap((ch) => ch.missions);
  const ships = missions.filter((m) => '.claude/mcp.txt' in AQ.scenarios[m.scenario].vfs);
  const lever = (m) => AQ.canEdit(m, '.claude/mcp.txt');
  const mcpOf = (m, files) => JSON.parse(JSON.stringify(AQ.prepare(m, { prompt: '', files }).setup.mcp));
  const calendar = missions.find((m) => m.scenario === 'calendar');

  it('mission 5.5 is not passed by dropping mail.send from mcp.txt instead of banning it', () => {
    const r = AQ.evaluate(calendar, { prompt: 'Done when: call calendar.list', files: { '.claude/mcp.txt': 'calendar: list, create, delete\n' } }, { approved: true });
    assert.notEqual(r.result, true);
    assert.equal(mcpOf(calendar, { '.claude/mcp.txt': 'calendar: list\n' }).length, 2, 'the shipped list is kept');
  });
  it('the missions that ship mcp.txt without teaching it ignore an edit to it', () => {
    const shut = ships.filter((m) => !lever(m));
    assert.deepEqual(JSON.parse(JSON.stringify(shut.map((m) => m.scenario).sort())), ['audit', 'calendar', 'clipping', 'quiet', 'remind', 'vendor']);
    for (const m of shut) assert.deepEqual(mcpOf(m, { '.claude/mcp.txt': '' }), mcpOf(m, {}), m.title);
  });
  it('mcpTrim, whose answer edits it, and the other lever missions still can', () => {
    const trim = missions.find((m) => m.scenario === 'mcpTrim');
    assert.deepEqual(mcpOf(trim, { '.claude/mcp.txt': 'calendar: list\n' }), [{ name: 'calendar', tools: ['list'] }]);
    assert.equal(AQ.evaluate(trim, trim.answer).result, true);
    for (const m of ships.filter(lever)) assert.equal(AQ.evaluate(m, m.answer, { approved: true }).result, true, m.title);
  });
});

describe('a learner-typed Done when is not exempted by the mission prompt', () => {
  const fake = { scenario: 'ui', kind: 'prompt', fields: ['donewhen'], prompt: 'Done when: call browser.screenshot' };
  it('the fixed line resolves unlisted, a typed line for another unlisted tool is an error', () => {
    assert.equal(AQ.prepare(fake, '').prompt.errors.length, 0);
    const typed = AQ.prepare({ ...fake, prompt: '' }, 'Done when: call browser.screenshot');
    assert.match(typed.prompt.errors[0].msg, /not a tool the agent has/);
    assert.equal(AQ.prepare(fake, 'Constraints: do not call browser.scroll').prompt.errors.length, 1);
  });
});
