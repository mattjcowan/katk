import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "node:crypto";

// Recovery: set an account's password from the terminal (env is seed-only, so
// this is how you reset a forgotten admin/user password).
//   npm run set-password -- <email> <newPassword>

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const [email, pw] = process.argv.slice(2);
if (!email || !pw) {
  console.error("usage: npm run set-password -- <email> <newPassword>");
  process.exit(1);
}

const dataDir = process.env.KATK_DATA_DIR ?? "data";
const db = new Database(process.env.KATK_APP_DB ?? `${dataDir}/app.db`);
const u = db
  .prepare("select id from users where email = ?")
  .get(email.toLowerCase()) as { id: string } | undefined;
if (!u) {
  console.error(`no account with email: ${email}`);
  process.exit(1);
}
db.prepare(
  "update users set password_hash = ?, must_change_password = 0, updated_at = ? where id = ?",
).run(hashPassword(pw), Math.floor(Date.now() / 1000), u.id);
console.log(`Password updated for ${email} (must-change cleared).`);
