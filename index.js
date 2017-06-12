#! /usr/bin/env node

var colors       = require('colors');
var clear        = require('clear');
var CLI          = require('clui');
var Spinner      = CLI.Spinner;
var figlet       = require('figlet');
var UserSettings = require('user-settings');
var GitHubApi    = require('github');
var Promise      = require('bluebird');

const fs         = require('fs');
const files      = require('./lib/files');
const readline   = require('readline');
const crypto     = require('crypto');
const path       = require('path');

const promptString = 'ghshell > ';

var prefs = UserSettings.file('.ghshell');
var homedir = process.env.HOME || process.env.USERPROFILE;
var seed = (() => {
    let key = path.join(homedir, '.ssh', 'id_rsa');
    try {
        return fs.readFileSync(key).toString('utf8')    // Use private SSH key as seed
    } catch (e) {
        return crypto.randomBytes(256).toString('hex'); // or random string
    }
})();

var commands = require('./lib/commands').commands;
var scope = 'main';
var completions = Object.keys(commands[scope][0]);

const github = new GitHubApi({
    debug: false,
    protocol: "https",
    host: "api.github.com",
    followRedirects: false, // default: true; there's currently an issue with non-get redirects, so allow ability to disable follow-redirects
    timeout: 5000,
    Promise: Promise
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    prompt: 'ghshell > '.cyan
});

/****************************************************************/

function hiddenPassword(query, callback) {
    let stdin = process.openStdin();
    let onDataHandler = (char) => {
        char = char + "";
        switch (char) {
            case "\n": case "\r": case "\u0004":
                stdin.removeListener("data",onDataHandler);   // Remove this handler
                break;
            default:
                process.stdout.write("\033[2K\033[200D" + query + Array(rl.line.length + 1).join("*"));
                break;
        }
    };
    process.stdin.on("data", onDataHandler);

    rl.question(query, (value) => {
        rl.history = rl.history.slice(1);
        callback(value);
    });
}

function getGithubCredentials(callback) {

    console.log('Enter your GitHub credentials:');

    rl.question('User: '.grey, (user) => {
        hiddenPassword('Password: '.grey, (pass) => {
            callback({username: user, password: pass});
        });
    });
}

function getGithubToken(callback) {

    if (prefs.get('token')) {
        return callback(null, JSON.parse(decode(prefs.get('token'))));
    }

    // Fetch token
    getGithubCredentials(function(credentials) {

        let status = new Spinner('Authenticating...');
        status.start();

        github.authenticate({
            type     : 'basic',
            username : credentials.username,
            password : credentials.password
        });

        github.authorization.create({
            scopes: ['public_repo', 'read:org', 'read:user'],
            note: 'ghshell, the CLI tool for automatic corrections and executions of GitHub\'s repositories'
        }, (err, res) => {
            status.stop();
            if (err) {
                return callback(err);
            }
            if (res.data.token) {
                prefs.set('token',     encode(String(JSON.stringify(res.data.token))));
                prefs.set('id',        encode(String(JSON.stringify(res.data.id))));
                prefs.set('client_id', encode(String(JSON.stringify(res.data.app.client_id))));
                prefs.set('username',  encode(credentials.username));
                prefs.set('password',  encode(credentials.password));
                return callback(null, res.data.token);
            }
            return callback();
        });
    });
}


function githubAuth(callback) {
    getGithubToken((err, token) => {
        if (err) {
            return callback(err);
        }
        github.authenticate({
            type     : 'basic',
            username : decode(prefs.get('username')),
            password : decode(prefs.get('password'))
        });
        return callback(null, token);
    });
}

function login() {
    githubAuth((err, authed) => {
        if (err) {
            switch (err.code) {
                case 401:
                    console.log('Couldn\'t log you in. Try again.'.red);
                    rl.write(null, {name: 'enter'});
                    break;
                case 422:
                    console.log('You already have an access token.'.red);
                    rl.write(null, {name: 'enter'});
                    break;
            }
        }
        else {
            if (authed) {
                getRepos();
                console.log('Sucessfully authenticated!'.green);
                console.log('');
                rl.write(null, {name: 'enter'});
            }
        }
    });
}

function clearCredentials() {
    prefs.unset('token');
    prefs.unset('id');
    prefs.unset('client_id');
    prefs.unset('username');
    prefs.unset('password');
}

function logout() {

    console.log('Local credentials cleared'.yellow);
    console.log('');

    github.authorization.delete({
        id: JSON.parse(decode(prefs.get('id')))
    }).then(() => {
        clearCredentials();
    });
}

