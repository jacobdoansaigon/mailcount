import mongoose from "mongoose";

const RecipientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    greeting: { type: String, default: "" },
    /** Chức vụ / vị trí — placeholder {{title}} */
    title: { type: String, default: "" },
    surveyCode: { type: String, default: "" },
  },
  { timestamps: true },
);

RecipientSchema.index({ userId: 1, email: 1 }, { unique: true });

export const RecipientModel =
  mongoose.models.Recipient ??
  mongoose.model("Recipient", RecipientSchema);
