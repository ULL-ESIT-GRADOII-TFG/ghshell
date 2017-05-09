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
    var completions = 'exit help list login orgs repos'.split(' ');
    var hits = completions.filter(function(c) {
        if (c.indexOf(line) === 0) {
            return c;
        }
    });
    return [hits && hits.length ? hits : completions, line];
}

function login() {
    /*rl.question('User: '.gray, function (user) {
     rl.question('Password: '.gray, function (password) {
     github.authenticate({
     type: "basic",
     username: user,
     password: password
     });

     //console.log('Logged in as ' + user.trim());
     rl.write(null, {name: 'enter'});
     });
     });*/
    var readlineSync = require('readline-sync');
    var user = readlineSync.question('User: ', {
        hideEchoBack: true
    });
    console.log(user);
    var password = readlineSync.question('Password: ', {
        hideEchoBack: true
    });
    console.log(password);
}

function listOrgs(obj) {
    console.log('');
    for(var i = 0; i < obj.data.length; i++)
        rl.output.write(obj.data[i].login + '   ');
    rl.write(null, {name: 'enter'});
}

intro();



/*github.authenticate({
 type: "token",
 token: "cceb9068c5266ad76ed926d06ce961b41486ca7f",
 });*/

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


/**********************************************************************************/


var colors = require('colors');
var GitHubApi = require('github');
var readlineSync = require('readline-sync');

function completer(line) {
    var completions = 'exit help list login orgs repos'.split(' ');
    var hits = completions.filter(function(c) {
        if (c.indexOf(line) === 0) {
            return c;
        }
    });
    return [hits && hits.length ? hits : completions, line];
}

function intro() {
    console.log('----------------------------');
    console.log('|          GHSHELL         |');
    console.log('----------------------------');
    console.log('');
}

function login () {
    console.log('Enter your GitHub credentials.');
    var user = readlineSync.question('User: ');
    var password = readlineSync.question('Password: ', {
        hideEchoBack: true
    });

    github.authenticate({
        type: "basic",
        username: user,
        password: password
    });

    console.log('Logged in as ' + user);
}

intro();

readlineSync.setDefaultOptions({
    prompt: 'ghshell > '.cyan
});

readlineSync.promptCLLoop({
    login: function () {
        login();
    },
    add: function(target, into) {
        console.log(target + ' is added into ' + into + '.');
        // Do something...
    },
    remove: function(target) {
        console.log(target + ' is removed.');
        // Do something...
    },
    bye: function() { return true; }
});
console.log('Exited');



/**********************************************************************************/

function complete(commands) {
    return function (str) {
        var i;
        var ret = [];
        for (i=0; i< commands.length; i++) {
            if (commands[i].indexOf(str) == 0)
                ret.push(commands[i]);
        }
        return ret;
    };
};


/**********************************************************************************/


var repl = require("repl");

var cmds = {
    "help" : function(input, context) {
        return "debug [setting]   Enables or disables debugging..."
    },
    "debug" : function(input, context) {
        var args = input.split(/\s+/).slice(1);

        var onoff = args[0];
        var verbosity = args[2];

        return "Debugging turned " + onoff + " with a verbosity of " + verbosity;
    },
    "exit": function(input, context) {
        process.exit();
    },
    "default" : function(input, context) {
        return "Command not understood";
    }
};

function eval(input, context, filename, callback) {
    var cmd = input.split(/\s+/)[0];
    var result = (cmds[cmd] || cmds["default"])(input, context);
    callback(null, result);
}

repl.start({
    prompt: "server:~$ ",
    eval: eval
});


/**********************************************************************************/

var cli = require('cline')();

cli.command('start', 'starts program', function () {
    cli.password('Password:', function (str) {
        console.log(str);
    })
});
cli.command('stop', function () {
    cli.confirm('Sure?', function (ok) {
        if (ok) {
            console.log('done');
        }
    })
});

cli.command('{string}', '', {string: '[A-Za-z]+'});
cli.command('{number}', '', {number: '\\d+'});

cli.on('command', function (input, cmd) {
    if ('start' !== cmd && 'stop' != cmd) {
        cli.prompt('More details on ' + cmd + ':');
    }
});

cli.history(['start', 'stop']);
cli.interact('>');

cli.on('history', function (item) {
    console.log('New history item ' + item);
});

cli.on('close', function () {
    console.log('History:' + cli.history());
    process.exit();
});