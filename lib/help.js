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

exports.helpDefinitions = helpDefinitions;