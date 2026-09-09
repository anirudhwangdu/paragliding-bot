import axios from "axios";

const GRAPH_VERSION = "v20.0";

function client() {
  return axios.create({
    baseURL: `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

export async function sendText(to, body) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

export async function sendVideo(to, videoUrl, caption) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "video",
    video: { link: videoUrl, caption: caption || "" },
  });
}

export async function sendButtons(to, bodyText, buttons) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

export async function sendList(to, bodyText, buttonLabel, sections) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  });
}

export async function markRead(messageId) {
  return client().post("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}
