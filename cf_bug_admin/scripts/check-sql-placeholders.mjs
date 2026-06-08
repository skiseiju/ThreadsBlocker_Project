import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../src/index.js');
const source = readFileSync(sourcePath, 'utf8');

function splitTopLevelList(text) {
  const items = [];
  let current = '';
  let quote = '';
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];

    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;

    if (ch === ',' && depth === 0) {
      const item = current.trim();
      if (item) items.push(item);
      current = '';
      continue;
    }

    current += ch;
  }

  const item = current.trim();
  if (item) items.push(item);
  return items;
}

function countPlaceholders(values) {
  return values.filter((value) => value === '?').length;
}

function extractBindArgs(startIndex) {
  const bindStart = source.indexOf('.bind(', startIndex);
  if (bindStart === -1) return null;
  const argsStart = bindStart + '.bind('.length;
  let quote = '';
  let depth = 1;

  for (let i = argsStart; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];

    if (quote) {
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0) {
      return splitTopLevelList(source.slice(argsStart, i));
    }
  }

  return null;
}

function extractInsert(sqlTableName) {
  const pattern = new RegExp(
    `INSERT\\s+INTO\\s+${sqlTableName}\\s*\\((?<columns>[\\s\\S]*?)\\)\\s*VALUES\\s*\\((?<values>[\\s\\S]*?)\\)` ,
    'm'
  );
  const match = source.match(pattern);
  if (!match?.groups) {
    throw new Error(`Unable to find INSERT for ${sqlTableName}`);
  }
  return {
    columns: splitTopLevelList(match.groups.columns),
    values: splitTopLevelList(match.groups.values),
    bindArgs: extractBindArgs(match.index + match[0].length)
  };
}

const checks = ['platform_uploads', 'platform_raw_ingests'];
let failures = 0;

for (const table of checks) {
  const { columns, values, bindArgs } = extractInsert(table);
  let tableFailures = 0;

  if (columns.length !== values.length) {
    console.error(`${table}: ${columns.length} columns but ${values.length} VALUES entries`);
    tableFailures += 1;
  }

  if (!bindArgs) {
    console.error(`${table}: unable to find .bind(...) arguments`);
    tableFailures += 1;
  } else if (countPlaceholders(values) !== bindArgs.length) {
    console.error(`${table}: ${countPlaceholders(values)} placeholders but ${bindArgs.length} bind arguments`);
    tableFailures += 1;
  }

  if (tableFailures === 0) {
    console.log(`${table}: ${columns.length} columns, ${values.length} VALUES entries, ${bindArgs.length} bind arguments`);
  }

  failures += tableFailures;
}

if (failures > 0) process.exit(1);
