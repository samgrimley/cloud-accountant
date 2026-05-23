import { hashPassphrase } from "../api/_lib/auth.js";

const passphrase = process.argv[2];
if (!passphrase) {
  console.error('Usage: npm run hash-pass -- "your secret passphrase"');
  process.exit(1);
}

console.log("\nAdd this to your .env as APP_PASSPHRASE_HASH:\n");
console.log(hashPassphrase(passphrase));
console.log("");
