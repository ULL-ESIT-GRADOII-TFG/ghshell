var commands = {
    'main': [{
        'exit': {},
        'help': {},
        'login': {},
        'logout': {},
        'orgs': ['exit', 'help', 'back', 'clone', 'repos', 'assignments'],
        'repos': ['exit', 'help', 'back', 'clone'],
        'back': {},
        'clone': {}
    }],
    'orgs': {},
    'repos': {}
};

exports.commands = commands;