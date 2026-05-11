import mongoose from "mongoose";

const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017/job_applications";

function resolveMongoUri() {
  const direct = (process.env.MONGODB_URI || "").trim();

  if (direct) {
    return {
      uri: direct,
      source: "MONGODB_URI",
    };
  }

  const user = (process.env.MONGODB_USER || "").trim();
  const pass = process.env.MONGODB_PASSWORD ?? "";
  const host = (process.env.MONGODB_HOST || "").trim();

  if (user && host) {
    const dbName =
      (process.env.MONGODB_DB_NAME || "job_applications").trim() ||
      "job_applications";

    const appName =
      (process.env.MONGODB_APP_NAME || "Cluster0").trim() ||
      "Cluster0";

    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);

    const uri = `mongodb+srv://${u}:${p}@${host}/${dbName}?retryWrites=true&w=majority&appName=${encodeURIComponent(
      appName
    )}`;

    return {
      uri,
      source: "MONGODB_USER/MONGODB_PASSWORD/MONGODB_HOST",
    };
  }

  return {
    uri: DEFAULT_LOCAL_URI,
    source: "default-local",
  };
}

let connectPromise;

async function connectOnce() {
  const { uri, source } = resolveMongoUri();

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
  } catch (e) {
    const msg = String(e?.message || e);

    let hint = "";

    if (/bad auth/i.test(msg)) {
      hint =
        "Atlas authentication failed. Check MONGODB_URI or database username/password.";
    } else if (
      /whitelist|allowed ip|could not connect to.*servers/i.test(msg)
    ) {
      hint =
        "Atlas Network Access must allow Vercel/serverless IPs. Add 0.0.0.0/0 in MongoDB Atlas Network Access.";
    } else if (source === "default-local") {
      hint =
        "Using local MongoDB. Set MONGODB_URI for production deployments.";
    }

    if (hint) {
      e.message = `${msg}\n${hint}`;
    }

    throw e;
  }

  const mode = uri.includes("mongodb+srv") ? "Atlas" : "local";

  console.log(`MongoDB connected (${mode}) via ${source}.`);
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
