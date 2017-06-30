#! /usr/bin/env node

let colors       = require('colors');
let clear        = require('clear');
let CLI          = require('clui');
let Spinner      = CLI.Spinner;
let figlet       = require('figlet');
let UserSettings = require('user-settings');
let GitHubApi    = require('github');
let Promise      = require('bluebird');
let timestamp    = require('time-stamp');
let lineByLine   = require('n-readlines');
let _            = require('underscore');
let columnify    = require('columnify');

const fs         = require('fs');
const files      = require('./lib/files');
const readline   = require('readline');
const crypto     = require('crypto');
const path       = require('path');
const { spawn }  = require('child_process');
const util       = require('util');
const exec       = util.promisify(require('child_process').exec);

let commands     = require('./lib/commands').commands;

const promptString = 'ghshell > ';

let prefs = UserSettings.file('.ghshell');
let homedir = process.env.HOME || process.env.USERPROFILE;
let seed = (() => {
    let key = path.join(homedir, '.ssh', 'id_rsa');
    try {
        return fs.readFileSync(key).toString('utf8')    // Use private SSH key as seed
    } catch (e) {
        return crypto.randomBytes(256).toString('hex'); // or random string
    }
})();
let scope = 'main';
let completions = Object.keys(commands[scope][0]);
let currentRepo = undefined;
let currentOrg  = undefined;
let matches;
let helpDefinitions = {
    back: {
        command    : 'back',
        description: 'return from a repository or organization to the main level'.grey,
        usage      : 'back'.red
    },
    clone: {
        command    : 'clone',
        description: [
            "clone current repository (if we're inside)".grey,
            "clone repositories that match with ".grey + "string|regexp".grey.italic.bold
        ].join('\n'),
        usage      : [
            'clone'.red,
            'clone'.red + ' string | /regexp/'
        ].join('\n')
    },
    exit: {
        command    : 'exit',
        description: 'cause normal ghshell termination'.grey,
        usage      : 'exit'.red
    },
    help: {
        command    : 'help',
        description: 'display this message'.grey,
        usage      : 'help'.red
    },
    login: {
        command    : 'login',
        description: "sign in a Github's user".grey,
        usage      : 'login'.red
    },
    logout: {
        command    : 'logout',
        description: "sign out a Github's user".grey,
        usage      : 'logout'.red
    },
    orgs: {
        command    : 'orgs',
        description: [
            "select a Github user's organizations".grey,
            "list the Github user's organizations".grey
        ].join('\n'),
        usage      : [
            'orgs'.red,
            'orgs'.red + ' -l',
        ].join('\n')
    },
    owner: {
        command    : 'owner',
        description: "get the repo's owner and contributors (if we're inside an Org)".grey,
        usage      : 'owner'.red
    },
    pwd: {
        command    : 'pwd',
        description: "show the ghshell's current working path".grey,
        usage      : 'pwd'.red
    },
    repos: {
        command    : 'repos',
        description: [
            "select a repository".grey,
            "list all the repositories".grey,
            "list the repositories that match with ".grey + "string|regexp".grey.italic.bold
        ].join('\n'),
        usage      : [
            'repos'.red,
            'repos'.red + ' -l',
            'repos'.red + ' string | /regexp/'
        ].join('\n')
    },
    assignments: {
        command    : 'assignments',
        description: [
            "list the assignments that match with ".grey + "string|regexp".grey.italic.bold,
            "clone the assignments that match with ".grey + "string|regexp".grey.italic.bold,
            "create a Gitbook for the assignments that match with ".grey + "string|regexp".grey.italic.bold,
            "exec a script on assignments that match with ".grey + "string|regexp".grey.italic.bold,
            "NOTE".grey.underline + ": file's path can be absolute or relative".grey
        ].join('\n'),
        usage      : [
            "assignments".red.underline + " string | /regexp/",
            "assignments".red.underline + " string | /regexp/ " + "clone".underline,
            "assignments".red.underline + " string | /regexp/ " + "book".underline,
            "assignments".red.underline + " string | /regexp/ " + "script".underline + " 'file'"
        ].join('\n')
    },
    script: {
        command    : 'script',
        description: [
            "exec a script on current repository (if we're inside)".grey,
            "exec a script on repositories that match with ".grey + "regexp".grey.italic.bold,
            "NOTE".grey.underline + ": file's path can be absolute or relative".grey
        ].join('\n'),
        usage      : [
            "script".red.underline + " 'file'",
            "script".red.underline + " 'file' /regexp/"
        ].join('\n')
    },
    book: {
        command    : 'book',
        description: [
            "create a Gitbook for the current repository (if we're inside)".grey,
            "create a Gitbook for the repositories that match with ".grey + "string|regexp".grey.italic.bold
        ].join('\n'),
        usage      : [
            'book'.red,
            'book'.red + ' string | /regexp/'
        ].join('\n')
    }
};

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
        }).then();
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

