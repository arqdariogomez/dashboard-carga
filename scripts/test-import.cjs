const XLSX = require('xlsx');
const fs = require('fs');

function readSheetRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  return rows;
}

function countLeadingSpaces(s) {
  if (!s || typeof s !== 'string') return 0;
  const m = s.match(/^\s*/);
  return m ? m[0].length : 0;
}

function detectIndentLevels(rows, nameColIndex = 0) {
  return rows.map((r) => {
    const cell = r[nameColIndex];
    const spaces = countLeadingSpaces(cell);
    const indent = Math.floor(spaces / 2);
    return indent;
  });
}

function buildProjectsFromRows(rows, nameColIndex = 0) {
  const indentLevels = detectIndentLevels(rows, nameColIndex);
  const projects = [];
  for (let i = 0; i < rows.length; i++) {
    const nameRaw = rows[i][nameColIndex];
    const name = (nameRaw || '').toString().trim();
    const indent = indentLevels[i];
    const project = {
      _originalRow: i,
      id: `r${i}`,
      name: name,
      indent,
      parentOriginalRow: null,
    };
    if (indent > 0) {
      // find previous row with indent == indent-1
      for (let j = i - 1; j >= 0; j--) {
        if (indentLevels[j] === indent - 1) {
          project.parentOriginalRow = j;
          break;
        }
      }
    }
    projects.push(project);
  }

  // map parentOriginalRow to parentId
  const originalToId = Object.fromEntries(projects.map(p => [p._originalRow, p.id]));
  for (const p of projects) {
    if (p.parentOriginalRow !== null && originalToId[p.parentOriginalRow]) {
      p.parentId = originalToId[p.parentOriginalRow];
    } else {
      p.parentId = null;
    }
  }

  return projects;
}

function printHierarchy(projects) {
  for (const p of projects) {
    console.log(`${p.id}${p.parentId ? ' <- ' + p.parentId : ''} [indent=${p.indent}] ${p.name}`);
  }
}

function main() {
  const filePath = process.argv[2] || 'C:\\AI\\proyectos\\dashboard-carga\\Cronograma 2026 - copia 2.xlsm';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }
  const rows = readSheetRows(filePath);
  // skip header row if it looks like headers (heuristic: first row contains non-empty strings)
  let startIndex = 0;
  if (rows.length > 1 && rows[0].some(c => typeof c === 'string' && c.trim().length > 0)) {
    startIndex = 1;
  }
  const dataRows = rows.slice(startIndex).filter(r => r && r.length > 0 && r.some(c => c !== undefined && c !== null && c !== ''));
  const projects = buildProjectsFromRows(dataRows, 0);
  printHierarchy(projects);
}

if (require.main === module) main();
