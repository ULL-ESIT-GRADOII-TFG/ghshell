#! /usr/bin/env node

var colors       = require('colors');
var clear        = require('clear');
var CLI          = require('clui');
var Spinner      = CLI.Spinner;
var figlet       = require('figlet');
var UserSettings = require('user-settings');
var GitHubApi    = require('github');
var Promise      = require('bluebird');
var jsonfile     = require('jsonfile');
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
};

function getGithubCredentials(callback) {

    console.log('Enter your GitHub credentials:');

    rl.question('User: '.grey, (user) => {
        hiddenPassword('Password: '.grey, (pass) => {
            callback({username: user, password: pass});
        });
    });
};

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
};


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
};

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
};

function clearCredentials() {
    prefs.unset('token');
    prefs.unset('id');
    prefs.unset('client_id');
    prefs.unset('username');
    prefs.unset('password');
};

function logout() {

    console.log('Local credentials cleared'.yellow);
    console.log('');

    github.authorization.delete({
        id: JSON.parse(decode(prefs.get('id')))
    }).then(() => {
        clearCredentials();
    });
};

function encode (text) {
    let cipher = crypto.createCipher('aes128', seed);
    return cipher.update(new Buffer(text).toString('utf8'), 'utf8', 'hex') + cipher.final('hex')
};

function decode (text) {
    let decipher = crypto.createDecipher('aes128', seed);
    return decipher.update(String(text), 'hex', 'utf8') + decipher.final('utf8')
};

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
};

function storeOrgs() {
    while (orgs.length !== 0) {
        let o = orgs.shift();
        commands['orgs'][o.login] = {};
        h[o.login] = [];
        getOrgsRepos(o.login);
    }
};

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
    else
        storeOrgs();
};

function getOrgs() {
    github.users.getOrgs({
    }).then((result) => {
        listOrgs('', result);
    });
};

function storeOrgRepos(organization) {
    for(let i = 0; i < h[organization].length; i++) {
        commands['orgs'][organization][h[organization][i].name] = {
            'clone_url': h[organization][i].clone_url
        }
    }
};

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
    else
        storeOrgRepos(organization);
};

var rep = [];

function store() {
    for(let i = 0; i < rep.length; i++) {
        commands['repos'][rep[i].name] = {
            'clone_url': rep[i].clone_url
        }
    }
};

function listRepos(err, response) {
    if (err)
        return false;

    rep = rep.concat(response['data']);

    if (github.hasNextPage(response)) {
        store();
        github.getNextPage(response, listRepos);
    }
    else
        store();
};

function getRepos() {
    github.repos.getAll({
        affiliation: 'owner',
        per_page: 100
    }).then((result) => {
        listRepos('', result)
    });
};

function organizations(secCmd) {
    if (!secCmd) {
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
                rl.history = rl.history.slice(1);
            }
            else
                completions = Object.keys(commands[scope][0]);

            rl.write(null, {name: 'enter'});
            rl.write(null, {name: 'enter'});
        });
    }
    else {                                  // Second arg
        if (secCmd === '-l') {              // -l option
            let orgs = Object.keys(commands['orgs']);

            for (let i = 0; i < orgs.length; i++)
                rl.write(orgs[i] + "   ");

            console.log('');
            rl.write(null, {name: 'enter'});
            rl.history = rl.history.slice(1);
        }
    }
}

function repositories(secCmd) {
    if (!secCmd) {                          // No second arg
        if (currentOrg)                     // We're inside of an organization
            completions = Object.keys(commands['orgs'][currentOrg]);
        else                                // We're outside of an organization
            completions = Object.keys(commands['repos']);

        rl.question('Select repository'.yellow.bold + ' (left empty for cancel the action): '.yellow, (repo) => {
            if (repo !== '') {
                if (completions.includes(repo)) {
                    if (currentOrg)
                        rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + currentOrg.yellow + ` ~> ${repo}`.red.bold + ') > '.cyan);
                    else
                        rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + repo.yellow + ') > '.cyan);
                    currentRepo = repo;
                    completions = commands[scope][0]['repos'];
                }
                else {
                    console.log(`Repository ${repo} not found`.red.bold);
                    if (currentOrg)
                        completions = commands[scope][0]['orgs'];
                    else
                        completions = Object.keys(commands[scope][0]);
                }
                rl.history = rl.history.slice(1);
            }
            else {
                if (currentOrg)
                    completions = commands[scope][0]['orgs'];
                else
                    completions = Object.keys(commands[scope][0]);
            }
            rl.write(null, {name: 'enter'});
            rl.write(null, {name: 'enter'});
        });
    }
    else {                                  // Second arg
        if (secCmd === '-l') {              // -l option
            let repos;
            if (currentOrg)
                repos = Object.keys(commands['orgs'][currentOrg]);
            else
                repos = Object.keys(commands['repos']);

            for (let i = 0; i < repos.length; i++)
                rl.write(repos[i] + "   ");

            console.log('');
            rl.write(null, {name: 'enter'});
            rl.history = rl.history.slice(1);
        }
        else {                              // string o regexp
            let matches = matching(secCmd);
            if (matches.length !== 0) {
                for (let i = 0; i < matches.length; i++)
                    rl.write(matches[i] + "   ");

                console.log('');
                rl.write(null, {name: 'enter'});
                rl.history = rl.history.slice(1);
            }
            else {
                console.log("Repository not found".red.bold);
                console.log('');
            }
        }
    }
}


