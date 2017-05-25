#! /usr/bin/env node

var colors      = require('colors');
var clear       = require('clear');
var CLI         = require('clui');
var Spinner     = CLI.Spinner;
var figlet      = require('figlet');
var inquirer    = require('inquirer');
var Preferences = require('preferences');
var GitHubApi   = require('github');
var _           = require('lodash');
var fs          = require('fs');
var files       = require('./lib/files');
var Promise     = require("bluebird");
const readline = require('readline');

var github = new GitHubApi({
    debug: false,
    protocol: "https",
    host: "api.github.com",
    followRedirects: false, // default: true; there's currently an issue with non-get redirects, so allow ability to disable follow-redirects
    timeout: 5000,
    Promise: Promise
});

/****************************************************************/

function hidden(query, callback) {
    var stdin = process.openStdin();
    var onDataHandler = function(char) {
        char = char + "";
        switch (char) {
            case "\n": case "\r": case "\u0004":
            // Remove this handler
            stdin.removeListener("data",onDataHandler);
            break;//stdin.pause(); break;
            default:
                process.stdout.write("\033[2K\033[200D" + query + Array(rl.line.length+1).join("*"));
                break;
        }
    }
    process.stdin.on("data", onDataHandler);

    rl.question(query, function(value) {
        rl.history = rl.history.slice(1);
        callback(value);
    });
}

function getGithubCredentials(callback) {

    rl.question('User: ', (user) => {
        hidden("Password: ", (pass) => {
            callback({username: user, password: pass});
        });
    });
}

function getGithubToken(callback) {
    var prefs = new Preferences('ghshell');

    if (prefs.github && prefs.github.token) {
        return callback(null, prefs.github.token);
    }

    // Fetch token
    getGithubCredentials(function(credentials) {

        var status = new Spinner('Authenticating...');
        status.start();

        github.authenticate(
            _.extend(
                {
                    type: 'basic',
                },
                credentials
            )
        )
        github.authorization.create({
            scopes: ['public_repo', 'read:org', 'read:user'],
            note: 'ghshell, the CLI tool for automatic corrections and executions of GitHub\'s repositories'
        }, function(err, res) {
            status.stop();
            if ( err ) {
                return callback( err );
            }
            if (res.data.token) {
                prefs.github = {
                    token : res.data.token
                };
                return callback(null, res.data.token);
            }
            return callback();
        });
    });
}


function githubAuth(callback) {
    getGithubToken(function(err, token) {
        if (err) {
            return callback(err);
        }
        github.authenticate({
            type : 'oauth',
            token : token
        });
        return callback(null, token);
    });
}

function login() {
    githubAuth(function(err, authed) {
        if (err) {
            switch (err.code) {
                case 401:
                    console.log('Couldn\'t log you in. Try again.'.red);
                    break;
                case 422:
                    console.log('You already have an access token.'.red);
                    break;
            }
        }
        if (authed) {
            console.log('Sucessfully authenticated!'.green);
            console.log('');
        }
    });
}

/****************************************************************/

clear();
console.log(
    figlet.textSync('ghshell', { horizontalLayout: 'full'}).yellow
);
console.log('');




function completer(line) {
    var completions = 'exit help list login orgs repos'.split(' ');
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    prompt: 'ghshell > '.cyan
});

rl.prompt();

rl.on('line', function (line) {
    switch(line.trim()) {
        case 'help':
            console.log('Show help');
            break;
        case 'login':
            console.log('Enter your GitHub credentials.');
            login();
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