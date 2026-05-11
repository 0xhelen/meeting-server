import app from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

export default app;

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
