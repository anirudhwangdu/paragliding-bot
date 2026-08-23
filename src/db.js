import { JSONFilePreset } from "lowdb/node";

const defaultData = { sessions: {}, bookings: [] };
const db = await JSONFilePreset("data.json", defaultData);

export function getSession(phone) {
  if (!db.data.sessions[phone]) {
    db.data.sessions[phone] = { step: "MAIN_MENU", draft: {} };
  }
  return db.data.sessions[phone];
}

export async function saveSession(phone, session) {
  db.data.sessions[phone] = session;
  await db.write();
}

export async function resetSession(phone) {
  db.data.sessions[phone] = { step: "MAIN_MENU", draft: {} };
  await db.write();
}

export async function saveBooking(booking) {
  db.data.bookings.push(booking);
  await db.write();
  return booking;
}

export function listBookings() {
  return db.data.bookings;
}
