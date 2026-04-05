const url = process.env.DATABASE_URL || "";

if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
  console.error(
    "\n❌ DATABASE_URL does not point to localhost.\n" +
    "   The 'dev' script runs db push + seed which would modify a remote database.\n" +
    "   Use 'dev:prod' to run against production without db modifications.\n"
  );
  process.exit(1);
}
