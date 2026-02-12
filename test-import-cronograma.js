import { parseExcelFile } from './src/lib/parseExcel.js';
import { DEFAULT_CONFIG } from './src/lib/constants.js';
import fs from 'fs';

const buffer = fs.readFileSync('Cronograma 2026 - copia 2.xlsx');
const projects = parseExcelFile(buffer, DEFAULT_CONFIG);

console.log(`✅ Successfully parsed ${projects.length} projects\n`);

console.log('=== Sample Projects ===');
projects.slice(0, 10).forEach((p, i) => {
  console.log(`${i + 1}. ${p.name} (branch: ${p.branch}, assignee: ${p.assignee})`);
  if (p.startDate || p.endDate) {
    console.log(`   Dates: ${p.startDate?.toLocaleDateString() || '—'} → ${p.endDate?.toLocaleDateString() || '—'}`);
  }
  console.log(`   Days: ${p.daysRequired}, Priority: ${p.priority}, Type: ${p.type}`);
});

console.log(`\n... and ${projects.length - 10} more projects`);

// Check for issues
console.log('\n=== Quality Check ===');
const noName = projects.filter(p => !p.name || p.name.length === 0);
const noAssignee = projects.filter(p => !p.assignee);
const noDateRange = projects.filter(p => !p.startDate || !p.endDate);

console.log(`No name: ${noName.length}`);
console.log(`No assignee: ${noAssignee.length}`);
console.log(`No date range: ${noDateRange.length}`);
