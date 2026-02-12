import ExcelJS from 'exceljs';

async function findObjectValues() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('Cronograma 2026 - copia 2.xlsx');
  
  const ws = wb.worksheets[0];
  console.log('🔍 SEARCHING FOR [object Object] VALUES\n');
  
  for (let rowNum = 2; rowNum <= Math.min(50, ws.rowCount); rowNum++) {
    const row = ws.getRow(rowNum);
    const cell = row.getCell(1);
    const value = cell.value;
    const indent = cell.alignment?.indent || 0;
    
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      console.log(`Row ${rowNum} (indent=${indent}):`);
      console.log(`  typeof: ${typeof value}`);
      console.log(`  constructor: ${value.constructor?.name}`);
      console.log(`  keys: ${Object.keys(value).join(', ')}`);
      
      if (value.formula) {
        console.log(`  formula: ${value.formula}`);
        console.log(`  result: ${value.result}`);
      }
      if (value.richText) {
        console.log(`  richText:`, value.richText.map(rt => rt.text).join(''));
      }
      
      console.log();
    }
  }
}

findObjectValues().catch(e => console.error('Error:', e.message));
