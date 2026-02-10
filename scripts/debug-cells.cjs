const XLSX = require('xlsx');
const fs = require('fs');

function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // Inspect first 40 rows in column A
  for (let r = 1; r <= 40; r++) {
    const cellRef = `A${r+1}`; // skip header assumption
    const cell = ws[cellRef];
    if (!cell) {
      console.log(`${cellRef}: <empty>`);
      continue;
    }
    const raw = cell.v;
    const text = (cell.w !== undefined) ? cell.w : String(raw);
    let prefixCodes = '';
    if (typeof raw === 'string' && raw.length > 0) {
      const firstChars = raw.slice(0,4).split('').map(c => c.charCodeAt(0).toString(16));
      prefixCodes = firstChars.join(',');
    }
    console.log(`${cellRef}: t=${cell.t} v=${JSON.stringify(raw)} w=${JSON.stringify(text)} prefixHex=[${prefixCodes}] style=${cell.s ? JSON.stringify(cell.s) : 'null'}`);
  }
}

if (require.main === module) main();
