import axios from 'axios';

const secretKey = (process.env.PAGARME_SECRET_KEY || '').trim();
const recipientId = 're_cmounropt1gh10l9t3bk49aiw';

async function testPagarme() {
  console.log("=== TESTANDO CONEXÃO LOCAL COM PAGAR.ME ===");
  console.log("Usando Secret Key:", secretKey ? `${secretKey.substring(0, 10)}...` : 'NÃO CONFIGURADA');
  
  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    const url = `https://api.pagar.me/core/v5/recipients/${recipientId}/balance`;
    console.log(`Buscando saldo para: ${recipientId}`);
    const response = await axios.get(url, { headers });
    console.log("✅ SUCESSO! Saldo retornado:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error("❌ ERRO NO TESTE LOCAL:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testPagarme();
