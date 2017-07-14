'use strict';
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');
const bundler = require('../').bundler;

function copyFixtures() {
    let fixtures = fs.readdirSync(path.join(__dirname, 'fixtures'));

    fixtures.forEach(function (file) {
        let src = path.join(__dirname, 'fixtures', file);
        let dst = '/tmp/' + file;

        fs.writeFileSync(dst, fs.readFileSync(src));
    });
}

describe('bundler tests', function () {

    before(function () {
        copyFixtures();
    });

    it('should bundle json files', function (done) {
        let filepath = '/tmp/spec.json';
        let options = {};

        bundler.bundle(filepath, options).then(function (bundle) {
            expect(bundle).to.be.ok();
            expect(bundle).to.have.key('security');
            expect(fs.existsSync('/tmp/bundle-spec.json')).to.be.ok();
            done();
        }).catch(function (err) {
            done(err);
        });

    });

    it('should bundle yaml files', function (done) {
        let filepath = '/tmp/spec.yaml';
        let options = {};

        bundler.bundle(filepath, options).then(function (bundle) {
            expect(bundle).to.be.ok();
            expect(bundle).to.have.key('security');
            expect(fs.existsSync('/tmp/bundle-spec.yaml')).to.be.ok();
            done();
        }).catch(function (err) {
            done(err);
        });

    });

    it('should bundle json files to specific filename', function (done) {
        let filepath = '/tmp/spec.json';
        let outfile = '/tmp/my-bundled-spec.json';
        let options = {
            output: outfile
        };

        bundler.bundle(filepath, options).then(function (bundle) {
            expect(bundle).to.be.ok();
            expect(bundle).to.have.key('security');
            expect(fs.existsSync(outfile)).to.be.ok();
            done();
        }).catch(function (err) {
            done(err);
        });

    });

    it('should fail to bundle files due to output file already exists', function (done) {
        let filepath = '/tmp/spec.json';
        let outfile = '/tmp/my-existing-spec.json';
        let options = {
            output: outfile
        };

        // touch the file before attempting to write file
        fs.writeFileSync(outfile, '');

        bundler.bundle(filepath, options).then(function (bundle) {
            expect(bundle).to.not.be.ok();
            done();
        }).catch(function (err) {
            expect(err).to.be.ok();
            done();
        });

    });
});
