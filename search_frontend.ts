import * as fs from 'fs';
import * as path from 'path';

function searchInDir(dir: string, term: string) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInDir(fullPath, term);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(term)) {
        console.log(`Found in file: ${fullPath}`);
      }
    }
  });
}

console.log("=== SEARCHING FOR BALANCE FETCH ===");
searchInDir('pages', 'balance');
searchInDir('src', 'balance');
