import mongoose from "mongoose";

const InviteLinkSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  label: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  cameraEnabled: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

InviteLinkSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    if (ret.jobId) ret.jobId = ret.jobId.toString();
    if (ret.createdAt) ret.createdAt = ret.createdAt.toISOString();
    if (ret.expiresAt) ret.expiresAt = ret.expiresAt.toISOString();
    else ret.expiresAt = null;
    return ret;
  },
});

export const InviteLink = mongoose.models.InviteLink || mongoose.model("InviteLink", InviteLinkSchema);
