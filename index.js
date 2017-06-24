#! /usr/bin/env node

var colors       = require('colors');
var clear        = require('clear');
var CLI          = require('clui');
var Spinner      = CLI.Spinner;
var figlet       = require('figlet');
var UserSettings = require('user-settings');
var GitHubApi    = require('github');
var Promise      = require('bluebird');
var jsonfile     = require('jsonfile')
var timestamp    = require('time-stamp');

const fs         = require('fs');
const files      = require('./lib/files');
const readline   = require('readline');
const crypto     = require('crypto');
const path       = require('path');
const { spawn }  = require('child_process');

var commands     = require('./lib/commands').commands;

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
var scope = 'main';
var completions = Object.keys(commands[scope][0]);
var currentRepo = undefined;
var currentOrg  = undefined;
var file = './tmp.json';

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
                getOrgs();
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
    let cmds = line.split(' ');
    let hits = completions.filter((c) => c.startsWith(cmds.slice(-1)));

    if ((cmds.length > 1) && (hits.length === 1)) {
        let lastCmd = cmds.slice(-1)[0];
        let pos = lastCmd.length;
        rl.line = line.slice(0, -pos).concat(hits[0]);
        rl.cursor = rl.line.length + 1;
    }
    return [hits.length ? hits.sort() : completions.sort(), line];
}

function storeOrgs() {
    while (orgs.length !== 0) {
        let o = orgs.shift();
        commands['orgs'][o.login] = {};
        h[o.login] = [];
        getOrgsRepos(o.login);
    }
}

var orgs = [];
var h = {};
function listOrgs(err, obj) {

    if (err)
        return false;

    orgs = orgs.concat(obj.data);

    if (github.hasNextPage(obj)) {
        storeOrgs();
        github.getNextPage(obj, listOrgs);
    }
    else {
        storeOrgs();
    }

}

function getOrgs() {
    github.users.getOrgs({
    }).then((result) => {
        listOrgs('', result);
    });
}

function storeOrgRepos(organization) {
    for(let i = 0; i < h[organization].length; i++) {
        commands['orgs'][organization][h[organization][i].name] = {
            'clone_url': h[organization][i].clone_url
        }
    }
}

function getOrgsRepos(organization) {
    github.repos.getForOrg({
        org: organization,
        per_page: 100
    }).then((result) => {
        listOrgRepos('', result, organization);
    });
};


function listOrgRepos(err, response, organization) {
    if (err)
        return false;

    h[organization] = h[organization].concat(response['data']);

    if (github.hasNextPage(response)) {
        storeOrgRepos(organization);
        github.getNextPage(response, listOrgRepos);
    }
    else {
        storeOrgRepos(organization);
    }
}

var rep = [];

function store() {
    for(let i = 0; i < rep.length; i++) {
        commands['repos'][rep[i].name] = {
            'clone_url': rep[i].clone_url
        }
    }
}



function listRepos(err, response) {
    if (err)
        return false;

    rep = rep.concat(response['data']);

    if (github.hasNextPage(response)) {
        store();
        github.getNextPage(response, listRepos);
    }
    else {
        store();
    }
}

function getRepos() {
    github.repos.getAll({
        affiliation: 'owner',
        per_page: 100
    }).then((result) => {
        listRepos('', result)
    });
};


/****************************************************************/
clear();
console.log(
    figlet.textSync('ghshell', { horizontalLayout: 'full'}).yellow
);
console.log('');
console.log('');
login();

rl.prompt();


