import ExcelJS from 'exceljs';

async function showHierarchy() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('Cronograma 2026 - copia 2.xlsx');
  
  const ws = wb.worksheets[0];
  console.log('📊 CRONOGRAMA 2026 - ESTRUCTURA JERÁRQUICA\n');
  
  const items = [];
  
  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);
    const cell = row.getCell(1);
    const indent = cell.alignment?.indent || 0;
    const text = cell.value ? String(cell.value).trim() : '';
    
    if (text.length > 0) {
      items.push({ indent, text, row: rowNum });
    }
  }
  
  // Display tree
  items.forEach((item, idx) => {
    const prefix = item.indent > 0 ? '  '.repeat(item.indent - 1) + '└─ ' : '';
    const sep = item.indent === 0 ? '═' : '─';
    console.log(`${prefix}${item.text.substring(0, 50)}`);
    
    // Show summary every 10 items
    if ((idx + 1) % 12 === 0 && idx < items.length - 1) {
      console.log(`\n... (mostrando ${idx + 1}/${items.length} items)\n`);
    }
  });
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total items: ${items.length}`);
  console.log(`Indent levels: ${new Set(items.map(i => i.indent)).size}`);
  
  // Count by indent
  const byIndent = {};
  items.forEach(item => {
    byIndent[item.indent] = (byIndent[item.indent] || 0) + 1;
  });
  
  console.log('\nDistribution by level:');
  Object.keys(byIndent).sort((a, b) => a - b).forEach(level => {
    const name = level == 0 ? 'Root (Level 0)' : 
                 level == 1 ? 'Category Level 1' :
                 level == 2 ? 'Subcategory Level 2' :
                 level == 3 ? 'Project Level 3' :
                 `Deep Level ${level}`;
    console.log(`  ${name}: ${byIndent[level]} items`);
  });
}

showHierarchy().catch(e => console.error('Error:', e.message));
