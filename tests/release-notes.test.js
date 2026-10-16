const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('every versioned release has readable public highlights and current package version is first', () => {
    const root = path.resolve(__dirname, '..');
    const notes = require('../browser-client/release-notes.json');
    const log = fs.readFileSync(path.join(root, 'docs/更新紀錄.md'), 'utf8');
    const headings = [...log.matchAll(/^## (\d{4}-\d{2}-\d{2}) \/ v(\d+\.\d+\.\d+)/gm)].map((m) => `${m[1]}/${m[2]}`);
    assert.equal(notes[0].version, require('../package.json').version);
    assert.deepEqual(notes.map((e) => `${e.date}/${e.version}`), headings);
    for (const entry of notes) {
        assert.ok(entry.highlights.length > 0);
        for (const text of entry.highlights) {
            assert.equal(typeof text, 'string'); assert.ok(text.trim().length >= 8);
            assert.equal(/[A-Za-z]:\\|%APPDATA%|192\.168\.|PRIVATE KEY|\ufffd/.test(text), false);
        }
    }
});
