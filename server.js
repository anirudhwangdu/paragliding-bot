import express from "express";
import dotenv from "dotenv";
import { markRead } from "./src/whatsappClient.js";
import { listBookings } from "./src/db.js";
import { handleIncomingMessage, handleBulkFormSubmission } from "./src/conversationFlow.js";

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
#thankyou{display:none;text-align:center;}
</style>
</head>
<body>
<div id="formWrap">
<h2 id="heading">Passenger 1 of ${total}</h2>
<form id="paxForm">
  <input type="text" id="name" placeholder="Full Name" required>
  <input type="number" id="age" placeholder="Age" required>
  <input type="number" id="weight" placeholder="Weight (kg)" required>
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

document.getElementById('paxForm').addEventListener('submit', async function(e){
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  document.getElementById('submitBtn').disabled = true;

  const name = document.getElementById('name').value;
  const age = document.getElementById('age').value;
  const weight = document.getElementById('weight').value;
  passengers.push({ name, age, weight });

  if (current < total) {
    current++;
    document.getElementById('heading').textContent = 'Passenger ' + current + ' of ' + total;
    document.getElementById('name').value = '';
    document.getElementById('age').value = '';
    document.getElementById('weight').value = '';
    document.getElementById('submitBtn').textContent = current < total ? 'Next' : 'Submit';
    document.getElementById('submitBtn').disabled = false;
    isSubmitting = false;
    return;
  }

  await fetch('/passenger-form-submit', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ phone: "${to}", passengers })
  });
  document.getElementById('formWrap').style.display = 'none';
  document.getElementById('thankyou').style.display = 'block';
  window.location.href = "https://wa.me/${botNumber}";
});
</script>
</body>
</html>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
