var commands = {
    'main': [{
        'exit': {},
        'help': {},
        'list': {},
        'login': {},
        'logout': {},
        'orgs': {},
        'repos': {},
        'cd': ['exit', 'help', 'back'],
        'back': {}
    }]
};

exports.commands = commands;