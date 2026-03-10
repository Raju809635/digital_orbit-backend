import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import { google } from "googleapis";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const leadNotificationEmail = process.env.LEAD_NOTIFICATION_EMAIL_TO;

const smtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM &&
  leadNotificationEmail;

const mailTransporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : null;

const sheetsConfigured =
  process.env.GOOGLE_SHEET_ID &&
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY;

const googlePrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const googleAuth = sheetsConfigured
  ? new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      undefined,
      googlePrivateKey,
      ["https://www.googleapis.com/auth/spreadsheets"]
    )
  : null;
const sheetsApi = googleAuth ? google.sheets({ version: "v4", auth: googleAuth }) : null;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    service: "digital-orbit-api",
    status: "ok",
    endpoints: ["/api/health", "/api/contact"]
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "digital-orbit-api",
    integrations: {
      email: Boolean(mailTransporter),
      googleSheets: Boolean(sheetsApi)
    }
  });
});

async function sendLeadEmail(submission) {
  if (!mailTransporter || !leadNotificationEmail) {
    return { skipped: true };
  }

  const subject = `New Digital Orbit Lead: ${submission.name}`;
  const text = `A new lead has submitted the contact form.

Name: ${submission.name}
Email: ${submission.email}
Budget: ${submission.budget}
Created At: ${submission.createdAt}

Project Idea:
${submission.projectIdea}
`;

  await mailTransporter.sendMail({
    from: process.env.SMTP_FROM,
    to: leadNotificationEmail,
    replyTo: submission.email,
    subject,
    text
  });

  return { skipped: false };
}

async function appendLeadToSheet(submission) {
  if (!sheetsApi) {
    return { skipped: true };
  }

  const row = [
    submission.createdAt,
    submission.name,
    submission.email,
    submission.budget,
    submission.projectIdea
  ];

  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.GOOGLE_SHEET_NAME || "Leads"}!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [row]
    }
  });

  return { skipped: false };
}

app.post("/api/contact", async (req, res) => {
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

  console.log("New contact submission:", submission);
  const results = await Promise.allSettled([sendLeadEmail(submission), appendLeadToSheet(submission)]);
  const failures = results.filter((result) => result.status === "rejected");

  if (failures.length === results.length) {
    console.error("Lead integrations failed:", failures);
    return res.status(500).json({ message: "Unable to save lead right now. Please try again." });
  }

  return res.status(201).json({ message: "Contact request received." });
});

app.listen(port, () => {
  console.log(`Digital Orbit API running at http://localhost:${port}`);
});
