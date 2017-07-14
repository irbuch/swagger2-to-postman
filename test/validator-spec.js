'use strict';
const expect = require('expect.js');
const validator = require('../').validator;
const nock = require('nock');

describe('validator tests', function () {

    before(function () {
        nock.cleanAll.bind(nock);
    });

    it('should return null validator if https.get status code != 200', function (done) {
        let server = nock('https://schema.getpostman.com')
            .get('/json/collection/v2.0.0/collection.json')
            .reply(404);

        validator.create(function (err, func) {
            expect(err.message).to.be('load schema request failed: 404');
            expect(server.isDone()).to.be.ok();
            expect(func).not.to.be.ok();
            done();
        });
    });

    it('should return null validator if https.get status code != 200 (promise)', function (done) {
        let server = nock('https://schema.getpostman.com')
            .get('/json/collection/v2.0.0/collection.json')
            .reply(404);

        validator.create().then(function (func) {
            expect(func).not.to.be.ok();
            done();
        }).catch(function (err) {
            expect(err.message).to.be('load schema request failed: 404');
            expect(server.isDone()).to.be.ok();
            done();
        });
    });

    it('should return null validator if https.get content-type not application/json', function (done) {
        let server = nock('https://schema.getpostman.com')
            .defaultReplyHeaders({
                'Content-Type': 'application/xml'
            })
            .get('/json/collection/v2.0.0/collection.json')
            .reply(200);

        validator.create(function (err, func) {
            expect(err.message).to.be(
                'load schema request failed: Expected application/json but received application/xml');
            expect(server.isDone()).to.be.ok();
            expect(func).not.to.be.ok();
            done();
        });
    });

    it('should return null validator if https.get payload not valid JSON', function (done) {
        let server = nock('https://schema.getpostman.com')
            .defaultReplyHeaders({
                'Content-Type': 'application/json'
            })
            .get('/json/collection/v2.0.0/collection.json')
            .reply(200, '{"name": "abc",}');

        validator.create(function (err, func) {
            expect(err.message).to.be('Unexpected token } in JSON at position 15');
            expect(server.isDone()).to.be.ok();
            expect(func).not.to.be.ok();
            done();
        });
    });

    it('should return null validator if https.get fails', function (done) {
        let server = nock('https://schema.getpostman.com')
            .get('/json/collection/v2.0.0/collection.json')
            .replyWithError('unexpected error');

        validator.create(function (err, func) {
            expect(err.message).to.be('unexpected error');
            expect(server.isDone()).to.be.ok();
            expect(func).not.to.be.ok();
            done();
        });
    });

    it('should return validator function on success', function (done) {
        nock.cleanAll();
        nock.enableNetConnect();

        validator.create(function (err, func) {
            expect(err).not.to.be.ok();
            expect(func).to.be.a('function');
            done();
        });
    });

    it('should return validator function on success (promise)', function (done) {
        nock.cleanAll();
        nock.enableNetConnect();

        validator.create().then(function (func) {
            expect(func).to.be.a('function');
            done();
        }).catch(done);
    });

});