function matching(secCmd, assignment) {
    let matchOn;
    let matches = [];

    try {                                   // Regexp
        matchOn = eval(secCmd);
        if (currentOrg)                     // We're inside of an organization
            matches = Object.keys(commands['orgs'][currentOrg]).filter(s => matchOn.test(s));
        else
            matches = Object.keys(commands['repos']).filter(s => matchOn.test(s));
    }
    catch (err) {                           // String
        matchOn = secCmd;
        if (currentOrg) {
            if (assignment)
                matches = Object.keys(commands['orgs'][currentOrg]).filter(s => s.split('-')[0] === matchOn);
            else
                matches = Object.keys(commands['orgs'][currentOrg]).filter(s => s === matchOn);
        }
        else
            matches = Object.keys(commands['repos']).filter(s => s === matchOn);
    }

    return (matches);
}


function back_to() {
    if (currentOrg) {                       // If we're inside an organization
        if (currentRepo) {                  // If we're inside an organization's repo
            rl.setPrompt(promptString.slice(0, -2).cyan + '('.cyan + currentOrg.yellow + ') > '.cyan);
            completions = commands[scope][0]['orgs'];
            currentRepo = undefined;
        }
        else {                              // If we're not in an organization's repo
            rl.setPrompt(promptString.cyan);
            completions = Object.keys(commands[scope][0]);
            currentOrg  = undefined;
        }
    }
    else {                                  // // If we're not inside an organization
        rl.setPrompt(promptString.cyan);
        completions = Object.keys(commands[scope][0]);
        currentRepo = undefined;
    }
}

function search(secCmd) {
    let matches = [];

    if (secCmd)                             // Repos that matching with 'secCmd'
        matches = matching(secCmd, false);
    else                                    // If there's not 'secCmd' and we're inside a repo, we add it
        if (currentRepo)
            matches.push(currentRepo);

    return (matches);
}
function clone(matches, assignment) {

    let logFilePath;
    if (currentOrg)
        logFilePath = `./${currentOrg}`;
    else
        logFilePath = '.';

    let assignmentName;
    if (assignment) {
        assignmentName = matches[0].split('-')[0];
        logFilePath += `/${assignmentName}`;
    }

    if (matches.length > 0) {
        if (currentOrg) {                     // If we're inside of an organization, create a folder for it
            var child2 = spawn('mkdir', ['-p', currentOrg]);

            if (assignment)                   // If we're cloning an assignment, create a folder for it
                var child3 = spawn('mkdir', ['-p', `${currentOrg}/${assignmentName}`]);
        }

        for (let i = 0; i < matches.length; i++) {
            var child;

            if (currentOrg)                 // Clone repos inside the organization folder and assignment folder
                if (assignment)
                    child = spawn('git', ['clone', '--progress', commands['orgs'][currentOrg.toString()][matches[i]].clone_url, `${currentOrg}/${assignmentName}/${matches[i]}`]);
                else
                    child = spawn('git', ['clone', '--progress', commands['orgs'][currentOrg.toString()][matches[i]].clone_url, `${currentOrg}/${matches[i]}`]);
            else                            // Clone simply repos
                child = spawn('git', ['clone', '--progress', commands['repos'][matches[i]].clone_url]);

            console.log(`Cloning ${matches[i]}...`.yellow.bold + " (see ".blue + `${matches[i]}.log`.blue.underline + " for more information)".blue);
            //let  t = new Spinner('Cloning '.yellow + matches[i].yellow + "...".yellow );
            //t.start();

            child.on('error', (err) => {
                console.log('Failed to start child process.');
            });

            child.stderr.on('data', (data) => {
                fs.writeFile(`${logFilePath}/${matches[i]}.log`,
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
        };
    }
    else
        console.log("Repository not found".red.bold);
    console.log('');
}

function assignments(cmds) {

    let matches = [];

    if (cmds[0]) {
        matches = matching(cmds[0], true);

        if (matches.length > 0) {
            if (!cmds[1])
                for (let i = 0; i < matches.length; i++)
                    console.log(matches[i] + "   ");
            else
                if (cmds[1] === 'clone')
                    clone(matches, true);
            console.log('');
        }
        else {
            console.log(`Assignment not found`.red.bold);
            console.log('');
        }
    }
    else {
        console.log(`Assignment not found`.red.bold);
        console.log('');
    }
}

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

    switch(cmd[0]) {
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
            organizations(cmd.slice(1)[0]);
            break;
        case 'repos':
            repositories(cmd.slice(1)[0]);
            break;
        case 'back':
            back_to();
            break;
        case 'clone':
            let matches = search(cmd.slice(1)[0]);
            clone(matches, false);
            break;
        case 'assignments':
            assignments(cmd.slice(1));
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
