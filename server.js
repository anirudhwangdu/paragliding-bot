import express from "express";
import dotenv from "dotenv";
import cron from "node-cron";
import axios from "axios";
import { sendTemplate,markRead } from "./src/whatsappClient.js";
import { sendConfirmationEmail } from "./src/email.js";
import { listBookings } from "./src/db.js";
import { handleIncomingMessage, handleBulkFormSubmission } from "./src/conversationFlow.js";
import { getBookingsNeedingReminder, markReminderSent } from "./src/sheets.js";


// Initialize environment variables
dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// 1. Health Check Endpoint
app.get("/health", (req, res) => res.status(200).send("OK"));

// 2. Keep-Alive Cron Schedule (Every 10 minutes)
cron.schedule("*/10 * * * *", async () => {
  try {
    await axios.get(`${RENDER_URL}/health`);
    console.log("[Keep-Alive] Ping sent successfully");
  } catch (err) {
    console.error("[Keep-Alive] Ping failed:", err.message);
  }
});

// Webhook Verification
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

// Incoming Webhook Messages
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

// Bookings & Admin Endpoints
app.get("/bookings", (req, res) => {
  res.json(listBookings());
});

app.get("/", (req, res) => res.send("Paragliding WhatsApp bot is running."));

// Passenger Form Endpoints
app.get("/passenger-form", (req, res) => {
  const to = req.query.to || "";
  const total = req.query.total || "1";
  const botNumber = process.env.WHATSAPP_BOT_NUMBER || "";
  res.send(renderFormPage(to, total, botNumber));
});

app.post("/passenger-form-submit", express.json(), async (req, res) => {
  try {
    await handleBulkFormSubmission(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error("Form submit error:", err.message);
    res.status(500).json({ success: false });
  }
});

function renderFormPage(to, total, botNumber) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passenger Details</title>
<style>
body{font-family:sans-serif;padding:20px;background:#f7f7f7;}
h2{color:#1a3c6e;}
input{width:100%;padding:12px;margin:8px 0;border:1px solid #ccc;border-radius:8px;font-size:16px;box-sizing:border-box;}
button,a.btn{display:block;width:100%;padding:14px;background:#1a3c6e;color:white;border:none;border-radius:8px;font-size:16px;margin-top:10px;text-align:center;text-decoration:none;box-sizing:border-box;}
button:disabled{opacity:0.6;}
#dateField{display:block;}
#thankyou{display:none;text-align:center;}
</style>
</head>
<body>
<div id="formWrap">
<h2 id="heading">Passenger 1 of ${total}</h2>
<form id="paxForm">
  <div id="dateField">
    <input type="date" id="flightDate" required>
  </div>
  <input type="text" id="name" placeholder="Full Name" required>
  <input type="number" id="age" placeholder="Age" required>
  <input type="number" id="weight" placeholder="Weight (kg)" required>
  <input type="email" id="email" placeholder="Email address" required>
  <button type="submit" id="submitBtn">${total > 1 ? "Next" : "Submit"}</button>
</form>
</div>
<div id="thankyou">
  <h2>✅ Details saved!</h2>
  <p>Redirecting you back to WhatsApp...</p>
  <a class="btn" href="https://wa.me/${botNumber}">Return to Chat</a>
</div>
<script>
const total = ${total};
let current = 1;
let isSubmitting = false;
const passengers = [];
let flightDate = '';

document.getElementById('paxForm').addEventListener('submit', async function(e){
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  document.getElementById('submitBtn').disabled = true;

  if (current === 1) {
    flightDate = document.getElementById('flightDate').value;
  }

  const name = document.getElementById('name').value;
  const age = document.getElementById('age').value;
  const weight = document.getElementById('weight').value;
  const email = document.getElementById('email').value;
  passengers.push({ name, age, weight, email });

  if (current < total) {
    current++;
    document.getElementById('heading').textContent = 'Passenger ' + current + ' of ' + total;
    document.getElementById('dateField').style.display = 'none';
    document.getElementById('name').value = '';
    document.getElementById('age').value = '';
    document.getElementById('weight').value = '';
    document.getElementById('email').value = '';
    document.getElementById('submitBtn').textContent = current < total ? 'Next' : 'Submit';
    document.getElementById('submitBtn').disabled = false;
    isSubmitting = false;
    return;
  }

  await fetch('/passenger-form-submit', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ phone: "${to}", passengers, date: flightDate })
  });
  document.getElementById('formWrap').style.display = 'none';
  document.getElementById('thankyou').style.display = 'block';
  window.location.href = "https://wa.me/${botNumber}";
});
</script>
</body>
</html>`;
}

// Scheduled Background Task for Flight Reminders
async function processReminders() {
  try {
    const bookings = await getBookingsNeedingReminder();
    for (const b of bookings) {
      await sendTemplate(b.phone, "flight_reminder", "en", [
        {
          type: "body",
          parameters: [
            { type: "text", text: b.name },
            { type: "text", text: b.package },
            { type: "text", text: b.date },
            { type: "text", text: b.timePref },
          ],
        },
      ]);
      if (process.env.HUMAN_HANDOFF_NUMBER) {
        await sendTemplate(process.env.HUMAN_HANDOFF_NUMBER, "staff_flight_alert", "en", [
          {
            type: "body",
            parameters: [
              { type: "text", text: b.package },
              { type: "text", text: String(b.paxCount) },
              { type: "text", text: b.date },
              { type: "text", text: b.timePref },
              { type: "text", text: `${b.name}, ${b.phone}` },
            ],
          },
        ]);
      }
      await markReminderSent(b.rowIndex);
    }
   } catch (err) {
    console.error("Reminder processing failed:", err.response?.data || err.message, err.config?.url || "");
  }
}

app.post("/booking-confirmed", express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const { location, phone, email, name, weight, date, package: pkg, passengerCount, advance, balance } = req.body;
    const templateName = location.toLowerCase().includes("bangalore")
      ? "booking_confirmed_bangalore"
      : "booking_confirmed_allepey";

    await sendTemplate(phone, templateName, "en", [
      {
        type: "body",
        parameters: [
          { type: "text", text: name },
          { type: "text", text: String(weight) },
          { type: "text", text: date },
          { type: "text", text: pkg },
          { type: "text", text: String(passengerCount) },
          { type: "text", text: String(advance) },
          { type: "text", text: String(balance) },
          { type: "text", text: "89517 71232" },
        ],
      },
    ]);

    if (email) {
      await sendConfirmationEmail(
        email,
        "Your Sky Sail Adventures Booking is Confirmed! ✅",
        `<h2>🪂 Sky Sail Adventures - Booking Confirmed ✅</h2>
         <p><b>Name:</b> ${name}</p>
         <p><b>Weight:</b> ${weight} kg</p>
         <p><b>Date:</b> ${date}</p>
         <p><b>Package:</b> ${pkg}</p>
         <p><b>Passengers:</b> ${passengerCount}</p>
         <p><b>Advance paid:</b> ₹${advance}</p>
         <p><b>Balance due:</b> ₹${balance}</p>
         <p><b>Contact:</b> 89517 71232</p>
         <p>Please arrive 15-20 mins early. Flights are weather-dependent. Carry this confirmation.</p>
         <p>See you in the sky! ✈️</p>`
      );
    }
  } catch (err) {
    console.error("Booking confirmation failed:", err.response?.data || err.message);
  }
});

// Run reminder service every hour
setInterval(processReminders, 60 * 60 * 1000);

// Start Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  processReminders(); // Run once on startup
});