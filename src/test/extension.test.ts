import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { test } from './runner';

async function completions(language: string, marked: string): Promise<{document: vscode.TextDocument; items: vscode.CompletionItem[]}> {
  const offset = marked.indexOf('|');
  const document = await vscode.workspace.openTextDocument({ language, content: marked.replace('|', '') });
  await vscode.window.showTextDocument(document);
  await vscode.extensions.getExtension('dannysteenman.iam-service-principal-snippets')!.activate();
  const result = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider', document.uri, document.positionAt(offset),
  );
  return { document, items: result.items.filter(item => item.detail === 'AWS Service Principal') };
}

test('recovers after a missing or invalid catalog without restarting VS Code', async () => {
  const extension = vscode.extensions.getExtension('dannysteenman.iam-service-principal-snippets')!;
  const catalog = vscode.Uri.joinPath(extension.extensionUri, 'snippets', 'service-principals.json');
  const original = await vscode.workspace.fs.readFile(catalog);
  try {
    await vscode.workspace.fs.delete(catalog);
    assert.equal((await completions('json', '{"Principal":{"Service":"|"}}')).items.length, 0);
    await vscode.workspace.fs.writeFile(catalog, Buffer.from('{"bad":{"servicePrincipal":"invalid"}}'));
    assert.equal((await completions('json', '{"Principal":{"Service":"|"}}')).items.length, 0);
  } finally { await vscode.workspace.fs.writeFile(catalog, original); }
  assert.ok((await completions('json', '{"Principal":{"Service":"|"}}')).items.some(item => item.label === 'lambda.amazonaws.com'));
});

  test('completes a standalone JSON trust policy and replaces the entire partial hostname', async () => {
    const { document, items } = await completions('json', '{"Statement":[{"Principal":{"Service":"lam|.amazonaws.com"}}]}');
    const item = items.find(item => item.label === 'lambda.amazonaws.com');
    assert.ok(item, 'lambda service principal should be suggested');
    assert.ok(item.range instanceof vscode.Range, 'completion must replace the whole value');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, item.range, item.insertText as string);
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.equal(document.getText(), '{"Statement":[{"Principal":{"Service":"lambda.amazonaws.com"}}]}');
  });

const insertions = [
  ['JSON service array', 'json', '{"Principal":{"Service":["s3.amazonaws.com","lam|"]}}', '{"Principal":{"Service":["s3.amazonaws.com","lambda.amazonaws.com"]}}'],
  ['JSON unquoted value', 'json', '{"Principal":{"Service": |}}', '{"Principal":{"Service": "lambda.amazonaws.com"}}'],
  ['JSON unfinished quote', 'json', '{"Principal":{"Service":"lam|', '{"Principal":{"Service":"lambda.amazonaws.com"'],
  ['YAML trust policy', 'yaml', 'Statement:\n  - Principal:\n      Service: lam|', 'Statement:\n  - Principal:\n      Service: lambda.amazonaws.com'],
  ['YAML service array', 'yaml', 'Principal:\n  Service:\n    - s3.amazonaws.com\n    - "lam|"', 'Principal:\n  Service:\n    - s3.amazonaws.com\n    - "lambda.amazonaws.com"'],
  ['YAML flow policy', 'yaml', 'Principal: {Service: "lam|"}', 'Principal: {Service: "lambda.amazonaws.com"}'],
  ['Terraform nested Service', 'terraform', 'Principal = {\n  Service = "lam|.amazonaws.com"\n}', 'Principal = {\n  Service = "lambda.amazonaws.com"\n}'],
  ['Terraform service identifiers', 'terraform', 'principals {\n  identifiers = ["lam|"]\n  type = "Service"\n}', 'principals {\n  identifiers = ["lambda.amazonaws.com"]\n  type = "Service"\n}'],
  ['TypeScript assumedBy', 'typescript', 'const role = new iam.Role(this, "Role", {\n  assumedBy: new iam.ServicePrincipal("lam|")\n});', 'const role = new iam.Role(this, "Role", {\n  assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")\n});'],
  ['TypeScript direct constructor', 'typescript', "const p = new ServicePrincipal('lam|');", "const p = new ServicePrincipal('lambda.amazonaws.com');"],
  ['TypeScript multiline constructor', 'typescript', "principals: [\n new iam.ServicePrincipal(\n 'lam|'\n )\n]", "principals: [\n new iam.ServicePrincipal(\n 'lambda.amazonaws.com'\n )\n]"],
  ['TypeScript unquoted argument', 'typescript', 'const p = new iam.ServicePrincipal(|);', 'const p = new iam.ServicePrincipal("lambda.amazonaws.com");'],
  ['Python inline role', 'python', 'role = iam.Role(self, "Role", assumed_by=iam.ServicePrincipal("lam|"))', 'role = iam.Role(self, "Role", assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"))'],
  ['Python multiline constructor', 'python', 'role = iam.Role(self, "Role",\n assumed_by=iam.ServicePrincipal(\n  "lam|"\n )\n)', 'role = iam.Role(self, "Role",\n assumed_by=iam.ServicePrincipal(\n  "lambda.amazonaws.com"\n )\n)'],
];
for (const [title, language, marked, expected] of insertions) {
  test(title, async () => {
    const { document, items } = await completions(language, marked);
    const item = items.find(item => item.label === 'lambda.amazonaws.com');
    assert.ok(item, 'lambda service principal should be suggested');
    assert.ok(item.range instanceof vscode.Range);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, item.range, item.insertText as string);
    await vscode.workspace.applyEdit(edit);
    assert.equal(document.getText(), expected);
  });
}
const unrelated = [
  ['YAML unrelated Service', 'yaml', 'Resources: {}\nMetadata:\n  Service: "|"'],
  ['JSON account principal', 'json', '{"Principal":{"AWS":"|"}}'],
  ['JSON unrelated Service', 'json', '{"Metadata":{"Service":"|"}}'],
  ['JSON comment', 'jsonc', '{"Principal":{"Service":"lambda.amazonaws.com"}} // |'],
  ['Terraform account identifiers', 'terraform', 'principals { type = "AWS"\n identifiers = ["|"] }'],
  ['TypeScript after constructor', 'typescript', 'principals: [new iam.ServicePrincipal("lambda.amazonaws.com")], other: "|"'],
  ['TypeScript constructor options', 'typescript', 'new iam.ServicePrincipal("lambda.amazonaws.com", {region: "|"})'],
  ['Python comment', 'python', '# iam.ServicePrincipal("|")'],
];
for (const [title, language, marked] of unrelated) {
  test(title, async () => assert.equal((await completions(language, marked)).items.length, 0));
}

