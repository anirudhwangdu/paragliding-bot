import axios from "axios";

// Built per call (not at import time) so env vars loaded later by dotenv are still picked up.
function client() {
  return axios.create({
    baseURL: `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v20.0"}/${process.env.PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
}

// WhatsApp wants digits only, with country code (no +, spaces or dashes).
const digits = (n) => String(n ?? "").replace(/\D/g, "");

/**
 * Turns an axios error into a readable string.
 * Handles JSON bodies, string bodies and Buffers (e.g. responseType: "arraybuffer").
 */
export function errMsg(e) {
  const res = e?.response;
  if (!res) return e?.message || String(e);
  const d = res.data;
  let body;
  if (Buffer.isBuffer(d)) body = d.toString("utf8").slice(0, 500);
  else if (typeof d === "string") body = d.slice(0, 500);
  else body = JSON.stringify(d);
  return `HTTP ${res.status}: ${body}`;
}

function payload(to, type, body) {
  const num = digits(to);
  if (!num) throw new Error(`Invalid recipient number: "${to}"`);
  return { messaging_product: "whatsapp", to: num, type, [type]: body };
}

function post(data) {
  return client().post("/messages", data);
}

export async function sendText(to, body) {
  return post(payload(to, "text", { body }));
}

export async function sendTemplate(to, templateName, languageCode, components = []) {
  const data = payload(to, "template", {
    name: templateName,
    language: { code: languageCode },
    components,
  });
  const res = await post(data);
  // "accepted" only means Meta queued it. Delivery result arrives later as a `statuses` webhook.
  console.log(
    `[WA] template "${templateName}" accepted for ${data.to}:`,
    JSON.stringify(res.data?.messages || res.data)
  );
  return res;
}

export async function sendVideo(to, videoUrl, caption) {
  return post(payload(to, "video", { link: videoUrl, caption: caption || "" }));
}

export async function sendVideoById(to, mediaId, caption) {
  return post(payload(to, "video", { id: mediaId, caption: caption || "" }));
}

export async function sendImage(to, imageUrl, caption) {
  return post(payload(to, "image", { link: imageUrl, caption: caption || "" }));
}

export async function sendImageById(to, mediaId, caption) {
  return post(payload(to, "image", { id: mediaId, caption: caption || "" }));
}

export async function sendButtons(to, bodyText, buttons) {
  return post(
    payload(to, "interactive", {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    })
  );
}

export async function sendList(to, bodyText, buttonLabel, sections) {
  return post(
    payload(to, "interactive", {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    })
  );
}

export async function markRead(messageId) {
  return post({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}