let orgs = [];
let h = {};
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
            owner: {
                login: h[organization][i]['owner'].login
            },
            clone_url: h[organization][i].clone_url,
            contributors: []
        };

        github.repos.getContributors({                             // Get contributors
            owner: h[organization][i]['owner'].login,
            repo: h[organization][i].name
        }).then((res) => {
            for (let j = 0; j < res['data'].length; j++)
                commands['orgs'][organization][h[organization][i].name]['contributors'].push(res['data'][j]['login']);
        })
    }
}

function getOrgsRepos(organization) {
    github.repos.getForOrg({
        org: organization,
        per_page: 100
    }).then((result) => {
        listOrgRepos('', result, organization);
    });
}

function listOrgRepos(err, response, organization) {
    if (err || !organization)
        return false;

    h[organization] = h[organization].concat(response['data']);

    if (github.hasNextPage(response)) {
        storeOrgRepos(organization);
        github.getNextPage(response, listOrgRepos);
    }
    else
        storeOrgRepos(organization);
}

let rep = [];

function store() {
    for(let i = 0; i < rep.length; i++) {
        commands['repos'][rep[i].name] = {
            owner: {
                login: rep[i]['owner'].login
            },
            clone_url: rep[i].clone_url
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
    else
        store();
}

function getRepos() {
    github.repos.getAll({
        affiliation: 'owner',
        per_page: 100
    }).then((result) => {
        listRepos('', result)
    });
}

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
                let input = evalInput(secCmd);
                let str = input instanceof RegExp ? input.source : input;
                console.log(secCmd);
                console.log(`Repository ${str.underline} not found`.red.bold);
                console.log('');
            }
        }
    }
}

function getOwner() {
    if (currentOrg) {
        if (currentRepo) {
            let owner = commands['orgs'][currentOrg][currentRepo]['owner']['login'];
            let contributors = commands['orgs'][currentOrg][currentRepo]['contributors'];
            rl.write(null, {name: 'enter'});
            console.log(`Owner: `.blue.bold + `${owner}`);
            console.log(`Contributors: `.blue.bold + `${contributors}`);
        }
    }
    else
        if (currentRepo) {
            let owner = commands['repos'][currentRepo]['owner']['login'];
            console.log(`Owner: `.blue.bold + `${owner}`);
            rl.write(null, {name: 'enter'});
        }
    console.log('');
}

function evalInput(input) {
    let output;

    try {                                   // RegExp
        output = eval(input);
        if (output instanceof RegExp)
            return output;
        else
            return input;
    }
    catch (err) {                           // String
        output = input;
        return output;
    }
}

