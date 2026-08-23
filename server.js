import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "./src/conversationFlow.js";
import { markRead } from "./src/whatsappClient.js";
import { listBookings } from "./src/db.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const from = message.from;

    if (message.id) {
      markRead(message.id).catch((e) => console.error("markRead failed:", e.message));
    }

    await handleIncomingMessage(from, message);
  } catch (err) {
    console.error("Error handling webhook:", err.response?.data || err.message);
  }
});

app.get("/bookings", (req, res) => {
  res.json(listBookings());
});

app.get("/", (req, res) => res.send("Paragliding WhatsApp bot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
