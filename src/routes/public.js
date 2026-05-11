import express from "express";
import path from "path";
import multer from "multer";
import geoip from "geoip-lite";

import { getJob, isJobReadyForPublic, listJobs } from "../jobsService.js";
import { getPublicSettings } from "../settingsService.js";
import { OpenLog } from "../models/OpenLog.js";
import { sanitizeAnswerHtml, sanitizeAnswersObject } from "../sanitizeAnswerHtml.js";
import { validateInviteToken } from "../inviteService.js";
import { createApplicationRecord } from "../applicationsService.js";

const router = express.Router();

function getClientIp(req) {
  // With `trust proxy`, express populates req.ip from X-Forwarded-For safely.
  // Fallback to headers/socket for local/dev.
  const xff = String(req.headers["x-forwarded-for"] || "");
  const fromXff = xff ? xff.split(",")[0].trim() : "";
  const raw = String(req.ip || fromXff || req.socket?.remoteAddress || "").trim();
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return ip === "::1" ? "127.0.0.1" : ip;
}

function detectOs(ua) {
  const s = String(ua || "");
  if (/windows nt/i.test(s)) return "Windows";
  if (/mac os x/i.test(s) && !/iphone|ipad|ipod/i.test(s)) return "macOS";
  if (/android/i.test(s)) return "Android";
  if (/iphone|ipad|ipod/i.test(s)) return "iOS";
  if (/linux/i.test(s)) return "Linux";
  return "Unknown";
}

function formatUtcPlus8(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(
    shifted.getUTCHours()
  )}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} (UTC+8)`;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "127.0.0.1") return true;
  if (ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.includes(":")) return true; // keep it simple; skip IPv6 geolocation for now
  return false;
}

async function geoLookup(ip) {
  // First try local DB (fast, offline).
  const geo = ip ? geoip.lookup(ip) : null;
  const fromLocal = geo
    ? { city: geo.city || "", region: geo.region || "", country: geo.country || "", source: "geoip-lite" }
    : null;
  if (fromLocal && (fromLocal.city || fromLocal.region || fromLocal.country)) return fromLocal;

  // If we can’t resolve locally and the IP is public, use an external lookup for better accuracy.
  if (!ip || isPrivateIp(ip)) return { city: "", region: "", country: "", source: "private-ip" };

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.reason || "lookup failed");
    return {
      city: data.city || "",
      region: data.region || data.region_code || "",
      country: data.country_name || data.country || "",
      source: "ipapi.co",
    };
  } catch {
    return { city: "", region: "", country: "", source: "unknown" };
  }
}

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
//   filename: (_req, file, cb) => {
//     const safe = file.originalname.replace(/[^\w.\-]/g, "_") || "intro.webm";
//     cb(null, `${Date.now()}-${safe}`);
//   },
// });

const upload = (name)=>{};

router.get("/jobs", async (_req, res) => {
  try {
    const jobs = await listJobs();
    const publicJobs = jobs
      .filter(isJobReadyForPublic)
      .map((j) => ({ id: j.id, title: j.title }));
    res.json({ jobs: publicJobs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load positions" });
  }
});

router.get("/jobs/:jobId/questions", async (req, res) => {
  try {
    const job = await getJob(req.params.jobId);
    if (!job || !isJobReadyForPublic(job)) {
      res.status(404).json({ error: "Position not found or not open" });
      return;
    }
    const settings = await getPublicSettings();
    res.json({
      jobId: job.id,
      jobTitle: job.title,
      ...settings,
      steps: job.steps.map((s) => ({
        ...s,
        prompt: sanitizeAnswerHtml(s.prompt || ""),
      })),
      video: job.video,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load questions" });
  }
});

router.get("/invites/:token/questions", async (req, res) => {
  try {
    const invite = await validateInviteToken(req.params.token);
    if (!invite) {
      res.status(404).json({ error: "Invite link is invalid or expired" });
      return;
    }
    const job = await getJob(invite.jobId);
    if (!job) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    const settings = await getPublicSettings();
    // For invite links, cameraEnabled is controlled per-link.
    // (Global camera setting is still returned in `settings` for reference/admin usage.)
    const cameraEnabled = invite.cameraEnabled !== false;
    res.json({
      jobId: job.id,
      jobTitle: job.title,
      inviteToken: invite.token,
      ...settings,
      cameraEnabled,
      steps: job.steps.map((s) => ({
        ...s,
        prompt: sanitizeAnswerHtml(s.prompt || ""),
      })),
      video: job.video,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load invite application" });
  }
});

router.post("/open-log", async (req, res) => {
  try {
    const kind = String(req.body?.kind || "apply");
    const jobKey = String(req.body?.jobKey || "").trim();
    const userAgent = String(req.headers["user-agent"] || "");
    const ip = getClientIp(req);

    const loc = await geoLookup(ip);
    const location = { city: loc.city, region: loc.region, country: loc.country };
    const os = detectOs(userAgent);

    const doc = await OpenLog.create({
      kind,
      jobKey,
      ip,
      userAgent,
      os,
      location,
    });

    res.json({
      ok: true,
      timeUtcPlus8: formatUtcPlus8(doc.createdAt),
      os,
      location,
      ip,
      locationSource: loc.source,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not log open" });
  }
});

router.post("/applications", upload("video"), async (req, res) => {
  const jobId = (req.body.jobId || "").trim();
  const inviteToken = (req.body.inviteToken || "").trim();
  const fullName = (req.body.fullName || "").trim();
  const email = (req.body.email || "").trim();
  const linkedInUrl = (req.body.linkedInUrl || "").trim();
  const userAgent = String(req.headers["user-agent"] || "");
  const ip = getClientIp(req);
  const os = detectOs(userAgent);
  let answers = {};
  try {
    answers = req.body.answers ? JSON.parse(req.body.answers) : {};
  } catch {
    res.status(400).json({ error: "Invalid answers payload" });
    return;
  }

  answers = sanitizeAnswersObject(answers);

  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }

  const job = await getJob(jobId);
  if (!job) {
    res.status(400).json({ error: "Invalid or closed position" });
    return;
  }

  const invite = inviteToken ? await validateInviteToken(inviteToken) : null;
  const allowByInvite = !!invite;
  const allowPublic = isJobReadyForPublic(job);
  if (!allowPublic && !allowByInvite) {
    res.status(400).json({ error: "Invalid or closed position" });
    return;
  }
  if (invite && invite.jobId !== String(job.id)) {
    res.status(400).json({ error: "Invite link does not match this position" });
    return;
  }

  if (!fullName || !email || !linkedInUrl) {
    res.status(400).json({ error: "fullName, email, and linkedInUrl are required" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Introduction video is required" });
    return;
  }

  try {
    const loc = await geoLookup(ip);
    const location = { city: loc.city, region: loc.region, country: loc.country };
    // const video = req.file
    //   ? {
    //       filename: req.file.filename,
    //       originalName: req.file.originalname,
    //       mimeType: req.file.mimetype,
    //       size: req.file.size,
    //       relativePath: path.join("uploads", req.file.filename),
    //     }
    //   : null;

    const { id } = await createApplicationRecord({
      jobId: job.id,
      jobTitle: job.title,
      fullName,
      email,
      linkedInUrl,
      ip,
      os,
      location,
      locationSource: loc.source,
      // You said you'll upload answers/video to another server.
      // We still accept them in the request, but don't store them here.
      answers: {},
      video: null,
    });
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save application" });
  }
});

export default router;
