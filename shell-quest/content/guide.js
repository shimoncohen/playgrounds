(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const GUIDE=[
 {c:'pwd',ch:0,what:'Print the full path of the folder you are in.',syn:[['pwd','cmd']],ex:[['pwd','prints /home/explorer']]},
 {c:'ls',ch:0,what:'List what is inside a folder. -a includes hidden files, -l shows details like permissions and size.',syn:[['ls','cmd'],['-a -l','opt'],['folder','arg']],ex:[['ls',''],['ls -a','include hidden files'],['ls -l forest','details for another folder']]},
 {c:'cd',ch:0,what:'Change directory: move into another folder.',syn:[['cd','cmd'],['folder','arg']],ex:[['cd forest','go in'],['cd ..','up one level'],['cd ~','home'],['cd -','back to the previous folder']]},
 {c:'cat',ch:0,what:'Print the contents of one or more files.',syn:[['cat','cmd'],['file','arg']],ex:[['cat readme.txt',''],['cat .secret_map','hidden files work too']]},
 {c:'mkdir',ch:1,what:'Make a new folder. -p also creates any missing folders along the path.',syn:[['mkdir','cmd'],['-p','opt'],['folder','arg']],ex:[['mkdir camp',''],['mkdir -p a/b/c','three levels at once']]},
 {c:'touch',ch:1,what:'Create an empty file, or update the time on one that exists.',syn:[['touch','cmd'],['file','arg']],ex:[['touch notes.txt','']]},
 {c:'echo',ch:1,what:'Print text. With > or >> it writes text into files.',syn:[['echo','cmd'],['text','arg']],ex:[['echo "hi there"',''],['echo $HOME','print a variable']]},
 {c:'> and >>',ch:1,what:'Redirect output into a file. > replaces the file\'s contents, >> adds to the end.',syn:[['command','cmd'],['>','op'],['file','arg']],ex:[['echo "first" > list.txt','create or replace'],['echo "second" >> list.txt','append']]},
 {c:'cp',ch:2,what:'Copy files. -r copies folders and everything inside them.',syn:[['cp','cmd'],['-r','opt'],['source','arg'],['destination','arg']],ex:[['cp readme.txt copy.txt',''],['cp -r forest forest_backup','copy a folder']]},
 {c:'mv',ch:2,what:'Move or rename files and folders.',syn:[['mv','cmd'],['source','arg'],['destination','arg']],ex:[['mv copy.txt notes.txt','rename'],['mv notes.txt village/','move into a folder']]},
 {c:'rm',ch:2,what:'Remove files for good. -r removes folders and everything in them. There is no undo.',syn:[['rm','cmd'],['-r','opt'],['target','arg']],ex:[['rm notes.txt',''],['rm -r forest_backup','a whole folder']]},
 {c:'rmdir',ch:2,what:'Remove an empty folder. Refuses if anything is inside.',syn:[['rmdir','cmd'],['folder','arg']],ex:[['rmdir camp/supplies','']]},
 {c:'head',ch:3,what:'Show the first lines of a file, 10 by default.',syn:[['head','cmd'],['-n 5','opt'],['file','arg']],ex:[['head journal.txt',''],['head -n 3 journal.txt','']]},
 {c:'tail',ch:3,what:'Show the last lines of a file, 10 by default.',syn:[['tail','cmd'],['-n 5','opt'],['file','arg']],ex:[['tail journal.txt',''],['tail -n 3 journal.txt','']]},
 {c:'wc',ch:3,what:'Count lines, words and characters. -l counts lines only.',syn:[['wc','cmd'],['-l','opt'],['file','arg']],ex:[['wc journal.txt',''],['wc -l journal.txt','']]},
 {c:'grep',ch:3,what:'Print lines that contain a pattern. -i ignores case, -n adds line numbers, -c counts, -v shows lines that do NOT match.',syn:[['grep','cmd'],['-i','opt'],['pattern','arg'],['file','arg']],ex:[['grep wolf journal.txt',''],['grep -in map journal.txt','ignore case, numbered'],['grep -v Day journal.txt','lines without "Day"']]},
 {c:'|',ch:4,what:'The pipe. Sends the output of one command into the next one.',syn:[['command','cmd'],['|','op'],['command','cmd']],ex:[['cat journal.txt | grep fire',''],['ls | wc -l','how many items are here']]},
 {c:'sort',ch:4,what:'Sort lines. -r reverses, -n sorts by number value.',syn:[['sort','cmd'],['-r -n','opt'],['file','arg']],ex:[['sort village/people.txt',''],['sort -r village/people.txt','Z to A']]},
 {c:'uniq',ch:4,what:'Collapse repeated lines that sit next to each other. -c counts them. Use it after sort.',syn:[['uniq','cmd'],['-c','opt']],ex:[['sort village/people.txt | uniq -c','']]},
 {c:'* and ?',ch:5,what:'Wildcards. * matches any characters, ? matches exactly one. The shell expands them into matching names.',syn:[['ls','cmd'],['*.txt','arg']],ex:[['ls *.txt',''],['ls village/logs/day?.log','']]},
 {c:'find',ch:5,what:'Search a folder and everything below it. -name matches names, -type f or -type d picks files or folders.',syn:[['find','cmd'],['.','arg'],['-name','opt'],['"*.txt"','arg']],ex:[['find . -name "*.txt"',''],['find . -type d','folders only']]},
 {c:'tree',ch:5,what:'Draw a folder and everything inside as a tree. On a real computer you may need to install it first.',syn:[['tree','cmd'],['folder','arg']],ex:[['tree',''],['tree forest','']]},
 {c:'&&',ch:5,what:'Run the next command only if the previous one succeeded.',syn:[['command','cmd'],['&&','op'],['command','cmd']],ex:[['mkdir -p notes && cd notes','']]},
 {c:'variables',ch:6,what:'Store a value with NAME=value (no spaces) and read it back with $NAME.',syn:[['NAME','var'],['=','op'],['value','arg']],ex:[['NAME="Ada"',''],['echo "Hi $NAME"','']]},
 {c:'chmod',ch:6,what:'Change permissions. +x makes a file executable, so you can run it.',syn:[['chmod','cmd'],['+x','opt'],['file','arg']],ex:[['chmod +x pack.sh','']]},
 {c:'./script',ch:6,what:'Run a script in this folder. bash script.sh runs it even without +x.',syn:[['./pack.sh','cmd']],ex:[['./pack.sh',''],['bash pack.sh','']]},
 {c:'for',ch:6,what:'Repeat commands once for each item in a list.',syn:[['for','kw'],['x','var'],['in a b c;','arg'],['do … ;','cmd'],['done','kw']],ex:[['for n in 1 2 3; do echo $n; done',''],['for f in *.txt; do wc -l $f; done','count lines in each text file']]},
 {c:'history',ch:'extras',what:'List the commands you typed. Press ↑ to bring the last ones back.',syn:[['history','cmd']],ex:[['history','']]},
 {c:'clear',ch:'extras',what:'Clear the screen. Ctrl+L does the same.',syn:[['clear','cmd']],ex:[['clear','']]},
 {c:'man',ch:'extras',what:'Show the manual for a command. On a real computer, press q to leave it.',syn:[['man','cmd'],['command','arg']],ex:[['man grep','']]},
 {c:'help',ch:'extras',what:'List every command this practice shell knows.',syn:[['help','cmd']],ex:[['help','']]}
];
SQ.content.guide.push(...GUIDE);
SQ.GUIDE=SQ.content.guide;
})(window.SQ = window.SQ || {});
