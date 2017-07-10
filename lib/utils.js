const crypto = require('crypto');
let fs       = require('fs');
let path     = require('path');

let homeDir = process.env.HOME || process.env.USERPROFILE;
let seed = (() => {
    let key = path.join(homeDir, '.ssh', 'id_rsa');
    try {
        return fs.readFileSync(key).toString('utf8')    // Use private SSH key as seed
    } catch (e) {
        return crypto.randomBytes(256).toString('hex'); // or random string
    }
})();

module.exports = {
    encode: (text) => {
        let cipher = crypto.createCipher('aes128', seed);
        return cipher.update(new Buffer(text).toString('utf8'), 'utf8', 'hex') + cipher.final('hex')
    },

    decode: (text) => {
        let decipher = crypto.createDecipher('aes128', seed);
        return decipher.update(String(text), 'hex', 'utf8') + decipher.final('utf8')
    }
};