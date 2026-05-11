import mongoose from "mongoose";
import path from "path";
import { Job } from "./models/Job.js";
import { DATA_DIR, QUESTIONS_FILE } from "./paths.js";

const LEGACY_JOBS_FILE = path.join(DATA_DIR, "jobs.json");

/** Used only when no Atlas / URI configuration is provided. */
const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017/job_applications";

function resolveMongoUri() {
  const direct = (process.env.MONGODB_URI || "").trim();
  if (direct) return { uri: direct, source: "MONGODB_URI" };

  const user = (process.env.MONGODB_USER || "").trim();
  const pass = process.env.MONGODB_PASSWORD ?? "";
  const host = (process.env.MONGODB_HOST || "").trim();
  if (user && host) {
    const dbName = (process.env.MONGODB_DB_NAME || "job_applications").trim() || "job_applications";
    const appName = (process.env.MONGODB_APP_NAME || "Cluster0").trim() || "Cluster0";
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    const uri = `mongodb+srv://${u}:${p}@${host}/${dbName}?retryWrites=true&w=majority&appName=${encodeURIComponent(
      appName
    )}`;
    return { uri, source: "MONGODB_USER/MONGODB_PASSWORD/MONGODB_HOST" };
  }

  return { uri: DEFAULT_LOCAL_URI, source: "default-local" };
}


let connectPromise;

async function connectOnce() {
  const { uri, source } = resolveMongoUri();
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15_000,
    });
  } catch (e) {
    const msg = String(e?.message || e);
    let hint = "";
    if (/bad auth/i.test(msg)) {
      hint =
        "Atlas rejected the database username/password. Fix: reset the Database User password in Atlas → Database Access, then either (a) paste a fresh Drivers URI into MONGODB_URI, or (b) set MONGODB_USER + MONGODB_PASSWORD + MONGODB_HOST (password is auto URL-encoded). If this password was pasted into chat or committed, rotate it.";
    } else if (/whitelist|allowed ip|could not connect to.*servers/i.test(msg)) {
      hint =
        "Atlas Network Access must allow your host’s outbound IPs. For Vercel/serverless, add 0.0.0.0/0 (Atlas → Network Access → Add IP Address → Allow Access from Anywhere) or use Atlas Private Endpoint / VPC — dynamic IPs cannot be listed one-by-one.";
    } else if (source === "default-local") {
      hint =
        "Using default local MongoDB. Set MONGODB_URI (Atlas) or MONGODB_USER/MONGODB_PASSWORD/MONGODB_HOST, or start MongoDB on localhost:27017.";
    }
    if (hint) e.message = `${msg}\n${hint}`;
    throw e;
  }
  const mode = uri.includes("mongodb+srv") ? "Atlas" : "local";
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected (${mode}) via ${source}.`);
  await seedFromLegacyJsonIfEmpty();
}

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (!connectPromise) {
    connectPromise = connectOnce().finally(() => {
      connectPromise = null;
    });
  }
  await connectPromise;
}