function encode (text) {
    let cipher = crypto.createCipher('aes128', seed);
    return cipher.update(new Buffer(text).toString('utf8'), 'utf8', 'hex') + cipher.final('hex')
}

function decode (text) {
    let decipher = crypto.createDecipher('aes128', seed);
    return decipher.update(String(text), 'hex', 'utf8') + decipher.final('utf8')
}

function completer(line) {
    let hits = completions.filter((c) => c.startsWith(line.split(' ').slice(-1)));

    return [hits.length ? hits : completions, line];
}


function listOrgs(obj) {
    for(let i = 0; i < obj.data.length; i++)
        rl.output.write(obj.data[i].login + '   ');
    console.log('');
    rl.write(null, {name: 'enter'});
}

function print(rep) {
    for(let i = 0; i < rep.length; i++)
        rl.output.write(rep[i].name + '   ');
    console.log('');
    rl.write(null, {name: 'enter'});
}

var rep = [];
//function listRepos(err, response) {
    //if (err)
    //    return false;

    //rep = rep.concat(response['data']);
    //console.log(rep.length)

    //if (github.hasNextPage(response)) {
       // print(response['data'])
        //github.getNextPage(response, listRepos);
    //}
    //else {
        //console.log(Object.keys(rep).length)
        //print(response['data'])
        //return rep;

/*        console.log('')
        print(rep);
        rep = []*/
//    }
//}

function store(res) {
    for(let i = 0; i < rep.length; i++)
        commands['main'][0]['cd'].push(rep[i].name);
}

function listRepos(err, response) {
    if (err)
        return false;

    rep = rep.concat(response['data']);

    if (github.hasNextPage(response)) {
        store(response['data'])
        github.getNextPage(response, listRepos);
    }
    else {
        store(response['data'])
    }
}

function getRepos() {
    github.repos.getAll({
        affiliation: 'owner',
        per_page: 100
    }).then((result) => {
        listRepos('', result)
    });
}
/****************************************************************/
var jsonfile = require('jsonfile')
var file = './tmp.json';

clear();
console.log(
    figlet.textSync('ghshell', { horizontalLayout: 'full'}).yellow
);
console.log('');

rl.prompt();

rl.on('line', async (line) => {
    var cmd = line.trim().split(' ');
    var firstCmd = cmd[0];
    var secCmd = cmd[1];

    switch(firstCmd) {
        case 'help':
            console.log('Show help');
            break;
        case 'test':
            jsonfile.writeFile(file, commands, (err) => {
                console.log(err);
            });
            break;
        case 'login':
            login();
            break;
        case 'logout':
            logout();
            break;
        case 'list':
            console.log('Show list');
            break;
        case 'orgs':
            /*await github.users.getOrgs({}).then((result) => {
                listOrgs(result);
                if (github.hasNextPage(result)) {
                    github.getNextPage(result, {}, function (err, result) {
                        listOrgs(result);
                    });
                };
            });*/
            console.log('Show orgs');
            break;
        case 'repos':
            /*await github.repos.getAll({
                affiliation: 'owner',
                per_page: 30
            }).then(async (result) => {
                await listRepos('', result)
            });*/
            console.log('Show repos');
            break;
        case 'cd':
            if (cmd.length === 2) {
                console.log('Entro');
                switch (secCmd) {
                    case '..':
                        rl.setPrompt(promptString.cyan);
                        completions = Object.keys(commands[scope][0]);
                        break;
                    case 'hola':
                        rl.setPrompt(promptString.slice(0, -2).cyan + '(dir)'.yellow + ' > '.cyan);
                        completions = commands[scope][0]['cd'];
                        break;
                }
                ;
                rl.setPrompt(promptString.slice(0, -2).cyan + '(dir)'.yellow + ' > '.cyan);
                completions = commands[scope][0]['cd'];
            }
            else {
                console.log('Syntax error!'.red);
                console.log('');
            }
            break;
        case 'back':
            rl.setPrompt(promptString.cyan);
            completions = Object.keys(commands[scope][0]);
            break;
        case 'exit':
            process.exit(0);
        default:
            if (cmd.length != 0) {
                console.log('Unrecognized command'.red);
                console.log('')
            }
            break;
    }
    rl.prompt();
}).on('close', () => {
    console.log('');
    process.exit(0);
});


/*
 tab completion nodejs cli
 https://stackoverflow.com/questions/19990639/how-to-add-tab-completion-to-a-nodejs-cli-app
 https://github.com/mklabs/node-tabtab/blob/master/examples/api.js
 https://github.com/0x00A/complete
 https://www.npmjs.com/package/commander-completion

 */