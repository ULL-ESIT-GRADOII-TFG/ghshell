var commands = {
    'main': [{
        'exit': [],
        'help': [],
        'login': [],
        'logout': [],
        'orgs': ['exit', 'help', 'back', 'clone', 'repos', 'assignments', 'script', 'pwd'],
        'repos': ['exit', 'help', 'back', 'clone', 'script', 'pwd'],
        'back': [],
        'clone': [],
        'pwd': []
    }],
    'orgs': {},
    'repos': {}
};

exports.commands = commands;