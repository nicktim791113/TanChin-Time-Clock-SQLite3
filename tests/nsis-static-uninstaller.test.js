const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { VERSION, validateInstallation, validateTarget, makeStaticMethod, hashFile } = require('../scripts/nsis-static-uninstaller.cjs');

test('installed stock modules and all template hashes match the reviewed version', () => {
    const result = validateInstallation({ platform: 'win32', env: {} });
    assert.equal(result.builderVersion, VERSION);
    assert.equal(Object.keys(result.templateHashes).length, 24);
});
test('platform, version, module drift and custom NSIS options fail closed before use', (t) => {
    assert.throws(() => validateInstallation({ platform: 'linux', env: {} }), /Only the reviewed Windows/);
    assert.throws(() => validateInstallation({ platform: 'win32', env: { ELECTRON_BUILDER_NSIS_DIR: 'different-tool' } }), /Custom NSIS/);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-static-nsis-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '25.0.0' }));
    assert.throws(() => validateInstallation({ platform: 'win32', env: {}, libraryRoot: root }), /Unsupported app-builder-lib version/);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: VERSION }));
    fs.mkdirSync(path.join(root, 'out/targets/nsis'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out/targets/nsis/NsisTarget.js'), 'unreviewed module');
    assert.throws(() => validateInstallation({ platform: 'win32', env: {}, libraryRoot: root }), /Module hash mismatch/);
    const installed = path.dirname(require.resolve('app-builder-lib/package.json'));
    for (const file of ['NsisTarget.js', 'nsisUtil.js']) fs.copyFileSync(path.join(installed, 'out/targets/nsis', file), path.join(root, 'out/targets/nsis', file));
    fs.cpSync(path.join(installed, 'templates/nsis'), path.join(root, 'templates/nsis'), { recursive: true });
    fs.appendFileSync(path.join(root, 'templates/nsis/installer.nsi'), '\n; unreviewed template');
    assert.throws(() => validateInstallation({ platform: 'win32', env: {}, libraryRoot: root }), /Template hash mismatch/);
    fs.writeFileSync(path.join(root, 'templates/nsis/unreviewed.nsh'), 'extra template');
    assert.throws(() => validateInstallation({ platform: 'win32', env: {}, libraryRoot: root }), /template manifest differs/);
    for (const name of ['customNsisBinary', 'script', 'include']) assert.throws(() => validateTarget({ name: 'nsis', options: { [name]: 'custom' } }, {}), /Custom NSIS/);
    assert.throws(() => validateTarget({ name: 'nsis-web', options: {} }, {}), /Only the stock nsis/);
});
test('the upstream static reader rejects malformed input without producing an uninstaller', async (t) => {
    const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-static-nsis-invalid-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const input = path.join(root, 'invalid.bin'), output = path.join(root, 'output.bin');
    fs.writeFileSync(input, 'not a portable executable');
    await assert.rejects(UninstallerReader.exec(input, output), /Invalid 'MZ' signature/);
    assert.equal(fs.existsSync(output), false);
});
function fixture(t, failAt = '') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-static-nsis-method-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'installer.nsi'), 'STOCK SCRIPT');
    const installer = path.join(root, 'Setup.exe'), uninstaller = path.join(root, '__uninstaller-nsis-Fixture.exe');
    const calls = [], proof = [], blocked = [], defines = {}, commands = { OutFile: installer }, archs = new Map();
    const target = { name: 'nsis', options: {}, outDir: root, packager: { appInfo: { sanitizedName: 'Fixture' },
        getResource: async () => null,
        async sign(file, description) {
            calls.push('sign'); assert.equal(file, uninstaller); assert.equal(description, 'signing NSIS uninstaller');
            assert.equal(fs.readFileSync(file, 'utf8'), 'EXTRACTED UNINSTALLER');
            if (failAt === 'sign') throw new Error('fixture signing failure');
            fs.appendFileSync(file, ' SIGNED');
        } },
        async computeFinalScript(script, isInstaller, actualArchs) { calls.push('script'); assert.equal(isInstaller, false); assert.equal(script, 'STOCK SCRIPT'); assert.equal(actualArchs, archs); return 'GENERATED SCRIPT'; },
        async executeMakensis(actualDefines, actualCommands, script) {
            calls.push('compile'); assert.equal(actualDefines, defines); assert.equal(actualCommands, commands);
            assert.equal(script, 'HEADER GENERATED SCRIPT'); assert.equal(defines.BUILD_UNINSTALLER, null); assert.equal(defines.UNINSTALLER_OUT_FILE, uninstaller);
            if (failAt === 'compile') throw new Error('fixture compiler failure');
            fs.writeFileSync(installer, 'COMPILED HELPER — NEVER EXECUTED');
        } };
    Object.defineProperty(target.packager, 'vm', { get() { assert.fail('VM fallback must never be accessed'); } });
    const method = makeStaticMethod({ templatesDir: root, validate: (value) => { calls.push('validate'); assert.equal(value, target); },
        reader: { async exec(input, output) {
            calls.push('extract'); assert.equal(input, installer); assert.equal(output, uninstaller);
            if (failAt === 'parse') throw new Error('fixture parser failure');
            fs.writeFileSync(output, 'EXTRACTED UNINSTALLER');
        } }, block: (file) => blocked.push(file), record: (entry) => proof.push({ ...entry }) });
    return { target, method, calls, proof, blocked, installer, uninstaller, defines, commands, archs };
}
test('stock compile/extract/sign order and defines are retained, with durable hash evidence', async (t) => {
    const f = fixture(t);
    assert.equal(await f.method.call(f.target, f.defines, f.commands, f.installer, 'HEADER ', f.archs), 'STOCK SCRIPT');
    assert.deepEqual(f.calls, ['validate', 'script', 'compile', 'extract', 'sign']);
    assert.deepEqual(f.blocked, [f.installer, f.uninstaller]);
    assert.equal(Object.hasOwn(f.defines, 'BUILD_UNINSTALLER'), false);
    assert.equal(f.defines.UNINSTALLER_OUT_FILE, f.uninstaller);
    const last = f.proof.at(-1);
    assert.equal(last.status, 'ready'); assert.equal(last.staticExtraction, true);
    assert.equal(last.helperSha256, hashFile(f.installer));
    assert.equal(last.uninstallerSha256, hashFile(f.uninstaller));
    assert.notEqual(last.uninstallerUnsignedSha256, last.uninstallerSha256);
});
for (const failAt of ['compile', 'parse', 'sign']) test(failAt + ' failure stops without execution fallback or false success', async (t) => {
    const f = fixture(t, failAt);
    await assert.rejects(f.method.call(f.target, f.defines, f.commands, f.installer, 'HEADER ', f.archs), /fixture .* failure/);
    assert.equal(f.proof.at(-1).status, 'failed');
    if (failAt !== 'sign') assert.equal(f.calls.includes('sign'), false);
    if (failAt === 'parse') assert.equal(f.proof.at(-1).staticExtraction, false);
    assert.equal(f.calls.includes('execute'), false);
});
test('implicit project installer or include is rejected before compilation and signing', async (t) => {
    for (const custom of ['installer.nsi', 'installer.nsh']) {
        const f = fixture(t);
        f.target.packager.getResource = async (_option, name) => name === custom ? path.join('build', custom) : null;
        await assert.rejects(f.method.call(f.target, f.defines, f.commands, f.installer, 'HEADER ', f.archs), /implicit custom/);
        assert.deepEqual(f.calls, ['validate']);
    }
});
