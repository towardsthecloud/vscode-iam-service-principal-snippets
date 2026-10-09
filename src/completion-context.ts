import * as vscode from 'vscode';

interface Scope {
  kind: string; key?: string; parent?: Scope; property?: string;
  argument: number; fields: Map<string, string>;
}
interface Context { scope: Scope; property?: string; argument: number }
interface Token {
  text: string; start: number; end: number; quote?: string; closed?: boolean; comment?: boolean;
  before: Context; after: Context;
}
interface Snapshot { version: number; language: string; format: string; tokens: Token[]; yamlValues: number[] }
const snapshots = new WeakMap<vscode.TextDocument, Snapshot>();

function scan(document: vscode.TextDocument, cancellation: vscode.CancellationToken): Snapshot | undefined {
  const cached = snapshots.get(document);
  if (cached?.version === document.version && cached.language === document.languageId) return cached;
  const text = document.getText();
  const format = document.fileName.endsWith('.template') ? (/^\s*[\[{]/.test(text) ? 'json' : 'yaml') : document.languageId;
  const tokens: Token[] = [];
  let previous: Token | undefined;
  let scope: Scope = { kind: 'root', argument: 0, fields: new Map() };
  const context = (): Context => ({ scope, property: scope.property, argument: scope.argument });
  let offset = 0;
  while (offset < text.length) {
    if (cancellation.isCancellationRequested) return;
    const start = offset;
    const char = text[offset];
    if (/\s/.test(char)) { offset++; continue; }
    const before = context();
    let quote: string | undefined;
    let closed = false, comment = false;
    if (text.startsWith('//', offset) || (char === '#' && ['python', 'terraform', 'yaml'].includes(format))) {
      comment = true;
      while (offset < text.length && text[offset] !== '\n') offset++;
    } else if (text.startsWith('/*', offset)) {
      comment = true;
      const end = text.indexOf('*/', offset + 2);
      offset = end < 0 ? text.length : end + 2;
    } else if ('"\'`'.includes(char)) {
      quote = format === 'python' && text.startsWith(char.repeat(3), offset) ? char.repeat(3) : char;
      offset += quote.length;
      while (offset < text.length && (quote.length > 1 || quote === '`' || text[offset] !== '\n')) {
        if (text[offset] === '\\') { offset += Math.min(2, text.length - offset); continue; }
        if (text.startsWith(quote, offset)) { offset += quote.length; closed = true; break; }
        offset++;
      }
    } else if (/[\w-]/.test(char)) {
      while (offset < text.length && /[\w.-]/.test(text[offset])) offset++;
    } else { offset++; }
    const raw = text.slice(start, offset);
    const value = quote ? raw.slice(quote.length, closed ? -quote.length : undefined) : raw;
    if (!comment && !quote) {
      if (raw === ':' || raw === '=') scope.property = previous?.text;
      else if ('{[('.includes(raw)) {
        const key = previous && [':', '='].includes(previous.text) ? scope.property : previous?.text;
        scope = { kind: raw, key, parent: scope, argument: 0, fields: new Map() };
      } else if ('}])'.includes(raw)) {
        if (scope.parent) scope = scope.parent;
        scope.property = undefined;
      } else if (raw === ',') { scope.property = undefined; scope.argument++; }
    }
    if (quote && previous?.text === '=' && scope.property) scope.fields.set(scope.property, value);
    const token = { text: value, start, end: offset, quote, closed, comment, before, after: context() };
    tokens.push(token);
    if (!comment) previous = token;
  }
  const yamlValues: number[] = [];
  if (format === 'yaml') {
    const ancestors: { indent: number; key: string }[] = [];
    for (const line of text.split(/\r?\n/)) {
      const match = /^(\s*)(-\s+)?["']?([\w]+)["']?\s*:/.exec(line);
      const indent = (line.match(/^\s*/)?.[0].length || 0) + (line.trimStart().startsWith('- ') ? 2 : 0);
      if (line.trim() && !line.trimStart().startsWith('#')) {
        while (ancestors.length && ancestors[ancestors.length - 1].indent >= indent) ancestors.pop();
      }
      const inPrincipal = ancestors[ancestors.length - 1]?.key === 'Principal';
      const inService = ancestors[ancestors.length - 1]?.key === 'Service' && ancestors[ancestors.length - 2]?.key === 'Principal';
      yamlValues.push(match ? (match[3] === 'Service' && inPrincipal ? match[0].length : -1) : (inService ? indent : -1));
      if (match) ancestors.push({ indent, key: match[3] });
    }
  }
  const snapshot = { version: document.version, language: document.languageId, format, tokens, yamlValues };
  snapshots.set(document, snapshot);
  return snapshot;
}

export function completionContext(
  document: vscode.TextDocument, position: vscode.Position, cancellation: vscode.CancellationToken,
): { range: vscode.Range; prefix: string; suffix: string } | undefined {
  const snapshot = scan(document, cancellation);
  if (!snapshot || cancellation.isCancellationRequested) return;
  const offset = document.offsetAt(position);
  const tokens = snapshot.tokens;
  // Find the preceding token without rescanning the document on repeated requests.
  let low = 0, high = tokens.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (tokens[middle].start <= offset) low = middle + 1; else high = middle;
  }
  const token = tokens[low - 1];
  if (token && offset <= token.end && token.comment) return;
  if (token?.quote && offset === token.start) return;
  if (token?.quote && token.closed && offset === token.end) return;
  const inside = token && offset > token.start && offset <= token.end && (token.quote || /^[\w.-]+$/.test(token.text));
  if (inside && [':', '='].includes(tokens[low]?.text)) return;
  const context = token && (inside || offset < token.end) ? token.before : token?.after;
  if (!context) return;
  const { scope } = context;
  const property = scope.kind === '[' ? scope.key : context.property;
  const parent = scope.kind === '[' ? scope.parent : scope;
  let relevant = property === 'Service' && parent?.key === 'Principal';
  if (snapshot.format === 'terraform') {
    relevant ||= property === 'identifiers' && parent?.key === 'principals' && parent.fields.get('type') === 'Service';
  } else if (['typescript', 'typescriptreact', 'python'].includes(snapshot.format)) {
    relevant = scope.kind === '(' && /(?:^|\.)ServicePrincipal$/.test(scope.key || '') && context.argument === 0;
  } else if (snapshot.format === 'yaml') {
    const valueStart = snapshot.yamlValues[position.line];
    relevant ||= valueStart >= 0 && position.character >= valueStart;
  }
  if (!relevant || (token?.quote && (token.quote === '`' || token.quote.length > 1))) return;
  const start = inside ? token.start + (token.quote ? 1 : 0) : offset;
  let end = inside ? token.end - (token.quote && token.closed ? 1 : 0) : offset;
  if (inside && token.quote && !token.closed) {
    // An unfinished hostname must not consume the syntax following it.
    end = start + /^[\w.-]*/.exec(token.text)![0].length;
    if (offset > end) return;
  }
  return {
    range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
    prefix: token?.quote && inside ? '' : snapshot.format === 'yaml' ? '' : '"',
    suffix: token?.quote && inside ? (token.closed ? '' : token.quote) : snapshot.format === 'yaml' ? '' : '"',
  };
}
