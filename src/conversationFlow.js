import { sendText, sendButtons, sendList } from "./whatsappClient.js";
import { getSession, saveSession, resetSession, saveBooking } from "./db.js";
import { FAQ, FAQ_MENU_SECTIONS } from "./faq.js";
import { LOCATIONS, findPackage } from "./packages.js";
import { nanoid } from "nanoid";

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
    session.draft = { location: LOCATIONS[key].label };
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

  const pkg = findPackage(id);
  if (pkg) {
    session.draft = { ...session.draft, package: pkg.title, price: pkg.description };
    session.step = "ASK_PASSENGERS";
    await saveSession(from, session);
    await sendText(from, `Great choice — *${pkg.title}* (${pkg.description}).\n\nHow many passengers will be flying?`);
    return;
  }

  if (id === "time_morning" || id === "time_evening") {
    session.draft.timePreference = id === "time_morning" ? "Morning" : "Evening";
    session.step = "ASK_NAME";
    await saveSession(from, session);
    await sendText(from, "What's your full name?");
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
    await sendText(
      from,
      `✅ Booking received! Reference: *${booking.id}*\n\n` +
        `${booking.location} — ${booking.package}\n` +
        `Passengers: ${booking.passengers} · Date: ${booking.date} · ${booking.timePreference}\n\n` +
        `Our team will call you shortly to confirm your exact time slot. ` +
        `A confirmation has also been noted against your email: ${booking.email}.`
    );
    if (process.env.HUMAN_HANDOFF_NUMBER) {
      await sendText(
        process.env.HUMAN_HANDOFF_NUMBER,
        `🆕 New booking ${booking.id}\n${booking.name}, age ${booking.age}, ${booking.weight}kg\n` +
          `${booking.location} — ${booking.package}\nPax: ${booking.passengers} · ${booking.date} · ${booking.timePreference}\n` +
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
    case "ASK_PASSENGERS":
      session.draft.passengers = text;
      session.step = "ASK_DATE";
      await saveSession(from, session);
      await sendText(from, "What date would you like to fly? (e.g. 25 Sept)");
      return;

    case "ASK_DATE":
      session.draft.date = text;
      await saveSession(from, session);
      await sendButtons(from, "Preferred time of day?", [
        { id: "time_morning", title: "🌅 Morning" },
        { id: "time_evening", title: "🌇 Evening" },
      ]);
      return;

    case "ASK_NAME":
      session.draft.name = text;
      session.step = "ASK_AGE";
      await saveSession(from, session);
      await sendText(from, "What's your age?");
      return;

    case "ASK_AGE":
      session.draft.age = text;
      session.step = "ASK_WEIGHT";
      await saveSession(from, session);
      await sendText(from, "What's your approximate weight in kg? (needed for safety/gear sizing)");
      return;

    case "ASK_WEIGHT": {
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
      session.draft.weight = weight;
      session.step = "ASK_EMAIL";
      await saveSession(from, session);
      await sendText(from, "What's your email address? (for your booking confirmation)");
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
      await sendButtons(
        from,
        `Please confirm your booking:\n\n` +
          `📍 ${d.location} — ${d.package}\n` +
          `💰 ${d.price}\n` +
          `👥 Passengers: ${d.passengers}\n` +
          `📅 Date: ${d.date} (${d.timePreference})\n` +
          `👤 ${d.name}, age ${d.age}, ${d.weight}kg\n` +
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