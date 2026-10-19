(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const QF=[
 ['Show the folder you are in',['pwd']],['List the files here',['ls']],
 ['List files here, including hidden ones',['ls -a','ls -la','ls -al','ls -A']],
 ['Go into the folder "forest"',['cd forest','cd forest/','cd ./forest']],['Go up one folder',['cd ..','cd ../']],
 ['Go to your home folder',['cd','cd ~','cd ~/','cd $HOME']],['Make a folder called "tools"',['mkdir tools']],
 ['Create an empty file called list.txt',['touch list.txt']],['Print the word hi',['echo hi']],
 ['Show what is inside notes.txt',['cat notes.txt']],['Show the first 10 lines of log.txt',['head log.txt','head -n 10 log.txt','head -10 log.txt']],
 ['Show the last 5 lines of log.txt',['tail -n 5 log.txt','tail -5 log.txt','tail -n5 log.txt']],
 ['Count the lines in log.txt',['wc -l log.txt','cat log.txt | wc -l','wc -l < log.txt']],
 ['Show lines in log.txt that contain "error"',['grep error log.txt']],
 ['Same search, ignoring upper/lower case',['grep -i error log.txt']],
 ['Copy a.txt to b.txt',['cp a.txt b.txt']],['Rename old.txt to new.txt',['mv old.txt new.txt']],
 ['Delete the file junk.txt',['rm junk.txt']],['Delete the folder "old" and everything in it',['rm -r old','rm -rf old','rm -R old','rm -fr old']],
 ['Create folders a/b/c in one command',['mkdir -p a/b/c']],['Save the output of ls into files.txt',['ls > files.txt']],
 ['Add the line "done" to the end of todo.txt',['echo done >> todo.txt']],['Make run.sh executable',['chmod +x run.sh','chmod u+x run.sh','chmod 755 run.sh']],
 ['Run the script run.sh in this folder',['./run.sh','bash run.sh','sh run.sh']],
 ['Find every .txt file below this folder',['find . -name *.txt','find -name *.txt']],
 ['Sort the lines of names.txt',['sort names.txt','cat names.txt | sort']],['Clear the screen',['clear']],
 ['List only the .log files here',['ls *.log']],['Set a variable CITY to Paris',['CITY=Paris']],
 ['Print the value of the variable CITY',['echo $CITY','echo ${CITY}']],
 ['Count the repeats in names.txt (sort first)',['sort names.txt | uniq -c','cat names.txt | sort | uniq -c']]
];
SQ.content.quickfire.push(...QF);
})(window.SQ = window.SQ || {});
