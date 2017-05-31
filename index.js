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

var prefs = UserSettings.file('.ghshell');
var homedir = process.env.HOME || process.env.USERPROFILE;
var seed = (function () {
    var key = path.join(homedir, '.ssh', 'id_rsa');
    try {
        // Use private SSH key as seed
        return fs.readFileSync(key).toString('utf8')
    } catch (e) {
        // or random string
        return crypto.randomBytes(256).toString('hex');
    }
})();

var github = new GitHubApi({
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

        var status = new Spinner('Authenticating...');
        status.start();

        github.authenticate(
            {
                type: 'basic',
                username: credentials.username,
                password: credentials.password
            }
        );

        github.authorization.create({
            scopes: ['public_repo', 'read:org', 'read:user'],
            note: 'ghshell, the CLI tool for automatic corrections and executions of GitHub\'s repositories'
        }, function(err, res) {
            status.stop();
            if ( err ) {
                return callback( err );
            }
            if (res.data.token) {
                prefs.set('token', encode(String(JSON.stringify(res.data.token))));
                prefs.set('id', encode(String(JSON.stringify(res.data.id))));
                prefs.set('client_id', encode(String(JSON.stringify(res.data.app.client_id))));
                prefs.set('username', encode(credentials.username));
                prefs.set('password', encode(credentials.password));
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
            type : 'basic',
            username : decode(prefs.get('username')),
            password : decode(prefs.get('password'))
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
    }).then(function () {
        clearCredentials();
    });
}

function encode (text) {
    var cipher = crypto.createCipher('aes128', seed)
    return cipher.update(new Buffer(text).toString('utf8'), 'utf8', 'hex') + cipher.final('hex')
}

function decode (text) {
    var decipher = crypto.createDecipher('aes128', seed)
    return decipher.update(String(text), 'hex', 'utf8') + decipher.final('utf8')
}

function completer(line) {
    var completions = 'exit help list login logout orgs repos'.split(' ');
    var hits = completions.filter(function(c) {
        if (c.indexOf(line) === 0) {
            return c;
        }
    });
    return [hits && hits.length ? hits : completions, line];
}

function listOrgs(obj) {
    for(var i = 0; i < obj.data.length; i++)
        rl.output.write(obj.data[i].login + '   ');
    console.log('');
    rl.write(null, {name: 'enter'});
}
/****************************************************************/

clear();
console.log(
    figlet.textSync('ghshell', { horizontalLayout: 'full'}).yellow
);
console.log('');

rl.prompt();

rl.on('line', async function (line) {
    switch(line.trim()) {
        case 'help':
            console.log('Show help');
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
            await github.users.getOrgs({}).then(function (result) {
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