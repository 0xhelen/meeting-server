import { getApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

const app = await getApp();

export default app;

// Only run locally
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
