
import express from "express";
import geoip from "geoip-lite";

import { getJob, isJobReadyForPublic, listJobs } from "../jobsService.js";
import { getPublicSettings } from "../settingsService.js";
import { OpenLog } from "../models/OpenLog.js";
import {
  sanitizeAnswerHtml,
  sanitizeAnswersObject,
} from "../sanitizeAnswerHtml.js";
import { validateInviteToken } from "../inviteService.js";
import { createApplicationRecord } from "../applicationsService.js";

const router = express.Router();

/*
IMPORTANT

In your main server/app file add:

app.set("trust proxy", true);

Without this, req.ip may return proxy IPs instead of real client IPs.
*/

function normalizeIp(ip) {
  if (!ip) return "";

  ip = String(ip).trim();

  // x-forwarded-for may contain:
  // client, proxy1, proxy2
  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  // IPv4 mapped IPv6
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  // localhost
  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
}

function getClientIp(req) {
  const candidates = [
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"],
    req.ip,
    req.socket?.remoteAddress,
    req.connection?.remoteAddress,
  ];

  for (const value of candidates) {
    if (!value) continue;

    const ip = normalizeIp(value);

    if (ip) {
      return ip;
    }
  }

  return "";
}

function detectOs(ua) {
  const s = String(ua || "");

  if (/windows nt/i.test(s)) return "Windows";

  if (/mac os x/i.test(s) && !/iphone|ipad|ipod/i.test(s)) {
    return "macOS";
  }

  if (/android/i.test(s)) return "Android";

  if (/iphone|ipad|ipod/i.test(s)) return "iOS";

  if (/linux/i.test(s)) return "Linux";

  return "Other";
}

function formatUtcPlus8(iso) {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, "0");

  return `${shifted.getUTCFullYear()}-${pad(
    shifted.getUTCMonth() + 1
  )}-${pad(shifted.getUTCDate())} ${pad(
    shifted.getUTCHours()
  )}:${pad(shifted.getUTCMinutes())}:${pad(
    shifted.getUTCSeconds()
  )} (UTC+8)`;
}

function isPrivateIp(ip) {
  if (!ip) return true;

  // localhost
  if (ip === "127.0.0.1" || ip === "::1") {
    return true;
  }

  // IPv4 private ranges
  if (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  ) {
    return true;
  }

  // IPv6 private/local
  if (
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  ) {
    return true;
  }

  return false;
}

async function geoLookup(ip) {
  const empty = {
    city: "",
    region: "",
    country: "",
    source: "unknown",
  };

  if (!ip || isPrivateIp(ip)) {
    return {
      ...empty,
      source: "private-ip",
    };
  }

  // 1. Local lookup
  try {
    const geo = geoip.lookup(ip);

    if (geo) {
      return {
        city: geo.city || "",
        region: geo.region || "",
        country: geo.country || "",
        source: "geoip-lite",
      };
    }
  } catch (err) {
    console.error("geoip-lite error:", err);
  }

  // 2. External fallback
  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    const res = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    return {
      city: data.city || "",
      region: data.region || data.region_code || "",
      country: data.country_name || data.country || "",
      source: "ipapi.co",
    };
  } catch (err) {
    console.error("External geo lookup failed:", err);

    return empty;
  }
}

const upload = (_fieldName) => {
  return (_req, _res, next) => {
    next();
  };
};

router.get("/jobs", async (_req, res) => {
  try {
    const jobs = await listJobs();

    const publicJobs = jobs
      .filter(isJobReadyForPublic)
      .map((j) => ({
        id: j.id,
        title: j.title,
      }));

    res.json({ jobs: publicJobs });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Could not load positions",
    });
  }
});

router.get("/jobs/:jobId/questions", async (req, res) => {
  try {
    const job = await getJob(req.params.jobId);

    if (!job || !isJobReadyForPublic(job)) {
      res.status(404).json({
        error: "Position not found or not open",
      });

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

    res.status(500).json({
      error: "Could not load questions",
    });
  }
});

router.get("/invites/:token/questions", async (req, res) => {
  try {
    const invite = await validateInviteToken(req.params.token);

    if (!invite) {
      res.status(404).json({
        error: "Invite link is invalid or expired",
      });

      return;
    }

    const job = await getJob(invite.jobId);

    if (!job) {
      res.status(404).json({
        error: "Position not found",
      });

      return;
    }

    const settings = await getPublicSettings();

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

    res.status(500).json({
      error: "Could not load invite application",
    });
  }
});

router.post("/open-log", async (req, res) => {
  try {
    const kind = String(req.body?.kind || "apply");

    const jobKey = String(req.body?.jobKey || "").trim();

    const userAgent = String(req.headers["user-agent"] || "");

    const ip = getClientIp(req);

    console.log("Detected IP:", ip);

    console.log({
      reqIp: req.ip,
      xForwardedFor: req.headers["x-forwarded-for"],
      xRealIp: req.headers["x-real-ip"],
      remoteAddress: req.socket?.remoteAddress,
    });

    const loc = await geoLookup(ip);

    const location = {
      city: loc.city,
      region: loc.region,
      country: loc.country,
    };

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
      ip,
      os,
      location,
      locationSource: loc.source,
      timeUtcPlus8: formatUtcPlus8(doc.createdAt),
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Could not log open",
    });
  }
});

router.post(
  "/applications",
  upload("video"),
  async (req, res) => {
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
      answers = req.body.answers
        ? JSON.parse(req.body.answers)
        : {};
    } catch {
      res.status(400).json({
        error: "Invalid answers payload",
      });

      return;
    }

    answers = sanitizeAnswersObject(answers);

    if (!jobId) {
      res.status(400).json({
        error: "jobId is required",
      });

      return;
    }

    const job = await getJob(jobId);

    if (!job) {
      res.status(400).json({
        error: "Invalid or closed position",
      });

      return;
    }

    const invite = inviteToken
      ? await validateInviteToken(inviteToken)
      : null;

    const allowByInvite = !!invite;

    const allowPublic = isJobReadyForPublic(job);

    if (!allowPublic && !allowByInvite) {
      res.status(400).json({
        error: "Invalid or closed position",
      });

      return;
    }

    if (invite && invite.jobId !== String(job.id)) {
      res.status(400).json({
        error: "Invite link does not match this position",
      });

      return;
    }

    if (!fullName || !email || !linkedInUrl) {
      res.status(400).json({
        error:
          "fullName, email, and linkedInUrl are required",
      });

      return;
    }

    if (!req.file) {
      res.status(400).json({
        error: "Introduction video is required",
      });

      return;
    }

    try {
      const loc = await geoLookup(ip);

      const location = {
        city: loc.city,
        region: loc.region,
        country: loc.country,
      };

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
        answers: {},
        video: null,
      });

      res.status(201).json({
        ok: true,
        id,
      });
    } catch (e) {
      console.error(e);

      res.status(500).json({
        error: "Could not save application",
      });
    }
  }
);

export default router;

