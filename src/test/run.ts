import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'iam-vscode-'));
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'runner'),
      version: process.env.VSCODE_VERSION || '1.85.0',
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
      launchArgs: [
        '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
        `--user-data-dir=${path.join(temporary, 'user')}`, `--extensions-dir=${path.join(temporary, 'extensions')}`,
      ],
    });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