rl.on('line', async (line) => {
    var cmd = line.trim().split(' ');
    var firstCmd = cmd[0];
    var secCmd = cmd[1];

    switch(firstCmd) {
        case 'help':
            console.log('Show help');
            console.log('');
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
        case 'orgs':
            completions = Object.keys(commands['orgs']);
            rl.question('Select organization'.yellow.bold + ' (left empty for cancel the action): '.yellow, (org) => {
                if (org !== '') {
                    if (completions.includes(org)) {
                        rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + org.yellow + ') > '.cyan);
                        completions = commands[scope][0]['orgs'];
                        currentOrg = org;
                    }
                    else {
                        console.log(`Organization ${org} not found`.red.bold);
                        completions = Object.keys(commands[scope][0]);
                    }
                }
                else
                    completions = Object.keys(commands[scope][0]);

                rl.write(null, {name: 'enter'});
                rl.write(null, {name: 'enter'});
            });
            break;
        case 'repos':
            if (currentOrg !== undefined)
                completions = Object.keys(commands['orgs'][currentOrg.toString()]);
            else
                completions = Object.keys(commands['repos']);

            rl.question('Select repository'.yellow.bold + ' (left empty for cancel the action): '.yellow, (repo) => {
                if (repo !== '') {
                    if (completions.includes(repo)) {
                        if (currentOrg !== undefined)
                            rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + currentOrg.yellow + ` ~> ${repo}`.red.bold + ') > '.cyan);
                        else
                            rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + repo.yellow + ') > '.cyan);
                        currentRepo = repo;
                        completions = commands[scope][0]['repos'];
                    }
                    else {
                        console.log(`Repository ${repo} not found`.red.bold);
                        if (currentOrg !== undefined)
                            completions = commands[scope][0]['orgs'];
                        else
                            completions = Object.keys(commands[scope][0]);
                    }
                }
                else {
                    if (currentOrg !== undefined)
                        completions = commands[scope][0]['orgs'];
                    else
                        completions = Object.keys(commands[scope][0]);
                }
                rl.write(null, {name: 'enter'});
                rl.write(null, {name: 'enter'});
            });
            break;
        case 'back':
            if (currentOrg !== undefined) {
                if (currentRepo !== undefined) {
                    rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + currentOrg.yellow + ') > '.cyan);
                    completions = commands[scope][0]['orgs'];
                }
                else {
                    rl.setPrompt(promptString.cyan);
                    completions = Object.keys(commands[scope][0]);
                    currentOrg  = undefined;
                }
            }
            else {
                rl.setPrompt(promptString.cyan);
                completions = Object.keys(commands[scope][0]);
                currentOrg  = undefined;
            }
            currentRepo = undefined;
            break;
        case 'clone':
            let matchOn;
            let matches = [];

            try {               // Regexp
                matchOn = eval(secCmd);
                if (currentOrg !== undefined)
                    matches = Object.keys(commands['orgs'][currentOrg]).filter(s => matchOn.test(s));
                else
                    matches = Object.keys(commands['repos']).filter(s => matchOn.test(s));
            }
            catch (err) {       // String
                if (secCmd !== undefined) {
                    matchOn = secCmd;
                    if (currentOrg !== undefined)
                        matches = Object.keys(commands['orgs'][currentOrg]).filter(s => s === matchOn);
                    else
                        matches = Object.keys(commands['repos']).filter(s => s === matchOn);
                }
                else {
                    if (currentRepo !== undefined)
                        matches.push(currentRepo);
                }
            }

            if (matches.length > 0) {
                if (currentOrg !== undefined)
                    var child2 = spawn('mkdir', ['-p', currentOrg.toString()]);

                for (let i = 0; i < matches.length; i++) {
                    var child, logFilePath;

                    if (currentOrg !== undefined) {
                        child = spawn('git', ['clone', '--progress', commands['orgs'][currentOrg.toString()][matches[i]].clone_url, `${currentOrg}/${matches[i]}`]);
                        logFilePath = `./${currentOrg}/${matches[i]}.log`
                    }
                    else {
                        child = spawn('git', ['clone', '--progress', commands['repos'][matches[i]].clone_url]);
                        logFilePath = `./${matches[i]}.log`
                    }

                    console.log(`Cloning ${matches[i]}...`.yellow.bold + " (see ".blue + `${matches[i]}.log`.blue.underline + " for more information)".blue);
                    //let  t = new Spinner('Cloning '.yellow + matches[i].yellow + "...".yellow );
                    //t.start();

                    child.on('error', (err) => {
                        console.log('Failed to start child process.');
                    });

                    child.stderr.on('data', (data) => {
                        fs.writeFile(logFilePath,
                            "[" + timestamp('YYYY/MM/DD-HH:mm:ss') + "] " + data,
                            {flag: 'a'}, () => {
                            }
                        );
                    });

                    child.on('close', function () {
                        //console.log("Cloning " + matches[i] + "... [done]");
                        //t.stop();
                        //rl.write(null, {name: 'enter'});
                    });
                }
                ;
            }
            else {
                if (secCmd !== undefined)
                    console.log(`Repository ${secCmd} not found`.red.bold);
                else
                    console.log(`There isn't any repository to clone`.red.bold);
            }
            console.log('');
            break;
        case 'assignments':
            let pattern;
            let hits = [];

            try {               // Regexp
                pattern = eval(secCmd);
                hits = Object.keys(commands['orgs'][currentOrg]).filter(s => pattern.test(s));
            }
            catch (err) {
                if (secCmd !== undefined) {    // ************ Controlar errores
                    pattern = secCmd;
                    hits = Object.keys(commands['orgs'][currentOrg]).filter(s => s.split('-')[0] === pattern);
                }
            }
            for (let i = 0; i < hits.length; i++)
                console.log(hits[i] + "   ");
            break;
        case 'exit':
            process.exit(0);
        /*default:
            if (cmd.length != 0) {
                console.log('Unrecognized command'.red);
                console.log('')
            }
            break;*/
    }
    rl.prompt();
}).on('close', () => {
    console.log('');
    process.exit(0);
});
