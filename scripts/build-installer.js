#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { validateInstallation, hashFile, writeProof } = require('./nsis-static-uninstaller.cjs');
const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let proofPath = path.join(projectRoot, 'dist/nsis-static-build-proof.json');
const proofIndex = args.indexOf('--static-uninstaller-proof');
if (proofIndex >= 0) {
    if (!args[proofIndex + 1] || args[proofIndex + 1].startsWith('--')) throw new Error('--static-uninstaller-proof requires a path.');
    proofPath = path.resolve(args[proofIndex + 1]); args.splice(proofIndex, 2);
}
const proof = { schemaVersion: 1, runId: crypto.randomUUID(), startedAt: new Date().toISOString(), status: 'preparing',
    wrapperSha256: hashFile(__filename), staticExtraction: false, helperExecutionAttempts: 0, entries: [] };
writeProof(proofPath, proof);
function finish(code, error = null) {
    let latest = proof;
    if (fs.existsSync(proofPath)) {
        latest = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
        if (latest.runId !== proof.runId) throw new Error('Concurrent build changed proof identity.');
    }
    if (code === 0) try {
        for (const entry of latest.entries) {
            if (!entry.staticExtraction || entry.status !== 'ready') throw new Error('An uninstaller extraction did not complete.');
            entry.finalInstallerSha256 = hashFile(entry.installerPath);
        }
    } catch (failure) { code = 1; error = failure; }
    latest.buildExitCode = code; latest.status = code === 0 ? 'complete' : 'failed'; latest.completedAt = new Date().toISOString();
    latest.staticExtraction = code === 0 && latest.entries.length > 0 && latest.entries.every((entry) => entry.staticExtraction && entry.status === 'ready');
    if (error) latest.error = error.message;
    writeProof(proofPath, latest);
    console.log('[static NSIS] Build proof: ' + proofPath);
    process.exitCode = code;
}
try {
    validateInstallation();
    const cli = require.resolve('electron-builder/cli.js');
    // The installed CLI parses all normal electron-builder arguments unchanged.
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'nsis-static-uninstaller.cjs'), cli, ...args], {
        cwd: projectRoot, stdio: 'inherit', windowsHide: true,
        env: { ...process.env, TANCHIN_NSIS_STATIC_PRELOAD: '1', TANCHIN_NSIS_PROOF_PATH: proofPath, TANCHIN_NSIS_STATIC_RUN_ID: proof.runId }
    });
    child.once('error', (error) => finish(1, error));
    child.once('exit', (code, signal) => { try { finish(code ?? 1, signal ? new Error('Builder terminated by ' + signal) : null); } catch (error) { console.error(error.message); process.exitCode = 1; } });
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
} catch (error) { finish(1, error); }
