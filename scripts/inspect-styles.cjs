const XLSX = require('xlsx');
const fs = require('fs');

function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true, cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  for (let r = 2; r <= 60; r++) {
    const cellRef = `A${r}`;
    const cell = ws[cellRef];
    if (!cell) {
      console.log(`${cellRef}: <empty>`);
      continue;
    }
    console.log('---', cellRef, '---');
    console.dir(cell, { depth: 6, colors: false });
  }
  // Also print workbook.Stylistic or Workbook styles info if present
  if (wb && wb.Workbook) {
    console.log('Workbook metadata keys:', Object.keys(wb.Workbook));
  }
}

if (require.main === module) main();
