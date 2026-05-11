import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
/** Optional one-time seed source when the DB has no jobs yet */
export const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
