import * as fs from 'fs';
import * as path from 'path';

function searchInDir(dir: string, term: string) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'dist') return;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInDir(fullPath, term);
    } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(term)) {
        console.log(`Found in file: ${fullPath}`);
        // Log the lines
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(term)) {
            console.log(`  Line ${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

console.log("=== SEARCHING FOR PAGARME_SECRET_KEY ===");
searchInDir('.', 'PAGARME_SECRET_KEY');
