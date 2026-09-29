import express from "express";
import dotenv from "dotenv";
import cron from "node-cron";
import axios from "axios";
import { sendTemplate,markRead } from "./src/whatsappClient.js";
import { sendConfirmationEmail } from "./src/email.js";
import { listBookings } from "./src/db.js";
import { handleIncomingMessage, handleBulkFormSubmission } from "./src/conversationFlow.js";
import { getBookingsNeedingReminder, markReminderSent } from "./src/sheets.js";
import { refreshMedia } from "./src/mediaCache.js";
import { getAllBookings, updateBookingField, getConversations } from "./src/sheets.js";

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
body{
  font-family:sans-serif;
  padding:20px;
  background:#f7f7f7;
}

h2{
  color:#1a3c6e;
}

input{
  width:100%;
  padding:12px;
  margin:8px 0;
  border:1px solid #ccc;
  border-radius:8px;
  font-size:16px;
  box-sizing:border-box;
}

#dateField label{
  display:block;
  font-size:16px;
  font-weight:600;
  color:#333;
  margin:8px 0 6px;
}

button,
a.btn{
  display:block;
  width:100%;
  padding:14px;
  background:#1a3c6e;
  color:white;
  border:none;
  border-radius:8px;
  font-size:16px;
  margin-top:10px;
  text-align:center;
  text-decoration:none;
  box-sizing:border-box;
}

button:disabled{
  opacity:0.6;
}

#dateField{
  display:block;
}

#thankyou{
  display:none;
  text-align:center;
}
</style>
</head>

<body>

<div id="formWrap">
  <h2 id="heading">Passenger 1 of ${total}</h2>

  <form id="paxForm">

    <div id="dateField">
      <label for="flightDate">📅 Select Flight Date</label>
      <input type="date" id="flightDate" required>
    </div>

    <input type="text" id="name" placeholder="Full Name" required>

    <input type="number" id="age" placeholder="Age" required>

    <input type="number" id="weight" placeholder="Weight (kg)" required>

    <input type="email" id="email" placeholder="Email address" required>

    <button type="submit" id="submitBtn">
      ${total > 1 ? "Next" : "Submit"}
    </button>

  </form>
</div>

<div id="thankyou">
  <h2>✅ Details saved!</h2>
  <p>Redirecting you back to WhatsApp...</p>

  <a class="btn" href="https://wa.me/${botNumber}">
    Return to Chat
  </a>
</div>

<script>
const total = ${total};

let current = 1;
let isSubmitting = false;

const passengers = [];

let flightDate = '';

