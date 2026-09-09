import { getSession, saveSession, resetSession, saveBooking } from "./db.js";
import { FAQ, FAQ_MENU_SECTIONS } from "./faq.js";
import { LOCATIONS, findPackage } from "./packages.js";
import { nanoid } from "nanoid";
import { sendText, sendButtons, sendList, sendVideo } from "./whatsappClient.js";


const HANDOFF_KEYWORDS = ["human", "agent", "help me", "call me", "emergency", "injury", "complaint"];

export async function handleIncomingMessage(from, message) {
  const text = extractText(message).trim();
  const lower = text.toLowerCase();

  if (HANDOFF_KEYWORDS.some((k) => lower.includes(k))) {
    await handOffToHuman(from);
    return;
  }

  if (["hi", "hello", "hey", "menu", "start"].includes(lower)) {
    await resetSession(from);
    await sendWelcome(from);
    return;
  }

  const session = getSession(from);
  const interactiveId = extractInteractiveId(message);

  if (interactiveId) {
    await routeInteractive(from, interactiveId, session);
    return;
  }

  await routeFreeText(from, text, session);
}

async function sendWelcome(to) {
  if (process.env.WELCOME_VIDEO_URL) {
    await sendVideo(to, process.env.WELCOME_VIDEO_URL, "See what flying with us feels like! 🪂");
  }
  await sendText(to, `👋 Welcome to *${process.env.BUSINESS_NAME}*!\n\nThanks for reaching out — we're excited to help you take flight. ✈️`);
  await sendMainMenu(to);
}

async function sendMainMenu(to) {
  await sendList(to, "How can we help today?", "View Menu", [
    {
      title: "Menu",
      rows: [
        { id: "menu_book", title: "Book a Flight", description: "Browse packages & book" },
        { id: "menu_faq", title: "FAQs", description: "Common questions answered" },
        { id: "menu_human", title: "Talk to a Human", description: "Connect with our team" },
        { id: "menu_website", title: "Visit our Website", description: "skysailadventures.com" },
      ],
    },
  ]);
}

async function sendLocationChoice(to) {
  await sendButtons(to, "Which location would you like to fly at?", [
    { id: "loc_bangalore", title: "Bangalore" },
    { id: "loc_alleppey", title: "Alleppey" },
  ]);
}

async function sendPackageList(to, locationKey) {
  const loc = LOCATIONS[locationKey];
  await sendList(to, `${loc.label} packages:`, "View Packages", loc.sections);
}

async function askPassengerName(to, session) {
  const n = session.draft.passengerList.length + 1;
  await sendText(to, `Passenger ${n} of ${session.draft.passengerCount} — what's their full name?`);
}

async function routeInteractive(from, id, session) {
  if (id === "menu_book") {
    await sendLocationChoice(from);
    return;
  }
  if (id === "menu_faq") {
    await sendList(from, "What would you like to know?", "View FAQs", FAQ_MENU_SECTIONS);
    return;
  }
  if (id === "menu_human") {
    await handOffToHuman(from);
    return;
  }
  if (id === "menu_website") {
    await sendText(from, "🌐 Visit us at: https://www.skysailadventures.com");
    return;
  }

  if (id === "loc_bangalore" || id === "loc_alleppey") {
    const key = id === "loc_bangalore" ? "bangalore" : "alleppey";
    session.draft = { location: LOCATIONS[key].label, locationKey: key };
    session.step = "CHOOSE_PACKAGE";
    await saveSession(from, session);
    await sendPackageList(from, key);
    return;
  }

  if (id.startsWith("faq_")) {
    const key = id.replace("faq_", "");
    await sendText(from, FAQ[key] || "Sorry, I don't have that info yet.");
    await sendMainMenu(from);
    return;
  }

  // Package selected from list -> show detail + confirm step (not straight into booking)
  const pkg = findPackage(id);
  if (pkg) {
    session.draft.selectedPackageId = pkg.id;
    session.step = "PACKAGE_DETAIL";
    await saveSession(from, session);
    await sendButtons(from, pkg.details, [
      { id: "pkg_book", title: "✅ Book This" },
      { id: "pkg_other", title: "🔄 Other Packages" },
    ]);
    return;
  }

  if (id === "pkg_book") {
    const pkg = findPackage(session.draft.selectedPackageId);
    session.draft.package = pkg.title;
    session.draft.price = pkg.description;
    session.step = "ASK_PASSENGERS";
    await saveSession(from, session);
    await sendText(from, "How many passengers will be flying?");
    return;
  }

  if (id === "pkg_other") {
    session.step = "CHOOSE_PACKAGE";
    await saveSession(from, session);
    await sendPackageList(from, session.draft.locationKey);
    return;
  }

  if (id === "time_morning" || id === "time_evening") {
    session.draft.timePreference = id === "time_morning" ? "Morning" : "Evening";
    session.draft.passengerList = [];
    session.step = "ASK_PAX_NAME";
    await saveSession(from, session);
    await askPassengerName(from, session);
    return;
  }

  if (id === "confirm_yes") {
    const booking = {
      id: nanoid(8),
      phone: from,
      ...session.draft,
      status: "pending_confirmation_call",
      createdAt: new Date().toISOString(),
    };
    await saveBooking(booking);
    await appendBookingToSheet(booking);
    const paxSummary = booking.passengerList
      .map((p, i) => `  ${i + 1}. ${p.name}, age ${p.age}, ${p.weight}kg`)
      .join("\n");
    await sendText(
      from,
      `✅ Booking received! Reference: *${booking.id}*\n\n` +
        `${booking.location} — ${booking.package}\n` +
        `Passengers (${booking.passengerCount}):\n${paxSummary}\n` +
        `Date: ${booking.date} · ${booking.timePreference}\n\n` +
        `Our team will call you shortly to confirm your exact time slot. ` +
        `A confirmation has also been noted against your email: ${booking.email}.`
    );
    if (process.env.HUMAN_HANDOFF_NUMBER) {
      await sendText(
        process.env.HUMAN_HANDOFF_NUMBER,
        `🆕 New booking ${booking.id}\n${booking.location} — ${booking.package}\n` +
          `Passengers (${booking.passengerCount}):\n${paxSummary}\n` +
          `Date: ${booking.date} · ${booking.timePreference}\n` +
          `Phone: ${booking.phone} · Email: ${booking.email}`
      );
    }
    await resetSession(from);
    return;
  }
  if (id === "confirm_no") {
    await resetSession(from);
    await sendText(from, "No problem, booking cancelled. Type 'menu' anytime to start again.");
    return;
  }

  await sendMainMenu(from);
}

