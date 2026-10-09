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
      "pendingg", // Confirmation Status - blank until staff approves
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

export async function getBookingsNeedingReminder() {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet1!A2:T",
  });
  const rows = res.data.values || [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const seen = new Set();
  const results = [];
  rows.forEach((row, idx) => {
    const bookingId = row[0], phone = row[1], location = row[2], pkg = row[3],
          paxCount = row[5], date = row[6], timePref = row[7], name = row[11],
          status = row[18], reminderSent = row[19];
    const statusLower = (status || "").toLowerCase().trim();
    if (date === tomorrowStr && reminderSent !== "yes" && statusLower === "approved" && !seen.has(bookingId)) {
      seen.add(bookingId);
      results.push({ rowIndex: idx + 2, bookingId, phone, location, package: pkg, paxCount, date, timePref, name });
    }
  });
  return results;
}

export async function markReminderSent(rowIndex) {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `Sheet1!T${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["yes"]] },
  });
}

async function getHeaderMap() {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet1!A1:Z1",
  });
  const headers = res.data.values[0];
  const map = {};
  headers.forEach((h, i) => (map[h] = i));
  return map;
}

export async function getAllBookings() {
  const sheets = getClient();
  const map = await getHeaderMap();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet1!A2:Z",
  });
  const rows = res.data.values || [];
  const byId = {};

  rows.forEach((row, idx) => {
    const id = row[map["Booking ID"]];
    if (!id) return;
    if (!byId[id]) {
      byId[id] = {
        bookingId: id,
        phone: row[map["Phone"]],
        location: row[map["Location"]],
        package: row[map["Package"]],
        price: row[map["Price"]],
        passengerCount: row[map["Passenger Count"]],
        date: row[map["Date"]],
        createdAt: row[map["Created At"]],
        timePreference: row[map["Time Preference"]],
        confirmationEmail: row[map["Confirmation Email"]],
        customerRef: row[map["Customer Reference"]],
        advance: row[map["Advance Paid"]],
        balance: row[map["Balance Due"]],
        status: row[map["Status"]] || "pending",
        timeSlot: row[map["Time Slot"]] || "",
        passengers: [],
        rowIndexes: [],
      };
    }
    byId[id].passengers.push({
      name: row[map["Name"]],
      age: row[map["Age"]],
      weight: row[map["Weight"]],
      email: row[map["Email"]],
    });
    byId[id].rowIndexes.push(idx + 2);
  });

  return Object.values(byId).sort((a, b) => (a.bookingId < b.bookingId ? 1 : -1));
}

export async function updateBookingField(rowIndexes, fieldName, value) {
  const sheets = getClient();
  const map = await getHeaderMap();
  const col = map[fieldName];
  if (col === undefined) throw new Error(`Column "${fieldName}" not found`);
  const colLetter = String.fromCharCode(65 + col);

  const data = rowIndexes.map((rowIndex) => ({
    range: `Sheet1!${colLetter}${rowIndex}`,
    values: [[value]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function getConversations(phone) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Conversations!A:D",
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[1] === phone)
    .map((r) => ({ timestamp: r[0], direction: r[2], message: r[3] }))
    .slice(-100);
}

export async function logHandoff(phone) {
  try {
    const sheets = getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Handoffs and new chats'!A:B",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toISOString(), phone]],
      },
    });
  } catch (err) {
    console.error("Failed to log handoff:", err.response?.data || err.message);
  }
}

export async function logQuoteRequest(data) {
  try {
    const sheets = getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Quote Requests'!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toISOString(),
          data.packageType,
          data.guests,
          data.date,
          data.name,
          data.phone,
        ]],
      },
    });
  } catch (err) {
    console.error("Failed to log quote request:", err.response?.data || err.message);
  }
}

export async function logNewChat(phone, location) {
  try {
    const sheets = getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'New Chats'!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toISOString(), phone, location, ""]],
      },
    });
  } catch (err) {
    console.error("Failed to log new chat:", err.response?.data || err.message);
  }
}

export async function markHandoffRequested(phone) {
  try {
    const sheets = getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "'Handoffs'!A:D",
    });
    const rows = res.data.values || [];
    let targetIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === phone) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'Handoffs'!D${targetIdx + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Handoff Requested"]] },
    });
  } catch (err) {
    console.error("Failed to mark handoff requested:", err.response?.data || err.message);
  }
}

const REQUIRED_TABS = {
  "Conversations": ["Timestamp", "Phone", "Direction", "Message"],
  "Handoffs and new chats": ["Timestamp", "Phone", "Location", "Handoff Requested"],
  "Quote Requests": ["Timestamp", "Package Type", "Guests", "Date", "Name", "Phone"],
};

export async function ensureTabs() {
  try {
    const sheets = getClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
    const existing = meta.data.sheets.map((s) => s.properties.title);
    console.log("[Sheets] Existing tabs:", JSON.stringify(existing));

    for (const [title, headers] of Object.entries(REQUIRED_TABS)) {
      if (existing.includes(title)) continue;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `'${title}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
      console.log(`[Sheets] Created missing tab: ${title}`);
    }
  } catch (err) {
    console.error("[Sheets] ensureTabs failed:", err.response?.data || err.message);
  }
}