document.getElementById('paxForm').addEventListener('submit', async function(e) {

  e.preventDefault();

  if (isSubmitting) return;

  isSubmitting = true;

  document.getElementById('submitBtn').disabled = true;

  // Get flight date from Passenger 1
  if (current === 1) {
    flightDate = document.getElementById('flightDate').value;
  }

  const name = document.getElementById('name').value;
  const age = document.getElementById('age').value;
  const weight = document.getElementById('weight').value;
  const email = document.getElementById('email').value;

  passengers.push({
    name,
    age,
    weight,
    email
  });

  // Move to next passenger
  if (current < total) {

    current++;

    document.getElementById('heading').textContent =
      'Passenger ' + current + ' of ' + total;

    // Hide date field after Passenger 1
    document.getElementById('dateField').style.display = 'none';

    // Clear passenger fields
    document.getElementById('name').value = '';
    document.getElementById('age').value = '';
    document.getElementById('weight').value = '';
    document.getElementById('email').value = '';

    document.getElementById('submitBtn').textContent =
      current < total ? 'Next' : 'Submit';

    document.getElementById('submitBtn').disabled = false;

    isSubmitting = false;

    return;
  }

  // Submit all passenger information
  try {

    const response = await fetch('/passenger-form-submit', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        phone: "${to}",
        passengers: passengers,
        date: flightDate
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save passenger details');
    }

    // Show success message
    document.getElementById('formWrap').style.display = 'none';
    document.getElementById('thankyou').style.display = 'block';

    // Redirect to WhatsApp
    setTimeout(() => {
      window.location.href = "https://wa.me/${botNumber}";
    }, 1000);

  } catch (error) {

    console.error(error);

    alert('Unable to save the details. Please try again.');

    document.getElementById('submitBtn').disabled = false;

    isSubmitting = false;
  }

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
      await sendTemplate(b.phone, "flight_remainder", "en", [
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
    const {
      location,
      phone,
      email,
      name,
      weight,
      date,
      timeSlot,
      package: pkg,
      passengerCount,
      advance,
      balance
    } = req.body;

    const templateName = location.toLowerCase().includes("bangalore")
      ? "booking_confirmed_bangalore"
      : "booking_confirmed_allepey";

    const params = [
      { type: "text", text: name },
      { type: "text", text: String(weight) },
      { type: "text", text: date },
      { type: "text", text: timeSlot || "TBD" },
      { type: "text", text: pkg },
      { type: "text", text: String(passengerCount) },
      { type: "text", text: String(advance) },
      { type: "text", text: String(balance) },
      { type: "text", text: "89517 71232" }
    ];

    await sendTemplate(phone, templateName, "en", [
      { type: "body", parameters: params }
    ]);

    if (process.env.HUMAN_HANDOFF_NUMBER) {
      await sendTemplate(process.env.HUMAN_HANDOFF_NUMBER, templateName, "en", [
        { type: "body", parameters: params }
      ]);
    }

    if (email) {
      await sendConfirmationEmail(
        email,
        "Your Sky Sail Adventures Booking is Confirmed! ✅",
        `<h2>🪂 Sky Sail Adventures - Booking Confirmed ✅</h2>
         <p><b>Name:</b> ${name}</p>
         <p><b>Weight:</b> ${weight} kg</p>
         <p><b>Date:</b> ${date}</p>
         <p><b>Time Slot:</b> ${timeSlot || "TBD"}</p>
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
    console.error(
      "Booking confirmation failed:",
      err.response?.data || err.message
    );
  }
});

// Run reminder service every hour
setInterval(processReminders, 60 * 60 * 1000);
setInterval(refreshMedia, 7 * 24 * 60 * 60 * 1000); // refresh weekly, before the 30-day expiry

app.get("/dashboard", requireAuth, (req, res) => {
  res.send(renderDashboardPage());
});

app.get("/api/bookings", requireAuth, async (req, res) => {
  try {
    const bookings = await getAllBookings();
    res.json(bookings);
  } catch (err) {
    console.error("Failed to load bookings:", err.message);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const messages = await getConversations(req.query.phone);
    res.json(messages);
  } catch (err) {
    console.error("Failed to load conversation:", err.message);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

app.post("/api/reply", requireAuth, express.json(), async (req, res) => {
  try {
    const { phone, message } = req.body;
    await sendText(phone, message);
    res.json({ success: true });
  } catch (err) {
    console.error("Reply failed:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
});

app.post("/api/booking-action", requireAuth, express.json(), async (req, res) => {
  try {
    const { bookingId, rowIndexes, action, timeSlot } = req.body;
    const bookings = await getAllBookings();
    const booking = bookings.find((b) => b.bookingId === bookingId);
    if (!booking) return res.status(404).json({ success: false, error: "Booking not found" });

    if (timeSlot) {
      await updateBookingField(rowIndexes, "Time Slot", timeSlot);
      booking.timeSlot = timeSlot;
    }

    const isBangalore = booking.location.toLowerCase().includes("bangalore");
    const first = booking.passengers[0];

    if (action === "approved") {
      const templateName = isBangalore ? "booking_confirmed_bangalore" : "booking_confirmed_allepey";
      const params = [
        { type: "text", text: first.name },
        { type: "text", text: String(first.weight) },
        { type: "text", text: booking.date },
        { type: "text", text: booking.timeSlot || "TBD" },
        { type: "text", text: booking.package },
        { type: "text", text: String(booking.passengerCount) },
        { type: "text", text: String(booking.advance) },
        { type: "text", text: String(booking.balance) },
        { type: "text", text: "89517 71232" },
      ];
      await sendTemplate(booking.phone, templateName, "en", [{ type: "body", parameters: params }]);
      if (process.env.HUMAN_HANDOFF_NUMBER) {
        await sendTemplate(process.env.HUMAN_HANDOFF_NUMBER, templateName, "en", [{ type: "body", parameters: params }]);
      }
      if (booking.confirmationEmail) {
        await sendConfirmationEmail(
          booking.confirmationEmail,
          "Your Sky Sail Adventures Booking is Confirmed! ✅",
          `<h2>🪂 Sky Sail Adventures - Booking Confirmed ✅</h2>
           <p><b>Name:</b> ${first.name}</p>
           <p><b>Date:</b> ${booking.date}</p>
           <p><b>Time Slot:</b> ${booking.timeSlot || "TBD"}</p>
           <p><b>Package:</b> ${booking.package}</p>
           <p><b>Advance paid:</b> ₹${booking.advance}</p>
           <p><b>Balance due:</b> ₹${booking.balance}</p>
           <p>See you in the sky! ✈️</p>`
        );
      }
    } else if (action === "complete") {
      const templateName = isBangalore ? "review_request_bangalore" : "review_request_alleppey";
      const reviewLink =
        (isBangalore ? process.env.GOOGLE_REVIEW_LINK_BANGALORE : process.env.GOOGLE_REVIEW_LINK_ALLEPPEY) ||
        "https://www.skysailadventures.com";
      await sendTemplate(booking.phone, templateName, "en", [{ type: "body", parameters: [{ type: "text", text: reviewLink }] }]);
    } else if (action === "cancelled") {
      await sendTemplate(booking.phone, "booking_cancelled", "en", [
        { type: "body", parameters: [{ type: "text", text: first.name }, { type: "text", text: booking.package }] },
      ]);
    }

    await updateBookingField(rowIndexes, "Status", action);
    res.json({ success: true });
  } catch (err) {
    console.error("Booking action failed:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  processReminders(); // Run once on startup
  refreshMedia();     // Upload video + QR to Meta on startup
});
app.post("/booking-cancelled", express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const { phone, name, package: pkg } = req.body;
    await sendTemplate(phone, "booking_cancelled", "en", [
      { type: "body", parameters: [
        { type: "text", text: name },
        { type: "text", text: pkg },
      ]},
    ]);
  } catch (err) {
    console.error("Cancellation notice failed:", err.response?.data || err.message);
  }
});

app.post("/timeslot-updated", express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const { phone, timeSlot, date } = req.body;
    await sendTemplate(phone, "timeslot_confirmed", "en", [
      { type: "body", parameters: [
        { type: "text", text: timeSlot },
        { type: "text", text: date },
      ]},
    ]);
  } catch (err) {
    console.error("Time slot notice failed:", err.response?.data || err.message);
  }
});

app.post("/booking-review", express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const { phone, location } = req.body;
    const isBangalore = location && location.toLowerCase().includes("bangalore");
    const templateName = isBangalore ? "review_request_bangalore" : "review_request_alleppey";
    const reviewLink = isBangalore
      ? process.env.GOOGLE_REVIEW_LINK_BANGALORE
      : process.env.GOOGLE_REVIEW_LINK_ALLEPPEY;

    await sendTemplate(phone, templateName, "en", [
      { type: "body", parameters: [{ type: "text", text: reviewLink }] },
    ]);
  } catch (err) {
    console.error("Review request failed:", err.response?.data || err.message);
  }
});

function renderDashboardPage() {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sky Sail Dashboard</title>
<style>
*{box-sizing:border-box;}
body{font-family:sans-serif;margin:0;background:#f4f5f7;color:#1a1a1a;}
header{background:#1a3c6e;color:white;padding:16px 20px;}
header h1{margin:0;font-size:18px;}
.controls{display:flex;gap:10px;padding:12px 20px;flex-wrap:wrap;background:white;border-bottom:1px solid #ddd;}
select,input{padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;}
.list{padding:12px 20px;}
.card{background:white;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:pointer;}
.card .top{display:flex;justify-content:space-between;font-weight:bold;}
.badge{padding:2px 10px;border-radius:20px;font-size:12px;text-transform:capitalize;}
.badge.pending{background:#fff3cd;color:#856404;}
.badge.approved{background:#d4edda;color:#155724;}
.badge.complete{background:#d1ecf1;color:#0c5460;}
.badge.cancelled{background:#f8d7da;color:#721c24;}
.meta{color:#555;font-size:13px;margin-top:4px;}
#detail{position:fixed;top:0;right:0;width:100%;max-width:420px;height:100%;background:white;box-shadow:-2px 0 10px rgba(0,0,0,0.2);transform:translateX(100%);transition:0.2s;overflow-y:auto;padding:16px;z-index:10;}
#detail.open{transform:translateX(0);}
#overlay{position:fixed;inset:0;background:rgba(0,0,0,0.3);display:none;z-index:9;}
#overlay.open{display:block;}
.close{float:right;cursor:pointer;font-size:20px;}
.actionBtns button{padding:10px;border:none;border-radius:6px;color:white;margin:4px 4px 4px 0;cursor:pointer;}
.btn-approve{background:#28a745;}
.btn-complete{background:#17a2b8;}
.btn-cancel{background:#dc3545;}
.chat{border-top:1px solid #eee;margin-top:14px;padding-top:10px;max-height:220px;overflow-y:auto;font-size:13px;}
.msg{margin-bottom:6px;padding:6px 10px;border-radius:8px;max-width:80%;}
.msg.in{background:#eee;}
.msg.out{background:#d4e6ff;margin-left:auto;}
.replyBox{display:flex;gap:6px;margin-top:8px;}
.replyBox input{flex:1;}
</style>
</head>
<body>
<header><h1>🪂 Sky Sail Adventures — Bookings</h1></header>
<div class="controls">
  <select id="fLocation"><option value="">All Locations</option><option>Bangalore</option><option>Alleppey</option></select>
  <select id="fStatus"><option value="">All Statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="complete">Complete</option><option value="cancelled">Cancelled</option></select>
  <input type="date" id="fDate">
</div>
<div class="list" id="list">Loading...</div>

<div id="overlay" onclick="closeDetail()"></div>
<div id="detail"></div>

<script>
let bookings = [];

async function load() {
  const res = await fetch('/api/bookings');
  bookings = await res.json();
  render();
}

function render() {
  const loc = document.getElementById('fLocation').value;
  const status = document.getElementById('fStatus').value;
  const date = document.getElementById('fDate').value;
  const filtered = bookings.filter(b =>
    (!loc || b.location === loc) &&
    (!status || b.status === status) &&
    (!date || b.date === date)
  );
  document.getElementById('list').innerHTML = filtered.map(b => \`
    <div class="card" onclick='openDetail(\${JSON.stringify(b.bookingId)})'>
      <div class="top"><span>\${b.customerRef || b.bookingId}</span><span class="badge \${b.status}">\${b.status}</span></div>
      <div class="meta">\${b.location} — \${b.package}</div>
      <div class="meta">\${b.date} \${b.timeSlot ? '· ' + b.timeSlot : ''} · \${b.passengerCount} pax · \${b.phone}</div>
    </div>
  \`).join('') || '<p>No bookings match.</p>';
}

async function openDetail(bookingId) {
  const b = bookings.find(x => x.bookingId === bookingId);
  document.getElementById('overlay').classList.add('open');
  const d = document.getElementById('detail');
  d.classList.add('open');
  d.innerHTML = \`
    <span class="close" onclick="closeDetail()">✕</span>
    <h2>\${b.customerRef || b.bookingId}</h2>
    <p><b>Status:</b> <span class="badge \${b.status}">\${b.status}</span></p>
    <p>\${b.location} — \${b.package}</p>
    <p>\${b.date} · \${b.timePreference}</p>
    <p>Phone: \${b.phone}</p>
    <p>Email: \${b.confirmationEmail || ''}</p>
    <p>Advance ₹\${b.advance} · Balance ₹\${b.balance}</p>
    <p><b>Passengers</b></p>
    <ul>\${b.passengers.map(p => \`<li>\${p.name}, \${p.age}y, \${p.weight}kg — \${p.email}</li>\`).join('')}</ul>
    <div>
      <label>Time Slot</label><br>
      <input type="text" id="timeSlotInput" value="\${b.timeSlot || ''}" placeholder="6:00 AM" style="width:100%;padding:8px;margin:6px 0;">
    </div>
    <div class="actionBtns">
      <button class="btn-approve" onclick='doAction(\${JSON.stringify(b.bookingId)}, \${JSON.stringify(b.rowIndexes)}, "approved")'>Approve</button>
      <button class="btn-complete" onclick='doAction(\${JSON.stringify(b.bookingId)}, \${JSON.stringify(b.rowIndexes)}, "complete")'>Complete</button>
      <button class="btn-cancel" onclick='doAction(\${JSON.stringify(b.bookingId)}, \${JSON.stringify(b.rowIndexes)}, "cancelled")'>Cancel</button>
    </div>
    <div class="chat" id="chatBox">Loading chat...</div>
    <div class="replyBox">
      <input type="text" id="replyInput" placeholder="Type a reply...">
      <button onclick='sendReply(\${JSON.stringify(b.phone)})'>Send</button>
    </div>
  \`;
  loadChat(b.phone);
}

function closeDetail() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('detail').classList.remove('open');
}

async function doAction(bookingId, rowIndexes, action) {
  const timeSlot = document.getElementById('timeSlotInput').value;
  const res = await fetch('/api/booking-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, rowIndexes, action, timeSlot }),
  });
  const data = await res.json();
  if (data.success) {
    alert('Done: ' + action);
    closeDetail();
    load();
  } else {
    alert('Failed: ' + data.error);
  }
}

async function loadChat(phone) {
  const res = await fetch('/api/conversations?phone=' + encodeURIComponent(phone));
  const msgs = await res.json();
  document.getElementById('chatBox').innerHTML = msgs.map(m =>
    \`<div class="msg \${m.direction}">\${m.message}</div>\`
  ).join('') || 'No messages yet.';
}

async function sendReply(phone) {
  const input = document.getElementById('replyInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await fetch('/api/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message }),
  });
  loadChat(phone);
}

document.getElementById('fLocation').addEventListener('change', render);
document.getElementById('fStatus').addEventListener('change', render);
document.getElementById('fDate').addEventListener('change', render);

load();
</script>
</body>
</html>`;
}