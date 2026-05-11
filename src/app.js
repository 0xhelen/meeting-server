import "./loadEnv.js";
import express from "express";
import cors from "cors";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { connectDatabase } from "./db.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", async (_req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (e) {
    console.error("MongoDB connection failed:", e?.message || e);

    res.status(503).json({
      error: "Database unavailable",
      detail: String(e?.message || e),
    });
  }
});

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

export default app;
