'use strict';
// Version-bound build adapter. It never executes the generated installer or uninstaller.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '24.13.3';
const MODULE_HASHES = Object.freeze({
    'out/targets/nsis/NsisTarget.js': '66d0cf22b1bbbefb866913edc634650e3fbdb8e1fa80671548c54914dec20def',
    'out/targets/nsis/nsisUtil.js': '14e658000fdcfa20938bd6db4b1cfefa6222c556dc49bd56cdc2a2d99cb1e98d'
});
// Generated with node:fs + SHA-256 from the locked, installed 24.13.3 template tree.
const TEMPLATE_HASHES = Object.freeze({
    'assistedInstaller.nsh': '8aa1230e9717b428664d613fcc5c6a060883410b34cb7853b517fe11b4ee0a76',
    'assistedMessages.yml': 'd746666825a7f98a55f06b58241f00006d684da0b03d04cc2037c3460e0c03c9',
    'common.nsh': '281e8071663d2ef3e9f00bb27e6ef09d2c2b52b85458da07082f2b186100e259',
    'empty-license.txt': '47d2a515ef2f05b87d688656286a61e4f743da4b878684c7654969db17711c40',
    'include/allowOnlyOneInstallerInstance.nsh': '2de9c776886f164c318b4e35614970becc4fa6c5b1ed4822aad03a826e50ae59',
    'include/extractAppPackage.nsh': 'e4174388a0f7a1df0b85a0742aa1ea7a4b2b18f9f29dccd6ef10a66212f68148',
    'include/FileAssociation.nsh': 'fa3cd1c80634e66a4494909aec1fc4a23575f7fae7ffa034a1cc6ff9e56e66e6',
    'include/getProcessInfo.nsh': '1aa6bd7afc8b82534c26c878d2716fd12b7e215b11e2d5becd0d605085b88590',
    'include/installer.nsh': '83c821c0f5b8a9c157af000b97f06b7ee99ab852fc2c9ccf7e5ad62dd8acc87a',
    'include/installUtil.nsh': '97bd546b5cd2aaf16b77bc9e2be8a18962dd74ab5c4d23b35b163ca89bf4dd2a',
    'include/nsProcess.nsh': 'c8057c110908425e03bca6a4a96fab853a4705844fb5fb6123e7191ce94d0e63',
    'include/StdUtils.nsh': 'e68d1bf7e4afd258b601346b833bf064285213d8f481caa900a1430cdabee275',
    'include/StrContains.nsh': '5050b692d091915c9f1083b558918c77b90f20683cb1b9e746890d61a79d550b',
    'include/UAC.nsh': 'abd701f2898f987041baa9d7ece9d0f8ee806eb5f7d85a4f39b6c60b8d638769',
    'include/webPackage.nsh': '2c0c0ab1ce525caf6ef908502d3ec007430986c3022c3987ccfaf021ddabe7b1',
    'installer.nsi': '468de2e9587b9036b3b025719c2843745d5224758851b04a56d95d90ed768b6e',
    'installSection.nsh': '74c4dbb4163cdd90ca4850b75d304e916235c882d6af7b5cdad63bffbc977072',
    'messages.yml': 'e19f48c2f7229ddab3f84c239b5408567f5ed350383c4f7e5985eae6bf2592db',
    'multiUser.nsh': 'afa9046492317e72e79e022cdb1f42edba4687ea605300bfc01c002f3106201c',
    'multiUserUi.nsh': 'f7a4524244e68dc0782a759e076e5e55fadef0f22bbccf33100a4ab59d69c066',
    'oneClick.nsh': '87d6c095f37716759c8d9373dcab906394546007abb626c04e1c784158f6de5b',
    'portable.nsi': '80fa75cf8cb68f4999eb92afc9f37f8e5b605cb1c3a077821bbc350a9b907a48',
    'README.md': '70ec429e1b386a11cd0b5854478205f9381b4a7f4eb720c2753df50edfa899c8',
    'uninstaller.nsh': 'cf22e42a863c186e281e208abd7574af2863c080f1fb6567fe6ee05c439c0f24'
});
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fail(message) { throw new Error('[static NSIS] ' + message); }
function validateInstallation({ platform = process.platform, env = process.env, libraryRoot = path.dirname(require.resolve('app-builder-lib/package.json')) } = {}) {
    if (platform !== 'win32') fail('Only the reviewed Windows build is supported.');
    if (env.ELECTRON_BUILDER_NSIS_DIR) fail('Custom NSIS tool directory is unsupported.');
    if (JSON.parse(fs.readFileSync(path.join(libraryRoot, 'package.json'), 'utf8')).version !== VERSION) fail('Unsupported app-builder-lib version; re-review the adapter before upgrading.');
    for (const [file, expected] of Object.entries(MODULE_HASHES)) if (hashFile(path.join(libraryRoot, file)) !== expected) fail('Module hash mismatch: ' + file);
    const templatesDir = path.join(libraryRoot, 'templates/nsis');
    const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) fail('Template symlink is unsupported.');
        return entry.isDirectory() ? walk(file) : [path.relative(templatesDir, file).split(path.sep).join('/')];
    });
    const actual = walk(templatesDir).sort(), expected = Object.keys(TEMPLATE_HASHES).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('Stock template manifest differs.');
    for (const [file, digest] of Object.entries(TEMPLATE_HASHES)) if (hashFile(path.join(templatesDir, file)) !== digest) fail('Template hash mismatch: ' + file);
    return { libraryRoot, templatesDir, builderVersion: VERSION, moduleHashes: MODULE_HASHES, templateHashes: TEMPLATE_HASHES };
}
function validateTarget(target, env = process.env) {
    if (env.ELECTRON_BUILDER_NSIS_DIR) fail('Custom NSIS tool directory is unsupported.');
    if (target.name !== 'nsis') fail('Only the stock nsis installer target is supported by this adapter.');
    for (const name of ['customNsisBinary', 'script', 'include']) if (target.options[name] != null) fail('Custom NSIS ' + name + ' is unsupported.');
}
function writeProof(file, proof) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const pending = file + '.tmp';
    fs.writeFileSync(pending, JSON.stringify(proof, null, 2) + '\n');
    fs.renameSync(pending, file);
}
// Dependencies are explicit so failure paths and order can be tested without any PE execution.
function makeStaticMethod({ templatesDir, reader, validate = validateTarget, record = () => {}, block = () => {} }) {
    return async function computeStaticUninstaller(defines, commands, installerPath, sharedHeader, archs) {
        validate(this);
        const packager = this.packager;
        if (await packager.getResource(this.options.script, 'installer.nsi')) fail('An implicit custom installer.nsi is unsupported.');
        if (await packager.getResource(this.options.include, 'installer.nsh')) fail('An implicit custom installer.nsh is unsupported.');
        const script = await fs.promises.readFile(path.join(templatesDir, 'installer.nsi'), 'utf8');
        const uninstallerPath = path.join(this.outDir, `__uninstaller-${this.name}-${packager.appInfo.sanitizedName}.exe`);
        block(installerPath); block(uninstallerPath);
        const entry = { installerPath, uninstallerPath, staticExtraction: false, status: 'compiling' };
        record(entry);
        try {
            // Keep the stock defines, script preparation and signing sequence unchanged.
            defines.BUILD_UNINSTALLER = null;
            defines.UNINSTALLER_OUT_FILE = uninstallerPath;
            await this.executeMakensis(defines, commands, sharedHeader + await this.computeFinalScript(script, false, archs));
            entry.helperSha256 = hashFile(installerPath); entry.status = 'extracting'; record(entry);
            await reader.exec(installerPath, uninstallerPath);
            entry.uninstallerUnsignedSha256 = hashFile(uninstallerPath);
            entry.staticExtraction = true; entry.status = 'signing'; record(entry);
            await packager.sign(uninstallerPath, 'signing NSIS uninstaller');
            entry.uninstallerSha256 = hashFile(uninstallerPath); entry.status = 'ready'; record(entry);
            delete defines.BUILD_UNINSTALLER;
            defines.UNINSTALLER_OUT_FILE = uninstallerPath;
            return script;
        } catch (error) {
            entry.failurePhase = entry.status; entry.status = 'failed'; record(entry);
            throw error; // Deliberately no Wine/VM/native-executable fallback.
        }
    };
}
function installStaticUninstaller() {
    const proofPath = process.env.TANCHIN_NSIS_PROOF_PATH, runId = process.env.TANCHIN_NSIS_STATIC_RUN_ID;
    if (!proofPath || !runId) fail('Build wrapper proof context is required.');
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    if (proof.runId !== runId) fail('Build proof identity differs.');
    const installation = validateInstallation();
    proof.guard = { builderVersion: VERSION, moduleHashes: MODULE_HASHES, templateHashes: TEMPLATE_HASHES };
    proof.adapterSha256 = hashFile(__filename); proof.helperExecutionAttempts = 0;
    writeProof(proofPath, proof);
    const blocked = new Set(), childProcess = require('node:child_process');
    // Fail closed if any dependency attempts to launch either generated PE directly.
    for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
        const original = childProcess[name];
        childProcess[name] = function (file, ...args) {
            if (typeof file === 'string' && blocked.has(path.resolve(file).toLowerCase())) {
                proof.helperExecutionAttempts++; writeProof(proofPath, proof);
                fail('Generated installer/uninstaller execution is disabled during build.');
            }
            return original.call(this, file, ...args);
        };
    }
    const { NsisTarget } = require(path.join(installation.libraryRoot, 'out/targets/nsis/NsisTarget.js'));
    const { UninstallerReader } = require(path.join(installation.libraryRoot, 'out/targets/nsis/nsisUtil.js'));
    NsisTarget.prototype.computeScriptAndSignUninstaller = makeStaticMethod({ templatesDir: installation.templatesDir, reader: UninstallerReader,
        validate(target) { validateInstallation(); validateTarget(target); },
        block(file) { blocked.add(path.resolve(file).toLowerCase()); },
        record(entry) {
            const index = proof.entries.findIndex((item) => item.installerPath === entry.installerPath);
            if (index < 0) proof.entries.push({ ...entry }); else proof.entries[index] = { ...entry };
            writeProof(proofPath, proof);
        } });
}
module.exports = { VERSION, MODULE_HASHES, TEMPLATE_HASHES, hashFile, validateInstallation, validateTarget, writeProof, makeStaticMethod, installStaticUninstaller };
if (process.env.TANCHIN_NSIS_STATIC_PRELOAD === '1') installStaticUninstaller();
