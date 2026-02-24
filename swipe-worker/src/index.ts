import express from "express";
import { processJob } from "./process-job";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WORKER_SECRET = process.env.WORKER_SECRET;

if (!WORKER_SECRET) {
  console.error("WORKER_SECRET is required");
  process.exit(1);
}

// Auth middleware
function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${WORKER_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Process a swipe job (responds immediately, processes async)
app.post("/process", authenticate, (req, res) => {
  const { jobId } = req.body;
  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }

  // Start processing in the background
  processJob(jobId).catch((err) => {
    console.error(`[Worker] Unhandled error for job ${jobId}:`, err);
  });

  res.json({ accepted: true, jobId });
});

app.listen(PORT, () => {
  console.log(`[Worker] Swipe worker listening on port ${PORT}`);
});
