import "dotenv/config";

const url = process.env.DATABASE_URL || "";

if (!url) {
  console.error("\n❌ DATABASE_URL is not set in .env\n");
  process.exit(1);
}

if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
  console.error(
    "\n❌ DATABASE_URL does not point to localhost.\n" +
    `   Current value starts with: ${url.slice(0, 40)}...\n` +
    "   The 'dev' script runs db push + seed which would modify a remote database.\n" +
    "   Use 'dev:prod' to run against production without db modifications.\n"
  );
  process.exit(1);
}

console.log("✅ DATABASE_URL points to localhost");
