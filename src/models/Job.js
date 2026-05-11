import mongoose from "mongoose";

const StepSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "" },
    prompt: { type: String, default: "" },
  },
  { _id: false }
);

const JobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  published: { type: Boolean, default: false },
  steps: {
    type: [StepSchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length === 5,
      message: "Exactly five questions required.",
    },
  },
  video: {
    title: { type: String, default: "Introduction video" },
    instructions: { type: String, default: "" },
  },
  createdAt: { type: Date, default: Date.now },
});

JobSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    if (ret.createdAt) ret.createdAt = ret.createdAt.toISOString();
    return ret;
  },
});

export const Job = mongoose.models.Job || mongoose.model("Job", JobSchema);
