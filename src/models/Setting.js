import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema({
  cameraEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

SettingSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Setting = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
