import ExcelJS from 'exceljs';

async function inspect() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('Cronograma 2026 - copia 2.xlsx');
  
  const ws = wb.worksheets[0];
  console.log('=== CRONOGRAMA INSPECTION ===');
  console.log('Sheet:', ws.name);
  console.log('Total rows:', ws.rowCount);
  console.log('Total columns:', ws.columnCount);
  
  console.log('\n=== Header Row ===');
  const headerRow = ws.getRow(1);
  const headers = [];
  for (let i = 1; i <= ws.columnCount && i <= 15; i++) {
    const cell = headerRow.getCell(i);
    headers.push(cell.value ? String(cell.value).substring(0, 20) : `[Col${i}]`);
  }
  console.log(headers.map((h, i) => `${i+1}:${h}`).join(' | '));
  
  console.log('\n=== Data Rows (first 12) ===');
  for (let rowNum = 2; rowNum <= Math.min(13, ws.rowCount); rowNum++) {
    const row = ws.getRow(rowNum);
    const cells = [];
    for (let col = 1; col <= Math.min(5, ws.columnCount); col++) {
      const cell = row.getCell(col);
      const indent = cell.alignment?.indent || 0;
      const indentStr = indent > 0 ? ' '.repeat(indent * 2) : '';
      const text = cell.value ? String(cell.value).substring(0, 25) : '—';
      cells.push(`${indentStr}${text}`);
    }
    console.log(`Row ${rowNum}: ${cells.join(' | ')}`);
  }
  
  console.log('\n=== Indent Distribution ===');
  const indentMap = {};
  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);
    const cell = row.getCell(1);
    const indent = cell.alignment?.indent || 0;
    const text = cell.value ? String(cell.value).substring(0, 30) : '';
    if (text.trim()) {
      if (!indentMap[indent]) indentMap[indent] = [];
      indentMap[indent].push(text);
    }
  }
  
  for (const [indent, items] of Object.entries(indentMap).sort((a, b) => a[0] - b[0])) {
    console.log(`Indent level ${indent}: ${items.length} items`);
    items.slice(0, 3).forEach(item => console.log(`  - ${item}`));
    if (items.length > 3) console.log(`  ... and ${items.length - 3} more`);
  }
}

inspect().catch(e => console.error('Error:', e.message));
