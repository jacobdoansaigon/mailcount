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
  await mongoose.connect(uri);
}

export async function disconnectMongoDb(): Promise<void> {
  await mongoose.disconnect().catch(() => undefined);
}
