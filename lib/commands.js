var commands = {
    'main': [{
        'exit': [],
        'help': [],
        'login': [],
        'logout': [],
        'orgs': ['exit', 'help', 'back', 'clone', 'repos', 'assignments', 'script', 'pwd', 'book'],
        'repos': ['exit', 'help', 'back', 'clone', 'script', 'pwd', 'owner', 'book'],
        'back': [],
        'clone': [],
        'pwd': []
    }],
    'orgs': {},
    'repos': {}
};

exports.commands = commands;