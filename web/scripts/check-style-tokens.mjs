#!/usr/bin/env node
/**
 * check-style-tokens.mjs — fail when component styles use raw colour or font
 * literals instead of design tokens from src/styles/tokens.css.
 *
 * Usage:
 *   node scripts/check-style-tokens.mjs <file|dir> [...]   # lint (exit 1 on violations)
 *   node scripts/check-style-tokens.mjs --self-test         # verify the detector itself
 *
 * Scanned:
 *  - .css / .scss files and *.styles.ts files: whole content.
 *  - other .ts files: `styles:` template literals plus inline `style="…"` and
 *    SVG `fill|stroke|color="…"` attributes.
 * Flagged: hex colours, rgb()/rgba()/hsl()/hsla(), named colours used as a
 * colour value, and font-family values that are not var(--…)/inherit.
 * src/styles/tokens.css is the token source and is never linted.
 * A line containing `tokenize-allow` is skipped.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const NAMED = 'white|black|red|blue|green|gray|grey|navy|orange|yellow|purple|pink|silver|maroon|teal|olive|lime|aqua|fuchsia';
const RULES = [
  { id: 'hex', re: /(^|[\s:(,"'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/ },
  { id: 'color-fn', re: /\b(?:rgba?|hsla?)\((?!\s*var\()/ },
  { id: 'named-color', re: new RegExp(`(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline(?:-color)?)\\s*[:=]\\s*["']?[^;"'{}]*\\b(?:${NAMED})\\b`, 'i') },
  { id: 'font-family', re: /font-family\s*:\s*(?!\s*(?:var\(|inherit|initial|unset))/i },
];

function cssSegments(path, text) {
  if (/\.(s?css)$/.test(path) || /styles?\.ts$/.test(path)) return [{ offset: 0, text }];
  const segs = [];
  const patterns = [
    /styles\s*:\s*\[?\s*`([\s\S]*?)`/g,
    /\sstyle="([^"]*)"/g,
    /\s((?:fill|stroke|color)="[^"]*")/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) segs.push({ offset: m.index + m[0].indexOf(m[1]), text: m[1] });
  }
  return segs;
}

export function lintText(path, text) {
  const out = [];
  for (const seg of cssSegments(path, text)) {
    const lines = seg.text.split('\n');
    const baseLine = text.slice(0, seg.offset).split('\n').length;
    lines.forEach((line, i) => {
      if (line.includes('tokenize-allow')) return;
      const stripped = line.replace(/var\(--[\w-]+/g, 'var(').replace(/white-space/g, 'ws').replace(/currentColor|transparent|none/g, '');
      for (const r of RULES) {
        if (r.re.test(stripped)) out.push({ path, line: baseLine + i, rule: r.id, text: line.trim() });
      }
    });
  }
  return out;
}

function walk(p, acc) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) if (n !== 'node_modules') walk(join(p, n), acc);
  } else if (/\.(ts|css|scss)$/.test(p) && !/\.spec\.ts$/.test(p) && !/styles[\\/]tokens\.css$/.test(p)) {
    acc.push(p);
  }
  return acc;
}

function selfTest() {
  const bad = [
    ['a.css', '.x { color: #fff; }'],
    ['a.css', '.x { background: white; }'],
    ['a.css', '.x { box-shadow: 0 1px 2px rgba(0,0,0,.1); }'],
    ['a.css', '.x { font-family: Arial, sans-serif; }'],
    ['a.ts', 'styles: [`.x { border-color: #123456; }`]'],
    ['a.ts', 'template: `<path stroke="white"/>`'],
  ];
  const good = [
    ['a.css', '.x { color: var(--color-on-primary); white-space: nowrap; }'],
    ['a.css', '.x { font-family: var(--font-body); padding: var(--space-4); }'],
    ['a.ts', 'template: `<input #add /><path stroke="currentColor"/>`'],
    ['a.css', '.x { color: red; } /* tokenize-allow */'],
    ['a.ts', 'styles: [`.x { box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), .15); }`]'],
  ];
  let fail = 0;
  for (const [p, t] of bad) if (lintText(p, t).length === 0) { fail++; console.error(`self-test: missed violation in ${t}`); }
  for (const [p, t] of good) {
    const v = lintText(p, t);
    if (v.length) { fail++; console.error(`self-test: false positive in ${t} (${v[0].rule})`); }
  }
  if (fail) { console.error(`check-style-tokens self-test FAILED (${fail})`); process.exit(1); }
  console.log(`check-style-tokens self-test passed (${bad.length + good.length} cases)`);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
} else {
  if (!args.length) { console.error('usage: check-style-tokens.mjs <file|dir> [...] | --self-test'); process.exit(2); }
  const files = [];
  for (const a of args) {
    const p = resolve(a);
    if (!existsSync(p)) { console.error(`check-style-tokens: no such path ${a}`); process.exit(2); }
    walk(p, files);
  }
  const violations = files.flatMap(f => lintText(f, readFileSync(f, 'utf8')));
  for (const v of violations) console.error(`${relative(process.cwd(), v.path)}:${v.line} [${v.rule}] ${v.text}`);
  if (violations.length) { console.error(`check-style-tokens: ${violations.length} raw literal(s) in ${files.length} file(s)`); process.exit(1); }
  console.log(`check-style-tokens: ${files.length} file(s) clean`);
}
