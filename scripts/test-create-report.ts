#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

(async () => {
  const outDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `test-report-${Date.now()}.csv`);
  const header = 'a,b,c\n';
  fs.writeFileSync(outFile, header, 'utf8');
  fs.appendFileSync(outFile, '1,2,3\n', 'utf8');
  console.log('WROTE', outFile);
  const content = fs.readFileSync(outFile, 'utf8');
  console.log('CONTENT:\n' + content);
})();
