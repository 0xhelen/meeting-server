import mongoose from "mongoose";
import { Job } from "./models/Job.js";
import { InviteLink } from "./models/InviteLink.js";
import { htmlToPlainTextServer, sanitizeAnswerHtml } from "./sanitizeAnswerHtml.js";

function defaultVideo() {
  return {
    title: "Introduction video",
    instructions:
      "Record a short introduction of up to two minutes. Speak clearly; you may describe your aims and what you would bring to the role.",
  };
}

function defaultSteps() {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `q${n}`,
    title: `Section ${n}`,
    prompt: "",
  }));
}

export function isJobReadyForPublic(job) {
  if (!job?.published) return false;
  if (!job.steps || job.steps.length !== 5) return false;
  return job.steps.every((s) => typeof s.prompt === "string" && htmlToPlainTextServer(s.prompt).length > 0);
}

function jobDocToClient(doc) {
  if (!doc) return null;
  return doc.toJSON();
}

export async function listJobs() {
  const docs = await Job.find().sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    id: d._id.toString(),
    title: d.title,
    published: d.published,
    steps: d.steps,
    video: d.video,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
  }));
}

export async function getJob(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  if (!mongoose.isValidObjectId(key)) return null;
  const doc = await Job.findById(key);
  return jobDocToClient(doc);
}

export async function createJob(title, _slugIgnored) {
  const t = (title || "").trim();
  if (!t) throw new Error("Title required");

  const doc = await Job.create({
    title: t,
    published: false,
    steps: defaultSteps(),
    video: defaultVideo(),
  });
  return jobDocToClient(doc);
}

export async function updateJob(id, payload) {
  if (!mongoose.isValidObjectId(id)) return null;
  const cur = await Job.findById(id);
  if (!cur) return null;

  if (typeof payload.title === "string") {
    cur.title = payload.title.trim() || cur.title;
  }

  if (payload.steps !== undefined) {
    if (!Array.isArray(payload.steps) || payload.steps.length !== 5) {
      throw new Error("Exactly five questions required.");
    }
    cur.steps = payload.steps.map((s, i) => ({
      id: `q${i + 1}`,
      title: (s?.title ?? "").trim() || `Section ${i + 1}`,
      prompt: sanitizeAnswerHtml(String(s?.prompt ?? "")),
    }));
  }

  if (payload.video) {
    cur.video = {
      title: (payload.video.title ?? "").trim() || cur.video.title,
      instructions: (payload.video.instructions ?? "").trim() || cur.video.instructions,
    };
  }

  if (typeof payload.published === "boolean") {
    cur.published = payload.published;
  }

  if (cur.published) {
    if (!cur.steps || cur.steps.length !== 5) {
      throw new Error("Cannot publish without five questions.");
    }
    if (!cur.steps.every((s) => s.title.trim() && htmlToPlainTextServer(s.prompt))) {
      throw new Error(
        "Cannot publish until each slot has a section title and question text (one or two sentences)."
      );
    }
  }

  await cur.save();
  return jobDocToClient(cur);
}

export async function deleteJob(id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const r = await Job.findByIdAndDelete(id);
  if (r) {
    await InviteLink.deleteMany({ jobId: r._id });
  }
  return !!r;
}
