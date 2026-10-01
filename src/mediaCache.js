import axios from "axios";
import FormData from "form-data";
import { errMsg } from "./whatsappClient.js";

const cache = {};

// WhatsApp size limits: images 5 MB, video 16 MB
const MAX_BYTES = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024 };

async function uploadFromUrl(url, fallbackMime) {
  const kind = fallbackMime.split("/")[0]; // "image" | "video"

  // 1. Download the file
  const fileRes = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  const ct = String(fileRes.headers["content-type"] || "").split(";")[0].trim().toLowerCase();

  // A 200 that returns an HTML/JSON page (Drive confirm page, login wall, etc.) is not a media file
  if (ct.startsWith("text/") || ct.includes("html") || ct.includes("json")) {
    throw new Error(`URL returned "${ct}" instead of a ${kind}. Use a direct-download link.`);
  }
  const buf = Buffer.from(fileRes.data);
  if (buf.length > MAX_BYTES[kind]) {
    throw new Error(`${kind} is ${(buf.length / 1048576).toFixed(1)} MB, over WhatsApp's limit`);
  }
  const mime = ct.startsWith(kind + "/") ? ct : fallbackMime;

  // 2. Upload to Meta
  const form = new FormData();
  form.append("file", buf, { filename: `media.${mime.split("/")[1]}`, contentType: mime });
  form.append("type", mime);
  form.append("messaging_product", "whatsapp");

  const res = await axios.post(
    `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v20.0"}/${process.env.PHONE_NUMBER_ID}/media`,
    form,
    {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...form.getHeaders() },
      maxBodyLength: Infinity,
      timeout: 120000,
    }
  );
  return res.data.id;
}

async function refreshOne(key, envName, mime) {
  const url = process.env[envName];
  if (!url) return;
  try {
    cache[key] = await uploadFromUrl(url, mime);
  } catch (err) {
    // Keep the old ID if we had one; the caller falls back to the URL otherwise
    console.error(`Media refresh failed for ${key} (${envName}):`, errMsg(err));
  }
}

export async function refreshMedia() {
  // Each item is independent, so a bad QR URL no longer blocks the video
  await refreshOne("qr", "QR_IMAGE_URL", "image/jpeg");
  await refreshOne("video", "WELCOME_VIDEO_URL", "video/mp4");
  console.log("Media cache refreshed:", Object.keys(cache));
}

export function getMediaId(key) {
  return cache[key];
}