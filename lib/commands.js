var commands = {
    'main': [{
        'exit': {},
        'help': {},
        'login': {},
        'logout': {},
        'orgs': ['exit', 'help', 'back'],
        'repos': ['exit', 'help', 'back', 'clone'],
        'cd': ['exit', 'help', 'back'],
        'back': {},
        'clone': {}
    }],
    'orgs': [{
    }],
    'repos': {}
};

exports.commands = commands;