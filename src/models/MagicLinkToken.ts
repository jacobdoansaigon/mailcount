import mongoose from "mongoose";

const MagicLinkSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true },
);

MagicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MagicLinkTokenModel =
  mongoose.models.MagicLinkToken ??
  mongoose.model("MagicLinkToken", MagicLinkSchema);
