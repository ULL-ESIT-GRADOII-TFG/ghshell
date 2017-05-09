var fs      = require('fs');
var path    = require('path');
var colors  = require('colors');

module.exports = {
    getCurrentDirectoryBase : function() {
        return path.basename(process.cwd());
    },

    directoryExists : function(filePath) {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch (err) {
            return false;
        }
    },
    checkGitRepository : function() {
        if (this.directoryExists('.git')) {
            console.log('Already a git repository!'.red);
            process.exit();
        }
    }
};