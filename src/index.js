import { getApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

const app = await getApp();

export default app;

// Local development only
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
