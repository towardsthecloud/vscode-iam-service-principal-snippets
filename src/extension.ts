import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { type Disposable } from 'vscode';

const DEBUG_ENABLED = false;
export const outputChannel = vscode.window.createOutputChannel('IAM Service Principal Snippets');

function log(message: string) {
  if (DEBUG_ENABLED) {
    outputChannel.appendLine(`[DEBUG] ${message}`);
  }
}

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
      log(`Loading service principals from ${filePath}`);
      const rawData = await fs.readFile(filePath, 'utf8');
      const jsonData = JSON.parse(rawData);
      this.servicePrincipalsMap = new Map();

      for (const key in jsonData) {
        const principal = jsonData[key].servicePrincipal;
        if (principal) {
          this.servicePrincipalsMap.set(principal, key);
        }
      }
      log(`Loaded ${this.servicePrincipalsMap.size} service principals`);
    } catch (error) {
      log(`Error loading service principals: ${error}`);
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
  if (DEBUG_ENABLED) {
    log('IAM Service Principals extension activated (debug mode)');
  } else {
    outputChannel.appendLine('IAM Service Principals extension activated');
  }

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

              const insertText = getInsertText(document, position, principal);
              item.insertText = insertText;

              return item;
            });

            function getInsertText(
              document: vscode.TextDocument,
              position: vscode.Position,
              principal: string,
            ): string {
              if (document.languageId === 'terraform' || document.languageId === 'json') {
                const range = document.getWordRangeAtPosition(position, /["']/);
                const prevChar = range ? document.getText(new vscode.Range(position.translate(0, -1), position)) : '';
                const nextChar = range ? document.getText(new vscode.Range(position, position.translate(0, 1))) : '';
                log(`Range: ${range}, prevChar: ${prevChar}, nextChar: ${nextChar}`);
                if (range && prevChar === '"' && nextChar !== '"') {
                  return `${principal}"`;
                }
                if (range && prevChar === '"' && nextChar === '"') {
                  return principal;
                }
                return `"${principal}"`;
              }
              return principal;
            }
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

async function isBelowPrincipalKey(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
  let principalRegex: RegExp | undefined;

  // YAML: Require a Resources key and match Principal or Service keys
  if (document.languageId === 'yaml' || document.languageId === 'yml') {
    const fullText = document.getText();
    if (!/^\s*Resources\s*:/im.test(fullText)) {
      log('YAML: Resources key not found, disabling autocomplete');
      return false;
    }
    principalRegex = /^\s*(Principal|Service)\s*:\s*(.*)$/i;
  }
  // JSON: Require a Resources key and match a "Principal" or "Service" key (with quotes)
  else if (document.languageId === 'json') {
    const fullText = document.getText();
    if (!/"Resources"\s*:\s*\{/im.test(fullText)) {
      log('JSON: Resources key not found, disabling autocomplete');
      return false;
    }
    principalRegex = /^\s*"((Principal)|(Service))"\s*:\s*(.*)$/i;
  }
  // Terraform: look for a bare Principal key with assignment
  else if (document.languageId === 'terraform') {
    principalRegex = /^\s*Principal\s*=\s*(.*)$/i;
  }
  // CDK in TypeScript: Check for new iam.ServicePrincipal(...) or new iam.Principal(...)
  // and then look backwards for 'principal:' or 'principals:' key.
  else if (document.languageId === 'typescript') {
    const currentLineNumber = position.line;
    const currentLineText = document.lineAt(currentLineNumber).text;
    const constructorRegex = /new\s+iam\.(ServicePrincipal|Principal)\s*\(/;
    const constructorMatch = currentLineText.match(constructorRegex);

    if (constructorMatch && constructorMatch.index !== undefined) {
      const constructorStartIndex = constructorMatch.index;
      const openParenIndex = currentLineText.indexOf('(', constructorStartIndex);

      // Check if cursor is inside the parentheses (or right after the opening paren)
      if (openParenIndex !== -1 && position.character > openParenIndex) {
        log(`Cursor potentially inside constructor parens on line ${currentLineNumber}`);

        // Look backwards up to 5 lines for 'principal:' or 'principals:'
        const maxLinesToSearch = 5;
        for (let i = 0; i < maxLinesToSearch && currentLineNumber - i >= 0; i++) {
          const lineNum = currentLineNumber - i;
          const lineText = document.lineAt(lineNum).text;
          // Match 'principal:' or 'principals:' at the start of a line (ignoring whitespace), potentially followed by '['
          const keyRegex = /^\s*(principal|principals)\s*:\s*(\[)?/i;
          const keyMatch = lineText.match(keyRegex);

          if (keyMatch?.[0]) {
            log(`Found key '${keyMatch[0].trim()}' on line ${lineNum}, enabling autocomplete`);
            return true; // Found the key, trigger autocomplete
          }
        }
        log(
          `Did not find 'principal:' or 'principals:' within ${maxLinesToSearch} lines above line ${currentLineNumber}`,
        );
      } else {
        log(`Cursor not inside constructor parens on line ${currentLineNumber}`);
      }
    } else {
      log(`No iam.ServicePrincipal/Principal constructor found on line ${currentLineNumber}`);
    }
    // If TS checks fail, let the generic checks below run, or eventually return false.
    // We set principalRegex to undefined here so the generic check doesn't run with the old TS regex.
    principalRegex = undefined;
  }
  // CDK in Python: Check for iam.ServicePrincipal(...) or iam.Principal(...)
  // and then look backwards for 'principal=' or 'assumed_by=' key.
  else if (document.languageId === 'python') {
    const currentLineNumber = position.line;
    const currentLineText = document.lineAt(currentLineNumber).text;
    // Match iam.ServicePrincipal( or iam.Principal(
    const constructorRegex = /iam\.(ServicePrincipal|Principal)\s*\(/;
    const constructorMatch = currentLineText.match(constructorRegex);

    if (constructorMatch && constructorMatch.index !== undefined) {
      const constructorStartIndex = constructorMatch.index;
      const openParenIndex = currentLineText.indexOf('(', constructorStartIndex);

      // Check if cursor is inside the parentheses (or right after the opening paren)
      if (openParenIndex !== -1 && position.character > openParenIndex) {
        log(`Cursor potentially inside constructor parens on line ${currentLineNumber}`);

        // Look backwards up to 5 lines for 'principal=' or 'assumed_by='
        const maxLinesToSearch = 5;
        for (let i = 0; i < maxLinesToSearch && currentLineNumber - i >= 0; i++) {
          const lineNum = currentLineNumber - i;
          const lineText = document.lineAt(lineNum).text;
          // Match 'principal=', 'principals=' or 'assumed_by=' at the start of a line (ignoring whitespace)
          const keyRegex = /^\s*(principals?|assumed_by)\s*=/i; // Added 's?' to principal
          const keyMatch = lineText.match(keyRegex);

          if (keyMatch?.[0]) {
            log(`Found key '${keyMatch[0].trim()}' on line ${lineNum}, enabling autocomplete`);
            return true; // Found the key, trigger autocomplete
          }
        }
        log(
          `Did not find 'principal(s)=' or 'assumed_by=' within ${maxLinesToSearch} lines above line ${currentLineNumber}`,
        );
      } else {
        log(`Cursor not inside constructor parens on line ${currentLineNumber}`);
      }
    } else {
      log(`No iam.ServicePrincipal/Principal constructor found on line ${currentLineNumber}`);
    }
    // Prevent the generic check below from running for Python
    principalRegex = undefined;
  }

  if (principalRegex) {
    const currentLineText = document.lineAt(position.line).text;
    const currentMatch = currentLineText.match(principalRegex);
    if (currentMatch) {
      log(`Current line matches principal regex: ${currentMatch[0]}`);
      let separatorIndex = -1;
      if (document.languageId === 'json' || document.languageId === 'yaml' || document.languageId === 'yml') {
        separatorIndex = currentLineText.indexOf(':');
      } else if (document.languageId === 'terraform') {
        separatorIndex = currentLineText.indexOf('=');
      } else {
        // For CDK TypeScript/Python, use the index of the matched pattern
        separatorIndex = currentLineText.indexOf(currentMatch[0]) + currentMatch[0].length;
      }
      if (position.character > separatorIndex) {
        log('Position is after the separator, enabling autocomplete');
        return true;
      }
    }

    // Also check the previous line in case the key/expression is split across lines.
    if (position.line > 0) {
      const previousLineText = document.lineAt(position.line - 1).text;
      const previousMatch = previousLineText.match(principalRegex);
      if (previousMatch) {
        log(`Previous line matches principal regex: ${previousMatch[0]}`);
        if (
          (document.languageId === 'json' || document.languageId === 'yaml' || document.languageId === 'yml') &&
          previousLineText.trim().endsWith(':')
        ) {
          log('Previous line ends with colon, enabling autocomplete');
          return true;
        }
        if (document.languageId === 'terraform' && previousLineText.trim().endsWith('=')) {
          log('Previous line ends with equals sign, enabling autocomplete');
          return true;
        }
        if (
          (document.languageId === 'typescript' || document.languageId === 'python') &&
          previousLineText.trim().endsWith('(')
        ) {
          log('Previous line ends with opening parenthesis, enabling autocomplete');
          return true;
        }
      }
    }
  }

  log('No principal key found, disabling autocomplete');
  return false;
}
