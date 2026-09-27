require("dotenv").config();
if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
const bcrypt = require("bcryptjs");
const db = require("./db");

const ATTACK_TYPES = [
  "Web Application Attack",
  "Administrative Privilege Gain",
  "Information Leak",
  "Potentially Bad Traffic",
  "Command Execution",
  "Denial of Service",
];

const ORIGINS = ["China", "United States", "Russia", "Brazil", "Germany", "India", "Vietnam"];

function run() {
  const userCount = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync("password123", 10);
    const insertUser = db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    );
    insertUser.run("zemenu", hash, "SOC_ANALYST");
    insertUser.run("admin", hash, "SOC_ADMIN");
    insertUser.run("iranalyst", hash, "IR_ANALYST");
    console.log("Seeded users (password123 for all):");
    console.log("  zemenu     -> SOC_ANALYST");
    console.log("  admin      -> SOC_ADMIN");
    console.log("  iranalyst  -> IR_ANALYST");
  }

  const caseCount = db.prepare("SELECT COUNT(*) c FROM cases").get().c;
  if (caseCount === 0) {
    const insert = db.prepare(`
      INSERT INTO cases (title, status, severity, attack_type, origin_country, assigned_to, archived, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?)
    `);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(...r);
    });

    const rows = [];
    const months = ["01", "02", "03", "04", "05", "06", "07"];
    const monthWeights = [60, 10, 10, 30, 20, 10, 5]; // roughly matches the trend chart shape
    let idx = 0;
    monthWeights.forEach((count, mi) => {
      for (let i = 0; i < count; i++) {
        idx++;
        const attack = ATTACK_TYPES[idx % ATTACK_TYPES.length];
        const origin = ORIGINS[idx % ORIGINS.length];
        const date = `2026-${months[mi]}-${String((idx % 27) + 1).padStart(2, "0")}`;
        rows.push([
          `Incident #${1000 + idx} - ${attack}`,
          "Attempt",
          "N/A",
          attack,
          origin,
          date,
        ]);
      }
    });
    // trim/pad to exactly 145
    while (rows.length < 145) {
      idx++;
      rows.push([
        `Incident #${1000 + idx}`,
        "Attempt",
        "N/A",
        ATTACK_TYPES[idx % ATTACK_TYPES.length],
        ORIGINS[idx % ORIGINS.length],
        "2026-01-15",
      ]);
    }
    insertMany(rows.slice(0, 145));
    console.log("Seeded 145 cases");
  }
}

run();
