import { getApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

const app = await getApp();

export default app;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

