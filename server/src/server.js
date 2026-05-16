const app = require("./app");
const env = require("./config/env");
const { initializeDatabase } = require("./config/database");

const port = env.port || 4000;

async function startServer() {
  const databaseReady = await initializeDatabase();

  if (!databaseReady) {
    console.error("Server starting with database disconnected. Check PostgreSQL configuration.");
  }

  const server = app.listen(port, () => {
    console.log(`Secure Screen Manager API listening on port ${port}`);
  });

  server.requestTimeout = 15000;
  server.headersTimeout = 20000;
  server.keepAliveTimeout = 65000;
}

startServer().catch((error) => {
  console.error("Server bootstrap failed:", error.message);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error("[process] Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error);
});
