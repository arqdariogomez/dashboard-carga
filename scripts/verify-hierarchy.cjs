const ExcelJS = require('exceljs');
const fs = require('fs');

function computeParents(data) {
  const parents = [];
  for (let i = 0; i < data.length; i++) {
    const level = data[i].indent || 0;
    if (level === 0) { parents.push(-1); continue; }
    let p = -1;
    for (let j = i - 1; j >= 0; j--) {
      if ((data[j].indent || 0) === level - 1) { p = j; break; }
    }
    if (p === -1) {
      for (let j = i - 1; j >= 0; j--) {
        if ((data[j].indent || 0) < level) { p = j; break; }
      }
    }
    parents.push(p);
  }
  return parents;
}

function detectCycles(parents) {
  const n = parents.length;
  const visited = new Array(n).fill(0); // 0=unseen,1=visiting,2=done
  const cycles = [];
  function dfs(u, stack) {
    if (u < 0 || u >= n) return false;
    if (visited[u] === 1) { cycles.push(stack.concat(u)); return true; }
    if (visited[u] === 2) return false;
    visited[u] = 1;
    const p = parents[u];
    if (p !== -1) dfs(p, stack.concat(u));
    visited[u] = 2;
    return false;
  }
  for (let i = 0; i < n; i++) dfs(i, []);
  return cycles;
}

async function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) { console.error('File not found', filePath); process.exit(2); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  // find header and name col
  let headerRow = 1; let nameCol = 1;
  for (let r = 1; r <= 10; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const v = row.getCell(c).value;
      if (v && typeof v === 'string' && v.toLowerCase().includes('proyect')) { headerRow = r; nameCol = c; break; }
    }
    if (headerRow !== 1) break;
  }

  const data = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const cell = ws.getCell(r, nameCol);
    const text = cell && cell.value ? String(cell.value).trim() : '';
    if (!text) continue;
    const indent = cell && cell.alignment && (cell.alignment.indent || 0) ? (cell.alignment.indent || 0) : 0;
    data.push({ excelRow: r, text, indent });
  }

  const parents = computeParents(data);
  const cycles = detectCycles(parents);

  const stats = {
    total: data.length,
    withParent: parents.filter(p => p !== -1).length,
    roots: parents.filter(p => p === -1).length,
    maxIndent: Math.max(...data.map(d => d.indent || 0)),
    maxDepth: 0,
  };

  // compute depth per node
  const depth = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let d = 0; let cur = i;
    while (parents[cur] !== -1) { d++; cur = parents[cur]; if (d > 1000) break; }
    depth[i] = d;
    if (d > stats.maxDepth) stats.maxDepth = d;
  }

  // group counts
  const childrenMap = new Map();
  for (let i = 0; i < parents.length; i++) {
    const p = parents[i];
    if (p === -1) continue;
    childrenMap.set(p, (childrenMap.get(p) || 0) + 1);
  }

  console.log('Hierarchy verification results:');
  console.log(`- total rows considered: ${stats.total}`);
  console.log(`- roots: ${stats.roots}`);
  console.log(`- rows with parent: ${stats.withParent}`);
  console.log(`- max indent value: ${stats.maxIndent}`);
  console.log(`- max depth (levels): ${stats.maxDepth}`);
  console.log(`- cycles detected: ${cycles.length}`);
  if (cycles.length > 0) console.log(' cycles sample:', JSON.stringify(cycles[0]));

  // top parents by child count
  const top = Array.from(childrenMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
  console.log('- top parents by child count:');
  for (const [idx, cnt] of top) {
    console.log(`  - row ${idx} (excelRow=${data[idx].excelRow}) children=${cnt} indent=${data[idx].indent} text=${data[idx].text.slice(0,60)}`);
  }

  // sample a few mapped relations
  console.log('- sample parent relations:');
  for (let i = 0; i < Math.min(12, data.length); i++) {
    const p = parents[i];
    console.log(`${i}${p !== -1 ? ' <- ' + p : ''} [indent=${data[i].indent}] ${data[i].text}`);
  }
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
