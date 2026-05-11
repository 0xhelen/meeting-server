import mongoose from "mongoose";

const OpenLogSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now, index: true },
  kind: { type: String, default: "apply" }, // e.g. "apply"
  jobKey: { type: String, default: "" }, // job id or invite token
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  os: { type: String, default: "" },
  location: {
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    country: { type: String, default: "" },
  },
});

OpenLogSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    if (ret.createdAt) ret.createdAt = ret.createdAt.toISOString();
    return ret;
  },
});

export const OpenLog = mongoose.models.OpenLog || mongoose.model("OpenLog", OpenLogSchema);

