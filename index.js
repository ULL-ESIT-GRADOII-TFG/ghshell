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
var readlineSync = require('readline-sync');

var github = new GitHubApi({
    debug: false,
    protocol: "https",
    host: "api.github.com",
    followRedirects: false, // default: true; there's currently an issue with non-get redirects, so allow ability to disable follow-redirects
    timeout: 5000,
    Promise: Promise
});

/****************************************************************/
function getGithubCredentials(callback) {
    /*var questions = [
        {
            name: 'username',
            type: 'input',
            message: 'Enter your Github username or e-mail address:',
            validate: function( value ) {
                if (value.length) {
                    return true;
                } else {
                    return 'Enter your Github username or e-mail address';
                }
            }
        },
        {
            name: 'password',
            type: 'password',
            message: 'Enter your password:',
            validate: function(value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Enter your password';
                }
            }
        }
    ];

    inquirer.prompt(questions).then(callback);*/
    /*var user = readlineSync.question('User: ');
    var pass = readlineSync.question('Password: ', {
        hideEchoBack: true
    });*/

    var user = readlineSync.question('User: ');
    var pass = readlineSync.question('Password: ', {
        hideEchoBack: true
    });

    callback({username: user, password: pass});
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

var tkn = '';

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
            tkn = authed;
        }
    });
}

/****************************************************************/

clear();
console.log(
    figlet.textSync('ghshell', { horizontalLayout: 'full'}).yellow
);
console.log('');


readlineSync.setDefaultOptions({
    prompt: 'ghshell > '.cyan
});

readlineSync.promptCLLoop({
    login: function () {
        login();
        return true;
    },
    exit: function() { return true; }
});
console.log('Exited');