async function routeFreeText(from, text, session) {
  switch (session.step) {
    case "ASK_PASSENGERS": {
      const count = parseInt(text, 10);
      if (isNaN(count) || count < 1) {
        await sendText(from, "Please send a valid number of passengers, e.g. 1");
        return;
      }
      session.draft.passengerCount = count;
      session.step = "ASK_DATE";
      await saveSession(from, session);
      await sendText(from, "What date would you like to fly? (e.g. 25 Sept)");
      return;
    }

    case "ASK_DATE":
      session.draft.date = text;
      await saveSession(from, session);
      await sendButtons(from, "Preferred time of day?", [
        { id: "time_morning", title: "🌅 Morning" },
        { id: "time_evening", title: "🌇 Evening" },
      ]);
      return;

    case "ASK_PAX_NAME":
      session.draft.passengerList.push({ name: text });
      session.step = "ASK_PAX_AGE";
      await saveSession(from, session);
      await sendText(from, `Passenger ${session.draft.passengerList.length} — what's their age?`);
      return;

    case "ASK_PAX_AGE": {
      const current = session.draft.passengerList[session.draft.passengerList.length - 1];
      current.age = text;
      session.step = "ASK_PAX_WEIGHT";
      await saveSession(from, session);
      await sendText(from, `Passenger ${session.draft.passengerList.length} — what's their approximate weight in kg?`);
      return;
    }

    case "ASK_PAX_WEIGHT": {
      const weight = parseInt(text, 10);
      const maxWeight = parseInt(process.env.MAX_RIDER_WEIGHT_KG || "110", 10);
      if (isNaN(weight)) {
        await sendText(from, "Please send just the number, e.g. 70");
        return;
      }
      if (weight > maxWeight) {
        await sendText(
          from,
          `Unfortunately our max rider weight is ${maxWeight}kg for safety reasons. ` +
            `Reply "human" if you'd like to discuss options with our team.`
        );
        await resetSession(from);
        return;
      }
      const current = session.draft.passengerList[session.draft.passengerList.length - 1];
      current.weight = weight;
      await saveSession(from, session);

      if (session.draft.passengerList.length < session.draft.passengerCount) {
        session.step = "ASK_PAX_NAME";
        await saveSession(from, session);
        await askPassengerName(from, session);
      } else {
        session.step = "ASK_EMAIL";
        await saveSession(from, session);
        await sendText(from, "What's the best email address for your booking confirmation?");
      }
      return;
    }

    case "ASK_EMAIL": {
      if (!text.includes("@")) {
        await sendText(from, "That doesn't look like a valid email — please re-enter it.");
        return;
      }
      session.draft.email = text;
      session.step = "CONFIRM";
      await saveSession(from, session);
      const d = session.draft;
      const paxSummary = d.passengerList
        .map((p, i) => `  ${i + 1}. ${p.name}, age ${p.age}, ${p.weight}kg`)
        .join("\n");
      await sendButtons(
        from,
        `Please confirm your booking:\n\n` +
          `📍 ${d.location} — ${d.package}\n` +
          `💰 ${d.price}\n` +
          `👥 Passengers (${d.passengerCount}):\n${paxSummary}\n` +
          `📅 Date: ${d.date} (${d.timePreference})\n` +
          `📧 ${d.email}\n\n` +
          `We'll call to confirm your exact slot.`,
        [
          { id: "confirm_yes", title: "✅ Confirm" },
          { id: "confirm_no", title: "❌ Cancel" },
        ]
      );
      return;
    }

    default:
      await sendText(from, "Sorry, I didn't quite get that — here's our menu:");
      await sendMainMenu(from);
  }
}

async function handOffToHuman(to) {
  await sendText(
    to,
    "🙋 Connecting you with our team — someone will reply here shortly. " +
      "For urgent safety issues, please call us directly."
  );
  if (process.env.HUMAN_HANDOFF_NUMBER) {
    await sendText(process.env.HUMAN_HANDOFF_NUMBER, `⚠️ Handoff requested by ${to}. Please check the chat directly.`);
  }
}

function extractText(message) {
  if (message.type === "text") return message.text.body;
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
  }
  return "";
}

function extractInteractiveId(message) {
  if (message.type !== "interactive") return null;
  return message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || null;
}