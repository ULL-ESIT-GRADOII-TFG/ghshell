var commands = {
    'main': [{
        'exit': {},
        'help': {},
        'list': {},
        'login': {},
        'logout': {},
        'orgs': ['exit', 'help', 'back'],
        'repos': ['exit', 'help', 'back'],
        'cd': ['exit', 'help', 'back'],
        'back': {}
    }],
    'orgs': [{
    }]
};

exports.commands = commands;