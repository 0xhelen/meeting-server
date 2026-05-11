import { Setting } from "./models/Setting.js";

async function ensureDoc() {
  let doc = await Setting.findOne();
  if (!doc) {
    doc = await Setting.create({ cameraEnabled: true });
  }
  return doc;
}

export async function getPublicSettings() {
  const doc = await ensureDoc();
  return {
    cameraEnabled: doc.cameraEnabled !== false,
  };
}

export async function getCameraEnabled() {
  const doc = await ensureDoc();
  return doc.cameraEnabled !== false;
}

export async function setCameraEnabled(value) {
  const enabled = value !== false;
  await Setting.findOneAndUpdate(
    {},
    { $set: { cameraEnabled: enabled, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return enabled;
}
