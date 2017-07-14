let chai = require('chai');
let assert = chai.assert;

let commands = require('../lib/commands').commands;

describe('Commands', () => {
    it("should be a valid object", () => {
        assert.isOk(commands);
        assert.typeOf(commands, 'object');
    });

    it("should have a 'main' property", () => {
        assert.property(commands, 'main');
    });

    it("should have an 'orgs' property", () => {
        assert.property(commands, 'orgs');
    });

    it("should have a 'repos' property", () => {
        assert.property(commands, 'repos');
    });

    describe("Commands' properties", () => {
        it("'main' property should be an array", () => {
            assert.isArray(commands['main']);
        });

        it("'orgs' property should be an object", () => {
            assert.isObject(commands['orgs']);
        });

        it("'repos' property should be an object", () => {
            assert.isObject(commands['repos']);
        });
    });
});