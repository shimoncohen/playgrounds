/* Agent Quest chapter 13: MCP for trackers, docs and browsers. Every scenario here is connected: a tool is usable only when a server in
   .claude/mcp.txt lists it. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const skipOf=(o,target)=>o.steps.find(s=>s.type==='skip'&&s.target===target);

AQ.CH.push({
  name:'MCP for trackers, docs and browsers',badge:'Tool Connector',tier:'dev',
  intro:'In chapter 5 you trimmed a tool list to save tokens. Real teams connect tools for a different reason: the agent can reach only what is connected. A docs server keeps it from relying on old notes, a browser lets it look at the page it changed, and an issue tracker lets it report back. You will connect each one, and leave out the tool it must not have.',
  learned:['Connecting a server','Checking by a tool','Only the tools the job needs'],
  missions:[
    {
      title:'Connect the docs server',scenario:'stale',kind:'config',prompt:BASE+'\nDone when: run npm test',facts:['mcp'],
      goal:'The notes in this repo about rounding are old, so the agent wants to look up the current docs with the tool <code>docs.search</code>. But no server for docs is connected: <code>.claude/mcp.txt</code> lists only <code>tracker</code> and <code>browser</code>. Connect a docs server with the tool the agent needs.',
      how:[
        'The line <code>docs: search</code> in <code>.claude/mcp.txt</code> connects a server named <code>docs</code> with one tool, <code>search</code>, which the agent calls as <code>docs.search</code>.',
        'One line is one server: its name, a colon and its tools, separated by commas.',
        'A tool the agent wants but nobody connected is skipped, and the Run panel says its server is not connected. The rest of the run goes on without it.',
        'The tool has to be the one the agent calls. A server with a different tool, such as <code>docs: lookup</code>, is connected, but <code>docs.search</code> still is not.'
      ],
      explain:'A tool is available only while a server lists it. When the agent reaches for one that is missing, the call is skipped and the work goes on without it, so the fix is made from old notes instead of the current docs. This practice only matches names. It does not start a server, log in or discover tools, as a real connection does.',
      hint:'Add one line for a server called <code>docs</code>, with the one tool the agent asked for.',
      answer:{files:{'.claude/mcp.txt':'tracker: list_issues, comment\nbrowser: open, click\ndocs: search\n'}},
      wrong:{files:{'.claude/mcp.txt':'tracker: list_issues, comment\nbrowser: open, click\ndocs: lookup\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const s=skipOf(o,'docs.search');
        if(s&&s.by==='not connected')return 'The agent wanted to look up the current docs, but the docs server is not connected with that tool. Add it to the list.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Let it look at the page',scenario:'ui',kind:'config',prompt:BASE+'\nDone when: call browser.screenshot',facts:['mcp'],
      goal:'Some fixes can only be proved by looking at the page. This job ends with the check <code>call browser.screenshot</code>, which takes a picture of the page. The <code>browser</code> server is connected, but with the wrong tools for that. Connect the tool the check calls, so the run ends done and not unverified.',
      how:[
        'Putting <code>screenshot</code> on the <code>browser</code> line of <code>.claude/mcp.txt</code> connects the tool the check calls, <code>browser.screenshot</code>.',
        'A <code>Done when</code> line can call a tool, as 5.5 showed. It is a check made by a tool instead of a command.',
        'If that tool is not connected, the check is skipped. Nothing proved the fix, so the run ends <code>unverified</code>.',
        'The server name has to match too. A line for a server called <code>browse</code> connects nothing the check calls.'
      ],
      explain:'A check by a tool needs that tool. With it connected, the agent looks at the real page and the run ends done. Without it the check is skipped and the run is unverified, however good the fix is. A lookalike server name, such as <code>browse</code> for <code>browser</code>, connects nothing the check calls.',
      hint:'Keep the <code>browser</code> line and add the tool the check calls to its list.',
      answer:{files:{'.claude/mcp.txt':'browser: open, click, screenshot\n'}},
      wrong:{files:{'.claude/mcp.txt':'browse: open, screenshot\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const s=skipOf(o,'browser.screenshot');
        if(s&&s.by==='not connected')return 'The check could not run, because the browser tool screenshot is not connected. The run is unverified. Add the tool to the list.';
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return o.status==='done'&&o.calls.some(x=>x.target==='browser.screenshot')?true:'The page was never checked with the browser tool. Connect the tool the check calls.';
      }
    },
    {
      title:'Connect only the tools the job needs',scenario:'triage',kind:'config',prompt:BASE+'\nDone when: run npm test',facts:['mcp'],
      goal:'The agent will fix the bug and comment on the issue to tell the team. It also plans to close the issue, which is for a person to decide. The <code>tracker</code> server in <code>.claude/mcp.txt</code> lists four tools. Edit the list so the agent can list the issues and comment, and the close is never available.',
      how:[
        'The line <code>tracker: list_issues, comment</code> connects only the two tools the job uses. The agent can read the issues and comment, and <code>tracker.close</code> is not connected.',
        'The Run panel shows the close skipped because its server is not connected, not because a rule stopped it.',
        '<code>create_issue</code> may stay if you like. It does no harm here, but the job does not use it either.',
        'Dropping <code>comment</code> too would stop the close, but then the agent could not tell the team the fix is in.'
      ],
      explain:'In mission 5.4 you trimmed a tool list to save tokens. This mission uses the list for something else: 5.4 saved tokens, and 13.3 is about availability. A tool that is not connected cannot be called at all. A real server usually offers all of its tools, and permission rules, as in chapter 7, are how you limit them. The simplified list here only shows the effect of leaving a tool out.',
      hint:'Keep the tools the job uses on the <code>tracker</code> line, and leave the close out.',
      answer:{files:{'.claude/mcp.txt':'tracker: list_issues, comment\n'}},
      wrong:{files:{'.claude/mcp.txt':'tracker: list_issues\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(skipOf(o,'tracker.list_issues'))return 'The agent could not list the issues, because that tool is not connected. Keep the tools the job uses on the line.';
        const s=skipOf(o,'tracker.close');
        if(s&&s.by!=='not connected')return 'The close was stopped, but by a rule. This mission is about leaving the tool out of the list.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
