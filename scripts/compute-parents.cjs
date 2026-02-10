const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) { console.error('File not found', filePath); process.exit(2); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  // Find header row (search first 10 rows for a cell containing 'PROYECTO')
  let headerRow = 1;
  let nameCol = 1;
  for (let r = 1; r <= 10; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const v = row.getCell(c).value;
      if (v && typeof v === 'string' && v.toLowerCase().includes('proyect')) {
        headerRow = r;
        nameCol = c;
        break;
      }
    }
    if (headerRow !== 1) break;
  }

  const data = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const cell = ws.getCell(r, nameCol);
    const text = cell && cell.value ? String(cell.value).trim() : '';
    if (!text) continue; // skip empty rows
    const indent = cell && cell.alignment && (cell.alignment.indent || 0) ? (cell.alignment.indent || 0) : 0;
    data.push({ excelRow: r, text, indent });
  }

  // compute parents
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

  // print sample
  for (let i = 0; i < data.length; i++) {
    const p = parents[i];
    console.log(`${i}${p !== -1 ? ' <- ' + p : ''} [indent=${data[i].indent}] ${data[i].text}`);
  }
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
