#! /usr/bin/env node

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    prompt: 'ghshell > '
});


function intro() {
    console.log('----------------------------');
    console.log('|          GHSHELL         |');
    console.log('----------------------------');
    console.log('');
}

function completer(line) {
    var completions = 'help list'.split(' ');
    var hits = completions.filter(function(c) {
        if (c.indexOf(line) == 0) {
            return c;
        }
    });
    return [hits && hits.length ? hits : completions, line];
}

intro();
rl.prompt();

rl.on('line', function (line) {
    switch(line.trim()) {
        case 'help':
            console.log('Show help');
            break;
        case 'list':
            console.log('Show list');
            break;
        default:
            //console.log(`'${line.trim()}'`);
            console.log('Show help');
            break;
    }
    rl.prompt();
}).on('close', function() {
    console.log('');
    process.exit(0);
});


/*
var shell = require('commander');

shell
    .version('1.0.0')
    .option('-u, --username [user]', 'The user to authenticate as')
    .option('-p, --password [pass]', "User'\ password")
    .parse(process.argv);

console.log('User: %j', shell.username);
console.log('Password: %j', shell.password);
*/