const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  for (let r = 2; r <= 60; r++) {
    const cell = ws.getCell(`A${r}`);
    if (!cell) {
      console.log(`A${r}: <empty>`);
      continue;
    }
    const alignment = cell.alignment || null;
    console.log(`A${r}: value='${cell.value}' alignment=${JSON.stringify(alignment)}`);
  }
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
