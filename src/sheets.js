import { google } from "googleapis";

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export async function appendBookingToSheet(booking) {
  try {
    const sheets = getClient();
     const rows = booking.passengerList.map((p, i) => [
      booking.id,
      booking.phone,
      booking.location,
      booking.package,
      booking.price,
      booking.passengerCount,
      booking.date,
      booking.timePreference,
      booking.email,
      booking.createdAt,
      i + 1,
      p.name,
      p.age,
      p.weight,
      p.email,
      booking.customerRef,
      booking.advance,
      booking.balance,
      "", // Confirmation Status - blank until staff approves
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:S",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  } catch (err) {
    console.error("Failed to write to Google Sheet:", err.response?.data || err.message);
  }
}

export async function getNextBookingId() {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet1!A:A",
  });
  const rows = res.data.values || [];
  let maxNum = 0;
  for (const row of rows) {
    const match = /^SKY(\d+)$/.exec(row[0] || "");
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return "SKY" + String(maxNum + 1).padStart(4, "0");
}