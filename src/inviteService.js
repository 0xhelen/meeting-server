import crypto from "crypto";
import mongoose from "mongoose";
import { InviteLink } from "./models/InviteLink.js";

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function listInvitesForJob(jobId) {
  const jid = String(jobId || "").trim();
  if (!mongoose.isValidObjectId(jid)) return [];
  const docs = await InviteLink.find({ jobId: jid }).sort({ createdAt: -1 }).lean();
  return docs.map(serializeDoc);
}

export async function createInviteForJob(jobId, { label = "", expiresAt = null } = {}) {
  const jid = String(jobId || "").trim();
  if (!mongoose.isValidObjectId(jid)) throw new Error("Invalid job");

  let token = generateToken();
  for (let i = 0; i < 5; i++) {
    const exists = await InviteLink.findOne({ token }).lean();
    if (!exists) break;
    token = generateToken();
  }

  const doc = await InviteLink.create({
    jobId: jid,
    token,
    label: String(label || "").trim(),
    enabled: true,
    cameraEnabled: true,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
  return serializeDoc(doc.toJSON ? doc.toJSON() : doc);
}

export async function disableInvite(inviteId) {
  if (!mongoose.isValidObjectId(inviteId)) return null;
  const doc = await InviteLink.findByIdAndUpdate(inviteId, { $set: { enabled: false } }, { new: true }).lean();
  return doc ? serializeDoc(doc) : null;
}

export async function hardDeleteInvite(inviteId) {
  if (!mongoose.isValidObjectId(inviteId)) return null;
  const doc = await InviteLink.findByIdAndDelete(inviteId).lean();
  return doc ? serializeDoc(doc) : null;
}

export async function updateInvite(inviteId, patch = {}) {
  if (!mongoose.isValidObjectId(inviteId)) return null;
  const set = {};
  if (typeof patch.label === "string") set.label = patch.label.trim();
  if (typeof patch.enabled === "boolean") set.enabled = patch.enabled;
  if (typeof patch.cameraEnabled === "boolean") set.cameraEnabled = patch.cameraEnabled;
  if (patch.expiresAt !== undefined) {
    set.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  }
  const doc = await InviteLink.findByIdAndUpdate(inviteId, { $set: set }, { new: true }).lean();
  return doc ? serializeDoc(doc) : null;
}

export async function findInviteByToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await InviteLink.findOne({ token: t }).lean();
  return doc ? serializeDoc(doc) : null;
}

export async function validateInviteToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await InviteLink.findOne({ token: t }).lean();
  if (!doc || doc.enabled === false) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
  return {
    token: doc.token,
    jobId: doc.jobId.toString(),
    cameraEnabled: doc.cameraEnabled !== false,
    enabled: doc.enabled !== false,
  };
}

function serializeDoc(d) {
  if (!d) return null;
  const id = d._id ? d._id.toString() : d.id;
  return {
    id,
    jobId: d.jobId ? d.jobId.toString() : String(d.jobId),
    token: d.token,
    label: d.label || "",
    enabled: d.enabled !== false,
    cameraEnabled: d.cameraEnabled !== false,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
  };
}
