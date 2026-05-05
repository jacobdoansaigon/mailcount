import mongoose from "mongoose";

/** Railway Mongo plugin thường inject `MONGO_URL`; code ưu tiên `MONGODB_URI` nếu có. */
function mongoConnectionUri(): string | undefined {
  const a = process.env["MONGODB_URI"]?.trim();
  const b = process.env["MONGO_URL"]?.trim();
  return a || b || undefined;
}

export function isMongoMultiUser(): boolean {
  return Boolean(mongoConnectionUri());
}

export async function connectMongoDb(): Promise<void> {
  const uri = mongoConnectionUri();
  if (!uri) throw new Error("Thiếu MONGODB_URI hoặc MONGO_URL.");
  mongoose.set("strictQuery", true);
  /**
   * Giới hạn thời gian chọn server — tránh treo vô hạn trước `app.listen`.
   * Nếu không có timeout, Railway healthcheck (45s) hết hạn → gửi SIGTERM,
   * npm in ra `signal SIGTERM` dù lỗi gốc là không kết nối được Mongo.
   */
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
  });
}

export async function disconnectMongoDb(): Promise<void> {
  await mongoose.disconnect().catch(() => undefined);
}
