console.log("=== CHECKING LOCAL PAGARME_SECRET_KEY ===");
console.log("PAGARME_SECRET_KEY present:", !!process.env.PAGARME_SECRET_KEY);
if (process.env.PAGARME_SECRET_KEY) {
  console.log("Key length:", process.env.PAGARME_SECRET_KEY.length);
  console.log("Key prefix:", process.env.PAGARME_SECRET_KEY.substring(0, 7));
}
