#! /usr/bin/env node

const readline = require('readline');
var colors = require('colors');
var GitHubApi = require('github');

var github = new GitHubApi({
    debug: false,
    protocol: "https",
    host: "api.github.com",
    /*headers: {
        "user-agent": "My-Cool-GitHub-App" // GitHub is happy with a unique user agent
    },*/
    followRedirects: false, // default: true; there's currently an issue with non-get redirects, so allow ability to disable follow-redirects
    timeout: 5000
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    prompt: 'ghshell > '.cyan
});


function intro() {
    console.log('----------------------------');
    console.log('|          GHSHELL         |');
    console.log('----------------------------');
    console.log('');
}

function completer(line) {
    var completions = 'help list exit repos orgs'.split(' ');
    var hits = completions.filter(function(c) {
        if (c.indexOf(line) === 0) {
            return c;
        }
    });
    return [hits && hits.length ? hits : completions, line];
}

function listOrgs(obj) {
    console.log('');
    for(var i = 0; i < obj.data.length; i++)
        rl.output.write(obj.data[i].login + '   ');
    rl.write(null, {name: 'enter'});
}

intro();

github.authenticate({
    type: "basic",
    username: "user",
    password: "password"
});

rl.prompt();

rl.on('line', function (line) {
    switch(line.trim()) {
        case 'help':
            console.log('Show help');
            break;
        case 'list':
            console.log('Show list');
            break;
        case 'orgs':
            github.users.getOrgs({}, function (error, result) {
                listOrgs(result);
            });
            break;
        case 'exit':
            process.exit(0);
        default:
            //console.log(`'${line.trim()}'`);
            //console.log('Show help');
            break;
    }
    rl.prompt();
}).on('close', function() {
    console.log('');
    process.exit(0);
});