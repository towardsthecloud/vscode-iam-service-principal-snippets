import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

const cases: { title: string; body: () => Promise<void> }[] = [];
export function test(title: string, body: () => Promise<void>): void { cases.push({ title, body }); }

export async function run(): Promise<void> {
  require('./extension.test');
  const results: { title: string; passed: boolean; error?: string }[] = [];
  for (const { title, body } of cases) {
    try { await body(); results.push({ title, passed: true }); console.log(`PASS ${title}`); }
    catch (error) { results.push({ title, passed: false, error: String(error) }); console.error(`FAIL ${title}: ${error}`); }
  }
  const failures = results.filter(result => !result.passed).length;
  const report = process.env.IAM_TEST_REPORT || path.resolve(__dirname, '../../test-results/vscode.json');
  await fs.mkdir(path.dirname(report), { recursive: true });
  await fs.writeFile(report, JSON.stringify({ vscode: vscode.version, failures, results }, null, 2));
  if (failures) throw new Error(`${failures} extension tests failed; report: ${report}`);
}
