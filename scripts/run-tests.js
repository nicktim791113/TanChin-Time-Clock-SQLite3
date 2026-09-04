const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const testsDirectory = path.join(projectRoot, 'tests');
const testFiles = fs.readdirSync(testsDirectory)
  .filter((fileName) => fileName.endsWith('.test.js'))
  .sort()
  .map((fileName) => path.join('tests', fileName));

if (testFiles.length === 0) {
  console.error('找不到可執行的測試檔案。');
  process.exit(1);
}

const result = spawnSync(require('electron'), ['--test', ...testFiles], {
  cwd: projectRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
