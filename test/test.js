var assert = require('chai').assert;
var str = require('../index');

describe('#str', function () {
    it ('should return an string', function () {
        assert.typeOf(str(), 'string');
    });

    it ('should return the same string', function () {
        assert.equal(str(), "This is my first NPM package");
    });

});