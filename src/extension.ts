import * as vscode from 'vscode';
import { completionContext } from './completion-context';

interface Principal { name: string; documentation: vscode.MarkdownString }

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('IAM Service Principal Snippets');
  let loading: Promise<Principal[]> | undefined;
  const load = (): Promise<Principal[]> => {
    if (!loading) {
      loading = Promise.resolve(vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'snippets', 'service-principals.json')))
        .then(bytes => {
          const data: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Catalog must be an object');
          const names = new Set<string>();
          const principals = Object.values(data).map(record => {
            if (!record || typeof record.servicePrincipal !== 'string' ||
                !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?$/.test(record.servicePrincipal) ||
                names.has(record.servicePrincipal)) throw new Error('Invalid or duplicate service principal');
            names.add(record.servicePrincipal);
            const documentation = new vscode.MarkdownString(`Service Principal: \`${record.servicePrincipal}\``);
            return { name: record.servicePrincipal, documentation };
          });
          if (!principals.length) throw new Error('Catalog is empty');
          return principals.sort((a, b) => a.name.localeCompare(b.name));
        })
        .catch(error => {
          loading = undefined;
          output.appendLine(`Could not load service principals: ${error}. The next completion request will retry.`);
          return [];
        });
    }
    return loading;
  };
  const provider = vscode.languages.registerCompletionItemProvider(
    ['json', 'jsonc', 'yaml', 'terraform', 'typescript', 'typescriptreact', 'python'],
    {
      async provideCompletionItems(document, position, cancellation) {
        if (cancellation.isCancellationRequested) return;
        const insertion = completionContext(document, position, cancellation);
        if (!insertion) return;
        const principals = await load();
        if (cancellation.isCancellationRequested) return;
        return principals.map(principal => {
          const item = new vscode.CompletionItem(principal.name, vscode.CompletionItemKind.Value);
          item.detail = 'AWS Service Principal';
          item.documentation = principal.documentation;
          item.range = insertion.range;
          item.insertText = insertion.prefix + principal.name + insertion.suffix;
          return item;
        });
      },
    }, '"', "'",
  );
  context.subscriptions.push(output, provider);
}
