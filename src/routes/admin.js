import express from "express";
import { requireAdmin, signAdminToken } from "../middleware/adminAuth.js";
import { createJob, deleteJob, getJob, listJobs, updateJob } from "../jobsService.js";
import { getPublicSettings, setCameraEnabled } from "../settingsService.js";
import { OpenLog } from "../models/OpenLog.js";
import { Application } from "../models/Application.js";
import { createInviteForJob, disableInvite, findInviteByToken, hardDeleteInvite, listInvitesForJob, updateInvite } from "../inviteService.js";
import { Job } from "../models/Job.js";
import { InviteLink } from "../models/InviteLink.js";
import mongoose from "mongoose";

const router = express.Router();

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "torToise";

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = signAdminToken();
    res.json({ token });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

router.get("/jobs", requireAdmin, async (_req, res) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load positions" });
  }
});

router.post("/jobs", requireAdmin, async (req, res) => {
  try {
    const job = await createJob(req.body?.title);
    res.status(201).json(job);
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not create position" });
  }
});

router.get("/jobs/:jobId", requireAdmin, async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(job);
});

router.put("/jobs/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await updateJob(req.params.jobId, req.body || {});
    if (!job) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(job);
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not save" });
  }
});

router.delete("/jobs/:jobId", requireAdmin, async (req, res) => {
  const ok = await deleteJob(req.params.jobId);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/open-logs", requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
    const kind = String(req.query.kind || "apply");

    const logs = await OpenLog.find({ kind }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load logs" });
  }
});

router.get("/applications", requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ fullName: rx }, { email: rx }, { linkedInUrl: rx }, { ip: rx }, { os: rx }, { jobTitle: rx }];
    }

    const docs = await Application.find(filter).sort({ submittedAt: -1 }).limit(limit).lean();
    const applications = docs.map((d) => ({
      id: String(d._id),
      submittedAt: d.submittedAt ? new Date(d.submittedAt).toISOString() : undefined,
      jobId: d.jobId ? String(d.jobId) : "",
      jobTitle: d.jobTitle || "",
      fullName: d.fullName || "",
      email: d.email || "",
      linkedInUrl: d.linkedInUrl || "",
      ip: d.ip || "",
      os: d.os || "",
      location: d.location || { city: "", region: "", country: "" },
    }));

    res.json({ applications });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load applications" });
  }
});

router.get("/jobs/:jobId/invites", requireAdmin, async (req, res) => {
  try {
    const invites = await listInvitesForJob(req.params.jobId);
    res.json({ invites });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load invites" });
  }
});

router.get("/invites", requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 500;
    const jobId = String(req.query.jobId || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (jobId) filter.jobId = jobId;

    if (q) {
      const extractInviteToken = (value) => {
        const raw = String(value || "").trim();
        const m = raw.match(/(?:^|\/)invite\/([^/?#]+)/i);
        if (m?.[1]) return m[1];
        return raw;
      };

      const tokenQuery = extractInviteToken(q);
      const isLikelyToken = /^[A-Za-z0-9_-]{20,}$/.test(tokenQuery);
      const isUrlTokenPaste = tokenQuery !== q;

      // If user pasted an invite URL or a token, prefer exact token match.
      const safe = tokenQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");

      const jobMatches = await Job.find({ title: rx }, { _id: 1 }).limit(250).lean();
      const jobIdsByTitle = jobMatches.map((j) => j._id);
      const maybeJobId = mongoose.isValidObjectId(tokenQuery) ? new mongoose.Types.ObjectId(tokenQuery) : null;

      filter.$or = [
        ...(isLikelyToken || isUrlTokenPaste ? [{ token: tokenQuery }] : []),
        { token: rx },
        { label: rx },
        ...(maybeJobId ? [{ jobId: maybeJobId }] : []),
        ...(jobIdsByTitle.length ? [{ jobId: { $in: jobIdsByTitle } }] : []),
      ];
    }

    const docs = await InviteLink.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    const jobIds = Array.from(new Set(docs.map((d) => String(d.jobId))));
    const jobs = await Job.find({ _id: { $in: jobIds } }).lean();
    const byId = new Map(jobs.map((j) => [String(j._id), j]));

    const invites = docs.map((d) => ({
      id: String(d._id),
      jobId: String(d.jobId),
      jobTitle: byId.get(String(d.jobId))?.title || "",
      token: d.token,
      label: d.label || "",
      enabled: d.enabled !== false,
      cameraEnabled: d.cameraEnabled !== false,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
      expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
    }));

    res.json({ invites });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load invites" });
  }
});

router.post("/jobs/:jobId/invites", requireAdmin, async (req, res) => {
  try {
    const invite = await createInviteForJob(req.params.jobId, {
      label: req.body?.label,
      expiresAt: req.body?.expiresAt,
    });
    res.status(201).json(invite);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not create invite" });
  }
});

router.delete("/invites/:inviteId", requireAdmin, async (req, res) => {
  try {
    const invite = await disableInvite(req.params.inviteId);
    if (!invite) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not disable invite" });
  }
});

router.delete("/invites/:inviteId/hard", requireAdmin, async (req, res) => {
  try {
    const invite = await hardDeleteInvite(req.params.inviteId);
    if (!invite) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not delete invite" });
  }
});

router.put("/invites/:inviteId", requireAdmin, async (req, res) => {
  try {
    const invite = await updateInvite(req.params.inviteId, req.body || {});
    if (!invite) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(invite);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not update invite" });
  }
});

router.get("/invites/lookup", requireAdmin, async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const invite = await findInviteByToken(token);
    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    const job = await Job.findById(invite.jobId).lean();
    res.json({
      invite,
      job: job ? { id: job._id.toString(), title: job.title } : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not lookup invite" });
  }
});

router.get("/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await getPublicSettings();
    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load settings" });
  }
});

router.put("/settings", requireAdmin, async (req, res) => {
  try {
    const cameraEnabled = await setCameraEnabled(req.body?.cameraEnabled);
    res.json({ cameraEnabled });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not save settings" });
  }
});

export default router;
