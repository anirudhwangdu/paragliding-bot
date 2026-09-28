import axios from "axios";
import FormData from "form-data";

const cache = {};

async function uploadFromUrl(url, mimeType) {
  const fileRes = await axios.get(url, { responseType: "arraybuffer" });
  const form = new FormData();
  form.append("file", Buffer.from(fileRes.data), { filename: "media", contentType: mimeType });
  form.append("type", mimeType);
  form.append("messaging_product", "whatsapp");

  const res = await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/media`,
    form,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...form.getHeaders() } }
  );
  return res.data.id;
}

export async function refreshMedia() {
  try {
    if (process.env.QR_IMAGE_URL) {
      cache.qr = await uploadFromUrl(process.env.QR_IMAGE_URL, "image/jpeg");
    }
    if (process.env.WELCOME_VIDEO_URL) {
      cache.video = await uploadFromUrl(process.env.WELCOME_VIDEO_URL, "video/mp4");
    }
    console.log("Media cache refreshed:", Object.keys(cache));
  } catch (err) {
    console.error("Media refresh failed:", err.response?.data || err.message);
  }
}

export function getMediaId(key) {
  return cache[key];
}