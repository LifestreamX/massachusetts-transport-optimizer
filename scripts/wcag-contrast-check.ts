import fs from 'fs';
import path from 'path';

type Occurrence = {
  file: string;
  line: number;
  snippet: string;
  classes: string[];
};

const root = process.cwd();

function walk(dir: string, files: string[] = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (
        e.name === 'node_modules' ||
        e.name === '.next' ||
        e.name === 'reports'
      )
        continue;
      walk(p, files);
    } else {
      files.push(p);
    }
  }
  return files;
}

function readGlobals() {
  const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
  const vars: Record<string, string> = {};
  const mRoot = css.match(/:root\s*{([\s\S]*?)}/);
  if (mRoot) {
    const body = mRoot[1];
    body.split(/;|\n/).forEach((line) => {
      const mm = line.match(/--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/);
      if (mm) vars[mm[1]] = mm[2];
    });
  }
  const mDark = css.match(/html\.dark\s*{([\s\S]*?)}/);
  if (mDark) {
    const body = mDark[1];
    body.split(/;|\n/).forEach((line) => {
      const mm = line.match(/--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/);
      if (mm) vars['dark--' + mm[1]] = mm[2];
    });
  }
  return vars;
}

// Minimal Tailwind color map for commonly used names in the project.
const tailwind: Record<string, string> = {
  'blue-50': '#eff6ff',
  'blue-100': '#dbeafe',
  'blue-300': '#93c5fd',
  'blue-400': '#60a5fa',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'blue-700': '#1d4ed8',
  'indigo-500': '#6366f1',
  'indigo-700': '#3730a3',
  'gray-50': '#f9fafb',
  'gray-100': '#f3f4f6',
  'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db',
  'gray-400': '#9ca3af',
  'gray-500': '#6b7280',
  'gray-600': '#4b5563',
  'gray-700': '#374151',
  'gray-900': '#111827',
  white: '#ffffff',
  black: '#000000',
  'green-400': '#34d399',
  'green-600': '#16a34a',
  'yellow-500': '#eab308',
  'yellow-600': '#ca8a04',
  'red-400': '#f87171',
  'red-600': '#dc2626',
};

function expandColorToken(token?: string): string | undefined {
  if (!token) return undefined;
  if (token.startsWith('var(')) return undefined;
  if (tailwind[token]) return tailwind[token];
  return undefined;
}

function hexToLuminance(hex: string) {
  const c = hex.replace('#', '');
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16) / 255;
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16) / 255;
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16) / 255;
  const srgb = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(hex1: string, hex2: string) {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return +((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

function extractOccurrences(file: string): Occurrence[] {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const res: Occurrence[] = [];
  const classRegex = /className\s*=\s*(?:{`([^`]+)`|"([^"]+)"|'([^']+)')/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    while ((m = classRegex.exec(line))) {
      const cls = m[1] || m[2] || m[3] || '';
      const classes = cls.split(/\s+/).filter(Boolean);
      res.push({
        file: path.relative(root, file),
        line: i + 1,
        snippet: line.trim(),
        classes,
      });
    }
  }
  return res;
}

function analyze() {
  const vars = readGlobals();
  const lightBg = vars['background'] || '#ffffff';
  const lightFg = vars['foreground'] || '#0f172a';
  const darkBg = vars['dark--background'] || '#0b1220';
  const darkFg = vars['dark--foreground'] || '#e6eef8';

  const files = walk(path.join(root, 'app')).filter((f) =>
    /\.(tsx|ts|jsx|js|css)$/.test(f),
  );
  const occs: Occurrence[] = [];
  for (const f of files) {
    occs.push(...extractOccurrences(f));
  }

  const rows: string[] = [];
  rows.push('file,line,theme,classes,fg_hex,bg_hex,contrast,passes');

  for (const o of occs) {
    const textToken = o.classes
      .find((c) => c.startsWith('text-'))
      ?.replace('text-', '');
    const bgToken = o.classes
      .find((c) => c.startsWith('bg-'))
      ?.replace('bg-', '');

    const fgLight = expandColorToken(textToken) || lightFg;
    const bgLight = expandColorToken(bgToken) || lightBg;
    const contrastLight = contrast(fgLight, bgLight);
    const passesLight = contrastLight >= 4.5 ? 'PASS' : 'FAIL';
    rows.push(
      [
        o.file,
        String(o.line),
        'light',
        `"${o.classes.join(' ')}"`,
        fgLight,
        bgLight,
        String(contrastLight),
        passesLight,
      ].join(','),
    );

    const fgDark =
      expandColorToken(
        o.classes
          .find((c) => c.startsWith('dark:text-'))
          ?.replace('dark:text-', ''),
      ) || darkFg;
    const bgDark =
      expandColorToken(
        o.classes
          .find((c) => c.startsWith('dark:bg-'))
          ?.replace('dark:bg-', ''),
      ) || darkBg;
    const contrastDark = contrast(fgDark, bgDark);
    const passesDark = contrastDark >= 4.5 ? 'PASS' : 'FAIL';
    rows.push(
      [
        o.file,
        String(o.line),
        'dark',
        `"${o.classes.join(' ')}"`,
        fgDark,
        bgDark,
        String(contrastDark),
        passesDark,
      ].join(','),
    );
  }

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');
  const out = path.join('reports', `wcag-contrast-${Date.now()}.csv`);
  fs.writeFileSync(out, rows.join('\n'), 'utf8');
  console.log('Wrote report to', out);
}

analyze();
