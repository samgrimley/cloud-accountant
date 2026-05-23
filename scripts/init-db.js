import "dotenv/config";
import { ensureSchema } from "../api/_lib/db.js";

try {
  await ensureSchema();
  console.log("Database schema is ready.");
  process.exit(0);
} catch (e) {
  console.error("Failed to initialise the database:", e.message);
  process.exit(1);
}
