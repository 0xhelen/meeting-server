import mongoose from "mongoose";
import { Application } from "./models/Application.js";

export async function createApplicationRecord(payload) {
  const doc = await Application.create({
    jobId: new mongoose.Types.ObjectId(payload.jobId),
    jobTitle: payload.jobTitle,
    fullName: payload.fullName,
    email: payload.email,
    linkedInUrl: payload.linkedInUrl,
    ip: String(payload.ip || ""),
    os: String(payload.os || ""),
    location: payload.location || undefined,
    locationSource: String(payload.locationSource || ""),
    answers: payload.answers || {},
    ...(payload.video ? { video: payload.video } : {}),
  });
  const json = doc.toJSON();
  return { id: json.id };
}
