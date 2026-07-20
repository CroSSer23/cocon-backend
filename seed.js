/*
 * Bootstrap seeder for the reconstructed Cocon backend.
 * - waits for MySQL
 * - applies schema.sql (CREATE TABLE IF NOT EXISTS ...) statement-by-statement
 * - seeds a BusinessType / Organisation / OrganisationLocation / Admin so the CMS can log in
 * Idempotent: safe to run on every boot.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql");

const cfg = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectTimeout: 15000,
  multipleStatements: true,
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@cocon.local";
const ADMIN_PASSWORD_MD5 = process.env.ADMIN_PASSWORD_MD5; // md5 of the plaintext password
const ADMIN_NAME = process.env.ADMIN_NAME || "Super Admin";

function connectWithRetry(attempt = 1) {
  return new Promise((resolve, reject) => {
    const conn = mysql.createConnection(cfg);
    conn.connect((err) => {
      if (err) {
        if (attempt >= 30) return reject(err);
        console.log(`[seed] DB not ready (attempt ${attempt}): ${err.code}. retrying in 2s`);
        setTimeout(() => connectWithRetry(attempt + 1).then(resolve, reject), 2000);
      } else {
        resolve(conn);
      }
    });
  });
}

function q(conn, sql, params = []) {
  return new Promise((resolve, reject) =>
    conn.query(sql, params, (err, res) => (err ? reject(err) : resolve(res)))
  );
}

// naive splitter: statements separated by ";\n". schema.sql is generated so this is safe.
function splitStatements(sql) {
  return sql
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length && !s.startsWith("--"));
}

(async () => {
  let conn;
  try {
    conn = await connectWithRetry();
    console.log("[seed] connected to MySQL");
  } catch (e) {
    console.error("[seed] could not connect to MySQL:", e.message);
    process.exit(0); // do not block API start
  }

  // 1) schema
  const schemaPath = path.join(__dirname, "schema.sql");
  if (fs.existsSync(schemaPath)) {
    const stmts = splitStatements(fs.readFileSync(schemaPath, "utf8"));
    let ok = 0,
      fail = 0;
    for (const s of stmts) {
      try {
        await q(conn, s);
        ok++;
      } catch (e) {
        fail++;
        console.warn("[seed] stmt failed:", e.code, "-", s.slice(0, 80).replace(/\s+/g, " "));
      }
    }
    console.log(`[seed] schema applied: ${ok} ok, ${fail} failed, ${stmts.length} total`);
  } else {
    console.warn("[seed] schema.sql not found — skipping schema step");
  }

  // 2) base rows + admin (each guarded so a column mismatch never aborts the rest)
  const tryQ = async (label, sql, params = []) => {
    try {
      await q(conn, sql, params);
      console.log(`[seed] ${label}: ok`);
    } catch (e) {
      console.warn(`[seed] ${label}: ${e.code} ${e.sqlMessage || e.message}`);
    }
  };

  await tryQ("BusinessType", "INSERT IGNORE INTO `BusinessType` (`BusinessTypeId`,`Name`) VALUES (1,'Spa')");
  await tryQ(
    "Organisation",
    "INSERT IGNORE INTO `Organisation` (`OrganisationId`,`Name`) VALUES (1,'Cocon Demo')"
  );
  await tryQ(
    "OrganisationLocation",
    "INSERT IGNORE INTO `OrganisationLocation` (`OrganisationLocationId`,`OrganisationId`,`Name`,`Deleted`) VALUES (1,1,'Cocon Demo Location',0)"
  );

  if (!ADMIN_PASSWORD_MD5) {
    console.warn("[seed] ADMIN_PASSWORD_MD5 not set — skipping admin seed");
  } else {
    try {
      const rows = await q(conn, "SELECT `AdminId` FROM `Admin` WHERE `Email` = ?", [ADMIN_EMAIL]);
      if (rows.length) {
        await tryQ(
          "Admin(update)",
          "UPDATE `Admin` SET `Password`=?, `Deleted`=0 WHERE `Email`=?",
          [ADMIN_PASSWORD_MD5, ADMIN_EMAIL]
        );
      } else {
        await tryQ(
          "Admin(insert)",
          "INSERT INTO `Admin` (`Email`,`Password`,`Name`,`Type`,`Deleted`,`OrganisationLocationId`) VALUES (?,?,?,?,0,1)",
          [ADMIN_EMAIL, ADMIN_PASSWORD_MD5, ADMIN_NAME, 0]
        );
      }
    } catch (e) {
      console.warn("[seed] admin seed failed:", e.code, e.sqlMessage || e.message);
    }
  }

  conn.end();
  console.log("[seed] done");
  process.exit(0);
})();
