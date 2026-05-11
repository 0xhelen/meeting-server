import mongoose from "mongoose";

const VideoMetaSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    relativePath: String,
  },
  { _id: false }
);

const ApplicationSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  jobTitle: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  linkedInUrl: { type: String, required: true },
  ip: { type: String, default: "" },
  os: { type: String, default: "" },
  location: {
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    country: { type: String, default: "" },
  },
  locationSource: { type: String, default: "" },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  video: { type: VideoMetaSchema, default: null },
  submittedAt: { type: Date, default: Date.now },
});

ApplicationSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    if (ret.submittedAt) ret.submittedAt = ret.submittedAt.toISOString();
    if (ret.jobId) ret.jobId = ret.jobId.toString();
    return ret;
  },
});

export const Application =
  mongoose.models.Application || mongoose.model("Application", ApplicationSchema);