function matching(secCmd, assignment) {
    let matchOn = evalInput(secCmd);
    let matches = [];

    if (matchOn instanceof RegExp) {
        if (currentOrg)                     // We're inside of an organization
            matches = Object.keys(commands['orgs'][currentOrg]).filter(s => matchOn.test(s));
        else
            matches = Object.keys(commands['repos']).filter(s => matchOn.test(s));
    }
    else {
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

function setLogFilePath(match, assignment) {

    let logFilePath;
    if (currentOrg)
        logFilePath = `./${currentOrg}`;
    else
        logFilePath = '.';

    if (assignment)
        logFilePath += `/${match}`;

    return logFilePath;
}

function getAssignmentName(repo1, repo2) {
    if (repo1)
        if(!repo2)
            return (repo1.split('-')[0]);
        else
            return (_.intersection(repo1.split('-'), repo2.split('-')));
}

function clone(searchKey, matches, assignment) {

    let assignmentName;

    if (assignment)
        assignmentName = getAssignmentName(matches[0], matches[1]);

    let logFilePath = setLogFilePath(assignmentName, assignment);

    if (matches.length > 0) {
        if (currentOrg) {                     // If we're inside of an organization, create a folder for it
            spawn('mkdir', ['-p', currentOrg]);

            if (assignment)                   // If we're cloning an assignment, create a folder for it
                spawn('mkdir', ['-p', `${currentOrg}/${assignmentName}`]);
        }

        for (let i = 0; i < matches.length; i++) {
            let child;

            if (currentOrg)                 // Clone repos inside the organization folder and assignment folder
                if (assignment)
                    child = spawn('git', ['clone', '--progress', commands['orgs'][currentOrg.toString()][matches[i]].clone_url, `${currentOrg}/${assignmentName}/${matches[i]}`]);
                else
                    child = spawn('git', ['clone', '--progress', commands['orgs'][currentOrg.toString()][matches[i]].clone_url, `${currentOrg}/${matches[i]}`]);
            else                            // Clone simply repos
                child = spawn('git', ['clone', '--progress', commands['repos'][matches[i]].clone_url]);

            console.log(`Cloning ${matches[i]}...`.yellow.bold + " (see ".blue + `${matches[i]}-clone.log`.blue.underline + " for more information)".blue);

            child.on('error', (err) => {
                console.log(`Failed to start child process: ${err}`);
            });

            child.stderr.on('data', (data) => {
                if (data.slice(-1) !== '\n')
                    data += '\n';
                fs.writeFile(`${logFilePath}/${matches[i]}-clone.log`,
                    "[" + timestamp('YYYY/MM/DD-HH:mm:ss') + "] " + data,
                    {flag: 'a'}, () => {
                    }
                );
            });
        }
    }
    else {
        if (searchKey) {
            let input = evalInput(searchKey);
            let str = input instanceof RegExp ? input.source : input;
            console.log(`Repository ${str.underline} not found`.red.bold);
        }
        else
            console.log(`Error! Bad syntax`.red.bold);
    }
    console.log('');
}

async function assignments(cmds) {

    let matches = [];

    if (cmds[0]) {
        matches = matching(cmds[0], true);

        if (matches.length > 0) {
            if (!cmds[1]) {
                for (let i = 0; i < matches.length; i++)
                    console.log(matches[i] + "   ");
                console.log('');
            }
            else {
                if (cmds[1] === 'clone')
                    clone(cmds[0], matches, true);
                if (cmds[1] === 'script')
                    await runScript(cmds[2], cmds[0], matches, true);
                if (cmds[1] === 'book')
                    book(cmds[0], matches, true, undefined);
            }
        }
        else {
            let input = evalInput(cmds[0]);
            let str = input instanceof RegExp ? input.source : input;
            console.log(`Assignment ${str.underline} not found`.red.bold);
            console.log('');
        }
    }
    else {
        console.log(`Error! Bad syntax`.red.bold);
        console.log('');
    }
}

async function pwd() {
    const {stdout} = await exec('pwd');
    console.log(stdout);
}

async function runScript(filePath, searchKey, matches, assignment) {

    if (filePath) {
        let fullPathFile = (path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath));

        if (files.fileExists(fullPathFile)) {
            if (matches.length !== 0) {
                let logFilePath = setLogFilePath(matches[0].split('-')[0], assignment);

                for (let i = 0; i < matches.length; i++) {
                    if (files.directoryExists(`${logFilePath}/${matches[i]}`)) {
                        let dstPathFile = `${logFilePath}/${matches[i]}/${path.basename(fullPathFile)}`;
                        fs.writeFileSync(dstPathFile, fs.readFileSync(fullPathFile));

                        let liner = new lineByLine(dstPathFile);
                        let line;
                        while (line = liner.next()) {
                            const {stdout} = await exec(`(cd ${logFilePath}/${matches[i]}; ${line.toString()})`);
                            fs.writeFile(`${logFilePath}/${matches[i]}-${path.basename(fullPathFile)}.log`,
                                "[" + timestamp('YYYY/MM/DD-HH:mm:ss') + "] " + stdout + "\n",
                                {flag: 'a'}, () => {
                                }
                            );
                        }
                        console.log(`Execution of ${path.basename(fullPathFile).underline} in ${matches[i].underline} has finished`.green.bold);
                    }
                    else
                        console.log(`Repository ${matches[i].underline} not found. Try to clone it first!`.red.bold);
                }
            }
            else {
                if (searchKey) {
                    let input = evalInput(searchKey);
                    let str = input instanceof RegExp ? input.source : input;
                    console.log(`There's not repositories that match with ${str.underline}`.red.bold);
                }
                else
                    console.log("Syntax error! There's not target repos".red.bold);
            }
        }
        else
            console.log(`Error! File ${path.basename(fullPathFile).underline} not found`.red.bold);
    }
    else
        console.log('Syntax error! No file provided'.red.bold);
    console.log('');
}

function showHelp() {
    let help;

    if (currentRepo)                                     // Organization help scope
        help = commands[scope][0]['repos'].sort();
    else if (currentOrg)                               // Repository help scope
        help = commands[scope][0]['orgs'].sort();
    else                                                // Main help scope
        help = Object.keys(commands[scope][0]).sort();

    let contextCommands = [];
    for (let i = 0; i < help.length; i++)
        contextCommands.push(helpDefinitions[help[i]]);

    let columns = columnify(contextCommands, {
        minWidth: 13,
        preserveNewLines: true,
        config: {
            description: {minWidth: 60}
        }
    });

    console.log(columns);
    console.log('');
}

async function createBook(filePath, match) {
    await exec(`mkdir -p ${filePath}/${match}_gitbook`);
    await exec(`gitbook init ${filePath}/${match}_gitbook`);
    await exec(`ls ${filePath} | grep ${match} | grep .log`).then((ls) => {
        let res = ls['stdout'].split('\n');
        res.splice(-1, 1);

        for (let i = 0; i < res.length; i++) {
            let nameFile = res[i].substring(0, res[i].length - 4);
            let title = nameFile.split('-').pop();
            fs.writeFileSync(`${filePath}/${match}_gitbook/${nameFile}.md`,`# ${title}\n\n`);
            fs.writeFileSync(`${filePath}/${match}_gitbook/${nameFile}.md`, fs.readFileSync(`${filePath}/${match}-${title}.log`), {flag: 'a'});
            fs.writeFileSync(`${filePath}/${match}_gitbook/SUMMARY.md`,`* [${title}](${nameFile}.md)\n`, {flag: 'a'});
        }
    });
}

async function buildBook(filePath, match) {
    let childBook = await spawn('gitbook', ['build', `${filePath}/${match}_gitbook`]);
    await childBook.stdout.on('data', (data) => {
        fs.writeFile(`${filePath}/${match}-gitbook_build.out`,
            "[" + timestamp('YYYY/MM/DD-HH:mm:ss') + "] " + data,
            {flag: 'a'}, () => {
            }
        );
    });
}

function bookToPdf(filePath, match) {
    let childBookPDF = spawn('gitbook', ['pdf', `${filePath}/${match}_gitbook`, `${filePath}/${match}.pdf`]);
    childBookPDF.stdout.on('data', (data) => {
        fs.writeFile(`${filePath}/${match}-gitbook_pdf.out`,
            "[" + timestamp('YYYY/MM/DD-HH:mm:ss') + "] " + data,
            {flag: 'a'}, () => {
            }
        );
    });
}


function book(searchKey, matches, assignment) {

    let assignmentName;

    if (assignment)
        assignmentName = getAssignmentName(matches[0], matches[1]);

    let logFilePath = setLogFilePath(assignmentName, assignment);

    if (matches.length > 0) {
        let logFilePath = setLogFilePath(matches[0].split('-')[0], assignment);

        for (let i = 0; i < matches.length; i++) {
            if (files.directoryExists(`${logFilePath}/${matches[i]}`)) {
                createBook(logFilePath, matches[i]).then(() => {
                    buildBook(logFilePath, matches[i]).then(() => {
                        bookToPdf(logFilePath, matches[i]);
                    });
                });
                console.log(`Book ${matches[i].underline} created successfully!`.green.bold);
                console.log(`Book ${matches[i].underline} exported to PDF successfully!`.green.bold);
            }
            else
                console.log(`Repository ${matches[i].underline} not found. Try to clone it first!`.red.bold);
        }
    }
    else {
        if (searchKey) {
            let input = evalInput(searchKey);
            let str = input instanceof RegExp ? input.source : input;
            console.log(`There's not repositories that match with ${str.underline} for create a book`.red.bold);
        }
        else
            console.log(`Error! Bad syntax`.red.bold);
    }
    console.log('');
}

/****************************************************************/
clear();
console.log(figlet.textSync('ghshell', { horizontalLayout: 'default'}).yellow);
console.log('');
console.log('');
login();

rl.prompt();


rl.on('line', async (line) => {
    let cmd = line.trim().split(' ');

    switch(cmd[0]) {
        case 'help':
            showHelp();
            break;
        case 'login':
            login();
            break;
        case 'logout':
            logout();
            break;
        case 'orgs':
            organizations(cmd[1]);
            break;
        case 'repos':
            repositories(cmd[1]);
            break;
        case 'back':
            back_to();
            break;
        case 'clone':
            matches = search(cmd[1]);
            clone(cmd[1], matches, false);
            break;
        case 'assignments':
            await assignments(cmd.slice(1));
            break;
        case 'pwd':
            await pwd();
            break;
        case 'script':
            matches = search(cmd[2]);
            await runScript(cmd[1], cmd[2], matches, false);
            break;
        case 'owner':
            getOwner();
            break;
        case 'book':
            matches = search(cmd[1]);
            book(cmd[1], matches, false);
            break;
        case 'exit':
            process.exit(0);
    }
    rl.prompt();
}).on('close', () => {
    console.log('');
    process.exit(0);
});
