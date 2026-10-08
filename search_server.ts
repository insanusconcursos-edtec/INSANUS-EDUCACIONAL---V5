import * as fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log("=== ROTAS RELACIONADAS A PAGARME / SALDO ===");
lines.forEach((line, index) => {
  if (line.includes('app.get(') || line.includes('app.post(') || line.includes('pagarme') || line.includes('balance') || line.includes('recipient')) {
    if (line.includes('app.get') || line.includes('app.post')) {
      console.log(`Linha ${index + 1}: ${line.trim()}`);
    }
  }
});
