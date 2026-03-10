import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    service: "digital-orbit-api",
    status: "ok",
    endpoints: ["/api/health", "/api/contact"]
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "digital-orbit-api" });
});

app.post("/api/contact", (req, res) => {
  const { name, email, projectIdea, budget } = req.body ?? {};

  if (!name || !email || !projectIdea || !budget) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const submission = {
    name,
    email,
    projectIdea,
    budget,
    createdAt: new Date().toISOString()
  };

  // Replace this with persistence/email integration.
  console.log("New contact submission:", submission);

  return res.status(201).json({ message: "Contact request received." });
});

app.listen(port, () => {
  console.log(`Digital Orbit API running at http://localhost:${port}`);
});
