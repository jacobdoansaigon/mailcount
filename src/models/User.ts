import mongoose from "mongoose";

const MailboxSchema = new mongoose.Schema(
  {
    smtpUser: { type: String, default: "" },
    smtpPassEnc: { type: String, default: "" },
    smtpHost: { type: String, default: "" },
    smtpPort: { type: Number, default: 587 },
    smtpSecure: { type: Boolean, default: false },
    imapHost: { type: String, default: "" },
    imapPort: { type: Number, default: 993 },
    imapTls: { type: Boolean, default: true },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    mailbox: { type: MailboxSchema, default: () => ({}) },
    /** Mật khẩu đăng nhập web (bcrypt); không trả về mặc định — dùng `.select("+passwordHash")` khi cần. */
    passwordHash: {
      type: String,
      default: "",
      select: false,
    },
    sendDelayMs: { type: Number, default: 3500 },
  },
  { timestamps: true },
);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const UserModel =
  mongoose.models.User ?? mongoose.model("User", UserSchema);
