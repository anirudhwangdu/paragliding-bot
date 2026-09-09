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
    const paxSummary = booking.passengerList
      .map((p, i) => `${i + 1}. ${p.name}, age ${p.age}, ${p.weight}kg`)
      .join(" | ");

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:K",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          booking.id,
          booking.phone,
          booking.location,
          booking.package,
          booking.price,
          booking.passengerCount,
          paxSummary,
          booking.date,
          booking.timePreference,
          booking.email,
          booking.createdAt,
        ]],
      },
    });
  } catch (err) {
    console.error("Failed to write to Google Sheet:", err.response?.data || err.message);
  }
}