test('ignores constructor text inside a multiline Python docstring', async () => {
  assert.equal((await completions('python', '"""Example:\n iam.ServicePrincipal("|")\n"""')).items.length, 0);
});
test('ignores constructor text inside a multiline TypeScript template', async () => {
  assert.equal((await completions('typescript', '`Example:\nnew iam.ServicePrincipal("|")\n`')).items.length, 0);
});

test('completes a large template and invalidates context after an edit', async () => {
  const marked = '{"Resources":{},"Description":"' + 'x'.repeat(1024 * 1024) + '",\n"Principal":{\n"Service":"lam|"\n}}';
  const offset = marked.indexOf('|');
  const { document, items } = await completions('json', marked);
  assert.ok(items.some(item => item.label === 'lambda.amazonaws.com'));
  const times: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, document.positionAt(offset));
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`BENCHMARK ${JSON.stringify({ bytes: document.getText().length, samples: times.length, medianMs: times[15], p95Ms: times[28] })}`);
  const key = document.getText().indexOf('"Service"');
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(key), document.positionAt(key + 9)), '"AWS"');
  await vscode.workspace.applyEdit(edit);
  const result = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, document.positionAt(offset - 4));
  assert.equal(result.items.filter(item => item.detail === 'AWS Service Principal').length, 0);
});

test('completes Terraform service identifiers after other statement fields', async () => {
  const { items } = await completions('terraform', 'statement { effect = "Allow"\n principals { type = "Service"\n identifiers = ["lam|"] } }');
  assert.ok(items.some(item => item.label === 'lambda.amazonaws.com'));
});
test('recognizes JSONC keys separated by comments', async () => {
  const { items } = await completions('jsonc', '{"Principal" /* role */: {"Service":"lam|"}}');
  assert.ok(items.some(item => item.label === 'lambda.amazonaws.com'));
});
test('recognizes Terraform service types separated by comments', async () => {
  const { items } = await completions('terraform', 'principals { type = /* service */ "Service"\n identifiers = ["lam|"] }');
  assert.ok(items.some(item => item.label === 'lambda.amazonaws.com'));
});
for (const [format, content] of [
  ['JSON', '{"Principal":{"Service": |}}'],
  ['YAML', 'Principal:\n  Service: lam|'],
]) {
  test(`opens an actual ${format} .template file with working completions`, async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'iam-template-'));
    try {
      const uri = vscode.Uri.file(path.join(temporary, 'role.template'));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content.replace('|', '')));
      const document = await vscode.workspace.openTextDocument(uri);
      assert.ok(['json', 'yaml'].includes(document.languageId), `unexpected language ${document.languageId}`);
      const result = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, document.positionAt(content.indexOf('|')));
      const item = result.items.find(item => item.label === 'lambda.amazonaws.com' && item.detail === 'AWS Service Principal');
      assert.ok(item);
      assert.ok(item.range instanceof vscode.Range);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, item.range, item.insertText as string);
      await vscode.workspace.applyEdit(edit);
      if (format === 'JSON') assert.equal(JSON.parse(document.getText()).Principal.Service, 'lambda.amazonaws.com');
      else assert.equal(document.getText(), 'Principal:\n  Service: lambda.amazonaws.com');
    } finally { await fs.rm(temporary, {recursive: true, force: true}); }
  });
}
