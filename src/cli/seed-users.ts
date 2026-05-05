/**
 * Seed tài khoản đăng nhập (email + mật khẩu bcrypt).
 * Chạy: npm run seed:users  (cần MONGODB_URI hoặc MONGO_URL + JWT_SECRET trong .env)
 */
import "dotenv/config";
import { connectMongoDb, disconnectMongoDb } from "../db/mongo.js";
import { UserModel } from "../models/User.js";
import { hashLoginPassword } from "../auth/password.js";

const SEED_EMAILS = [
  "hiendt@esuhai.com",
  "ceo.offices@esuhai.com",
  "hoangkha@esuhai.com",
] as const;

const DEFAULT_PASSWORD = "123456789";

async function main(): Promise<void> {
  await connectMongoDb();
  const passwordHash = await hashLoginPassword(DEFAULT_PASSWORD);
  for (const email of SEED_EMAILS) {
    await UserModel.findOneAndUpdate(
      { email },
      {
        $set: { email, passwordHash },
        $setOnInsert: { mailbox: {} },
      },
      { upsert: true },
    );
    console.log(`OK  ${email}  (mật khẩu: ${DEFAULT_PASSWORD})`);
  }
  await disconnectMongoDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
