import { sendText, sendButtons, sendList } from "./whatsappClient.js";
import { getSession, saveSession, resetSession, saveBooking } from "./db.js";
import { FAQ, FAQ_MENU_SECTIONS } from "./faq.js";
import { nanoid } from "nanoid";

const TOURS = [
  { id: "tour_intro", title: "Tandem Introductory", description: "₹4,500 · 9-10 min" },
  { id: "tour_thriller", title: "SkySail Thriller", description: "₹5,999 · 14-16 min" },
  { id: "tour_pet", title: "Fluff & Fly (pet-friendly)", description: "₹5,999 · 13-15 min" },
  { id: "tour_birthday", title: "Birthday Blast", description: "₹5,999 · 14-16 min" },
];

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
    await sendMainMenu(from);
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

async function sendMainMenu(to) {
  await sendButtons(to, `👋 Welcome to *${process.env.BUSINESS_NAME}*!\n\nHow can we help today?`, [
    { id: "menu_faq", title: "📋 FAQs" },
    { id: "menu_book", title: "🪂 Book a Flight" },
    { id: "menu_human", title: "🙋 Talk to a Human" },
  ]);
}

async function routeInteractive(from, id, session) {
  if (id === "menu_faq") {
    await sendList(from, "What would you like to know?", "View FAQs", FAQ_MENU_SECTIONS);
    return;
  }
  if (id === "menu_book") {
    session.step = "CHOOSE_TOUR";
    await saveSession(from, session);
    await sendList(from, "Pick a flight experience:", "View Tours", [{ title: "Tours", rows: TOURS }]);
    return;
  }
  if (id === "menu_human") {
    await handOffToHuman(from);
    return;
  }

  if (id.startsWith("faq_")) {
    const key = id.replace("faq_", "");
    await sendText(from, FAQ[key] || "Sorry, I don't have that info yet.");
    await sendButtons(from, "Anything else?", [
      { id: "menu_faq", title: "📋 More FAQs" },
      { id: "menu_book", title: "🪂 Book a Flight" },
    ]);
    return;
  }

  if (id.startsWith("tour_")) {
    const tour = TOURS.find((t) => t.id === id);
    session.draft = { tour: tour.title, price: tour.description };
    session.step = "ASK_NAME";
    await saveSession(from, session);
    await sendText(from, `Great choice — *${tour.title}*.\n\nWhat's your full name?`);
    return;
  }

  if (id === "confirm_yes") {
    const booking = {
      id: nanoid(8),
      phone: from,
      ...session.draft,
      status: "pending_weather_check",
      createdAt: new Date().toISOString(),
    };
    await saveBooking(booking);
    await sendText(
      from,
      `✅ Booking received! Reference: *${booking.id}*\n\n` +
        `We'll confirm your exact time slot the evening before your flight, ` +
        `pending weather. You'll get a reminder 24h and 2h before.`
    );
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
    case "ASK_NAME":
      session.draft.name = text;
      session.step = "ASK_WEIGHT";
      await saveSession(from, session);
      await sendText(from, "What's your approximate weight in kg? (needed for gear sizing/safety)");
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
      session.step = "ASK_DATE";
      await saveSession(from, session);
      await sendText(from, "What date would you like to fly? (e.g. 25 Aug)");
      return;
    }

    case "ASK_DATE":
      session.draft.date = text;
      session.step = "CONFIRM";
      await saveSession(from, session);
      await sendButtons(
        from,
        `Please confirm:\n\n` +
          `🪂 Tour: ${session.draft.tour}\n` +
          `👤 Name: ${session.draft.name}\n` +
          `⚖️ Weight: ${session.draft.weight}kg\n` +
          `📅 Date: ${session.draft.date}\n\n` +
          `Note: slots are confirmed pending weather check morning-of.`,
        [
          { id: "confirm_yes", title: "✅ Confirm" },
          { id: "confirm_no", title: "❌ Cancel" },
        ]
      );
      return;

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
    await sendText(
      process.env.HUMAN_HANDOFF_NUMBER,
      `⚠️ Handoff requested by ${to}. Please check the chat directly.`
    );
  }
}

function extractText(message) {
  if (message.type === "text") return message.text.body;
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || ""
    );
  }
  return "";
}

function extractInteractiveId(message) {
  if (message.type !== "interactive") return null;
  return message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || null;
}
