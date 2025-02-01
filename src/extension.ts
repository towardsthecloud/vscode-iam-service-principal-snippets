import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CompletionItem, CompletionItemKind, type Disposable, Hover, MarkdownString } from 'vscode';

let outputChannel: vscode.OutputChannel;
class ServicePrincipalMappings {
  private servicePrincipalsMap: Map<string, string> | null = null;
  private loadingPromise: Promise<void> | null = null;

  private async ensureDataLoaded(): Promise<void> {
    if (!this.loadingPromise) {
      this.loadingPromise = this.loadServicePrincipals();
    }
    await this.loadingPromise;
  }

  private async loadServicePrincipals(): Promise<void> {
    const filePath = path.join(__dirname, '..', 'snippets', 'service-principals.json');
    try {
      const rawData = await fs.readFile(filePath, 'utf8');
      const jsonData = JSON.parse(rawData);
      this.servicePrincipalsMap = new Map();

      for (const key in jsonData) {
        const principal = jsonData[key].servicePrincipal;
        if (principal) {
          this.servicePrincipalsMap.set(principal, key);
        }
      }
      outputChannel.appendLine(`Loaded ${this.servicePrincipalsMap.size} service principals`);
    } catch (error) {
      outputChannel.appendLine(`Error loading service principals: ${error}`);
    }
  }

  public async getAllServicePrincipals(): Promise<string[]> {
    await this.ensureDataLoaded();
    if (!this.servicePrincipalsMap) {
      return [];
    }
    return Array.from(this.servicePrincipalsMap.keys());
  }
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Service Principals');
  outputChannel.appendLine('Service Principals extension activated');

  const servicePrincipalMappings = new ServicePrincipalMappings();
  const disposable: Disposable[] = [];

  disposable.push(
    vscode.languages.registerCompletionItemProvider(
      ['json', 'yaml', 'yml', 'terraform', 'typescript', 'python'],
      {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
          if (await isBelowPrincipalKey(document, position)) {
            outputChannel.appendLine(`Providing completion items at position: ${position.line}:${position.character}`);
            const allPrincipals = await servicePrincipalMappings.getAllServicePrincipals();
            return allPrincipals.map((principal) => {
              const item = new vscode.CompletionItem(principal, vscode.CompletionItemKind.Value);
              item.detail = 'AWS Service Principal';
              item.documentation = new vscode.MarkdownString(`Service Principal: \`${principal}\``);
              return item;
            });
          }
          return undefined;
        },
      },
      '"',
      "'",
    ),
  );

  context.subscriptions.push(...disposable);
}

export function deactivate() {
  outputChannel.appendLine('Service Principals extension deactivated');
}

async function isBelowPrincipalKey(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
  const maxLinesUp = 40;
  const startLine = Math.max(0, position.line - maxLinesUp);
  const text = document.getText(new vscode.Range(startLine, 0, position.line, position.character));

  if (document.languageId === 'json' || document.languageId === 'terraform') {
    const lines = text.split('\n').reverse();
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      if (document.languageId === 'json') {
        if (trimmedLine.includes('"principal"') && (trimmedLine.includes('{') || trimmedLine.includes(':'))) {
          return true;
        }
        if (trimmedLine.includes('"notprincipal"') && (trimmedLine.includes('{') || trimmedLine.includes(':'))) {
          return true;
        }
      } else if (document.languageId === 'terraform') {
        if (trimmedLine.includes('principal') && trimmedLine.includes('=') && trimmedLine.includes('{')) {
          return true;
        }
      }
      if (trimmedLine.startsWith('}') || trimmedLine.startsWith(']')) {
        break;
      }
    }
  }

  if (document.languageId === 'yaml' || document.languageId === 'yml') {
    const lines = text.split('\n').reverse();
    let foundService = false;
    let foundPrincipal = false;
    let principalIndentation = -1;

    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      const indentation = line.search(/\S/); // Get the indentation level

      // Check for Service: key
      if (trimmedLine.startsWith('service:')) {
        foundService = true;
        if (foundPrincipal && indentation > principalIndentation) {
          return true;
        }
      }

      // Check for Principal: key
      if (trimmedLine.startsWith('principal:')) {
        foundPrincipal = true;
        principalIndentation = indentation;
        continue;
      }

      // Break if we encounter a line with less indentation than Principal
      if (foundPrincipal && indentation <= principalIndentation && trimmedLine !== '') {
        break;
      }

      // Break on document structure indicators
      if (trimmedLine.startsWith('---') || trimmedLine.startsWith('...')) {
        break;
      }
    }

    // Return true if we're right after Service: under Principal:
    return foundService && foundPrincipal;
  }

  if (document.languageId === 'typescript') {
    const lines = text.split('\n').reverse();
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();

      // Check for ServicePrincipal constructor
      if (trimmedLine.includes('serviceprincipal(')) {
        return true;
      }

      // Check for assumedBy property in Role definition
      if (trimmedLine.includes('assumedby:')) {
        return true;
      }

      // Check for principal property in PolicyStatement
      if (trimmedLine.includes('principal:')) {
        return true;
      }

      // Break conditions
      if (trimmedLine.includes('class') || trimmedLine.includes('interface')) {
        break;
      }
    }
  }

  if (document.languageId === 'python') {
    const lines = text.split('\n').reverse();
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();

      // Check for ServicePrincipal constructor
      if (trimmedLine.includes('serviceprincipal(')) {
        return true;
      }

      // Check for assumed_by parameter in Role
      if (trimmedLine.includes('assumed_by=')) {
        return true;
      }

      // Check for principal parameter in PolicyStatement
      if (trimmedLine.includes('principal=')) {
        return true;
      }

      // Break on class/def definitions or closing parentheses
      if (trimmedLine.startsWith('class ') || trimmedLine.startsWith('def ') || trimmedLine.startsWith(')')) {
        break;
      }
    }
    return false;
  }
  return false;
}
