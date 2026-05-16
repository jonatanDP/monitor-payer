const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const requiredKeys = [
  "JWT_SECRET"
];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT || 5432),
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  jwtSecret: process.env.JWT_SECRET,
  deviceApiToken: process.env.DEVICE_API_TOKEN || "",
  corsOrigins: (process.env.CORS_ORIGINS || "https://jonatandp.github.io,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
