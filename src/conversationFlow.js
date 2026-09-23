import { getSession, saveSession, resetSession, saveBooking, hasSession } from "./db.js";
import { FAQ, FAQ_MENU_SECTIONS } from "./faq.js";
import { LOCATIONS, findPackage } from "./packages.js";
import { appendBookingToSheet, getNextBookingId } from "./sheets.js";
import { nanoid } from "nanoid";
import { sendText, sendButtons, sendList, sendVideo, sendImage, sendTemplate } from "./whatsappClient.js";

const HANDOFF_KEYWORDS = ["human", "agent", "help me", "call me", "emergency", "injury", "complaint"];

export async function handleIncomingMessage(from, message) {
  const text = extractText(message).trim();
  const lower = text.toLowerCase();

  if (HANDOFF_KEYWORDS.some((k) => lower.includes(k))) {
    await handOffToHuman(from);
    return;
  }

  const isNewSession = !hasSession(from);
  const session = getSession(from);
  const isGreeting = ["hi", "hello", "hey", "start"].includes(lower);
  const isMenu = lower === "menu";

  if (isMenu) {
    session.step = "AWAITING_INITIAL_LOCATION";
    await saveSession(from, session);
    await sendButtons(from, "Which location would you like to fly at?", [
      { id: "greet_bangalore", title: "Bangalore" },
      { id: "greet_alleppey", title: "Alleppey" },
    ]);
    return;
  }

  if (isGreeting) {
    if (isNewSession || !session.draft?.locationKey) {
      session.step = "AWAITING_INITIAL_LOCATION";
      await saveSession(from, session);
      await sendButtons(from, "👋 Welcome! Which location are you interested in?", [
        { id: "greet_bangalore", title: "Bangalore" },
        { id: "greet_alleppey", title: "Alleppey" },
      ]);
      return;
    }
    session.step = "IDLE";
    await saveSession(from, session);
    await sendWelcome(from);
    return;
  }

  const interactiveId = extractInteractiveId(message);

  if (interactiveId) {
    await routeInteractive(from, interactiveId, session);
    return;
  }

  await routeFreeText(from, text, session);
}

async function sendWelcome(to) {
  if (process.env.WELCOME_VIDEO_ID) {
    await sendVideoById(to, process.env.WELCOME_VIDEO_ID, "See what flying with us feels like! 🪂");
  } else if (process.env.WELCOME_VIDEO_URL) {
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

async function sendPackageList(to, locationKey) {
  const loc = LOCATIONS[locationKey];
  if (!loc) {
    await sendText(to, "Something went wrong loading packages. Let's start over.");
    await resetSession(to);
    await sendMainMenu(to);
    return;
  }
  const cleanSections = loc.sections.map((section) => ({
    title: section.title,
    rows: section.rows.map(({ id, title, description }) => ({ id, title, description })),
  }));
  await sendList(to, `${loc.label} packages:`, "View Packages", cleanSections);
}

async function askPassengerDetails(to, session) {
  const total = session.draft.passengerCount;
  const formUrl = `https://paragliding-bot.onrender.com/passenger-form?to=${to}&total=${total}`;
  await sendText(to, `Please fill in your ${total > 1 ? total + " passengers'" : "passenger's"} details:\n${formUrl}`);
}

function buildConfirmMessage(d) {
  const paxSummary = d.passengerList
    .map((p, i) => `  ${i + 1}. ${p.name}, age ${p.age}, ${p.weight}kg`)
    .join("\n");
  return (
    `Please confirm your booking:\n\n` +
    `📍 ${d.location} — ${d.package}\n` +
    `💰 ${d.price}\n` +
    `👥 Passengers (${d.passengerCount}):\n${paxSummary}\n` +
    `📅 Date: ${d.date} (${d.timePreference})\n` +
    `📧 ${d.email}\n\n` +
    `We'll call to confirm your exact slot.`
  );
}

async function routeInteractive(from, id, session) {
  if (id === "greet_bangalore" || id === "greet_alleppey") {
    const key = id === "greet_bangalore" ? "bangalore" : "alleppey";
    session.draft = { location: LOCATIONS[key].label, locationKey: key };
    session.step = "IDLE";
    await saveSession(from, session);

    if (process.env.HUMAN_HANDOFF_NUMBER) {
      sendTemplate(process.env.HUMAN_HANDOFF_NUMBER, "new_chat_alert", "en", [
        { type: "body", parameters: [{ type: "text", text: `${from} (${LOCATIONS[key].label})` }] },
      ]).catch((e) => console.error("New chat notification failed:", e.message));
    }

    await sendWelcome(from);
    return;
  }

  if (id === "menu_book") {
    if (session.draft?.locationKey) {
      session.step = "CHOOSE_PACKAGE";
      await saveSession(from, session);
      await sendPackageList(from, session.draft.locationKey);
    } else {
      await sendButtons(from, "Which location would you like to fly at?", [
        { id: "greet_bangalore", title: "Bangalore" },
        { id: "greet_alleppey", title: "Alleppey" },
      ]);
    }
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

  if (id.startsWith("faq_")) {
    const key = id.replace("faq_", "");
    await sendText(from, FAQ[key] || "Sorry, I don't have that info yet.");
    await sendMainMenu(from);
    return;
  }

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
    const chosen = findPackage(session.draft.selectedPackageId);
    if (!chosen) {
      await sendText(from, "That package is no longer available. Let's start over.");
      await resetSession(from);
      await sendMainMenu(from);
      return;
    }
    session.draft.package = chosen.title;
    session.draft.price = chosen.description;
    session.step = "ASK_PASSENGERS";
    await saveSession(from, session);
    await sendText(from, `How many passengers will be flying?`);
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
    session.step = "AWAITING_PAX_FORM";
    await saveSession(from, session);
    await askPassengerDetails(from, session);
    return;
  }

  if (id.startsWith("email_")) {
    const idx = parseInt(id.replace("email_", ""), 10);
    session.draft.email = session.draft.passengerList[idx].email;
    session.step = "CONFIRM";
    await saveSession(from, session);
    await sendButtons(from, buildConfirmMessage(session.draft), [
      { id: "confirm_yes", title: "✅ Confirm" },
      { id: "confirm_no", title: "❌ Cancel" },
    ]);
    return;
  }

  if (id === "confirm_yes") {
    const bookingId = await getNextBookingId();
    const customerRef = "SKY-" + nanoid(6).toUpperCase();
    const chosenPkg = findPackage(session.draft.selectedPackageId);
    if (!chosenPkg) {
      await sendText(from, "Something went wrong with your package selection. Let's start over.");
      await resetSession(from);
      await sendMainMenu(from);
      return;
    }
    const totalPrice = chosenPkg.unit === "person"
      ? chosenPkg.priceValue * session.draft.passengerCount
      : chosenPkg.priceValue;
    const advance = 1000 * session.draft.passengerCount;
    const balance = totalPrice - advance;
    const booking = {
      id: bookingId,
      customerRef,
      phone: from,
      advance,
      balance,
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
      `✅ Booking received! Reference: *${booking.customerRef}*\n\n` +
        `${booking.location} — ${booking.package}\n` +
        `Passengers (${booking.passengerCount}):\n${paxSummary}\n` +
        `Date: ${booking.date} · ${booking.timePreference}\n\n` +
        `Please pay the advance of ₹${advance} using the QR code below. ` +
        `Once received, we'll confirm your slot.`
    );
    if (process.env.QR_IMAGE_URL) {
      await sendImage(from, process.env.QR_IMAGE_URL, `Advance payment: ₹${advance}`);
    }
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
        await sendText(from, "Please send a valid number, e.g. 2");
        return;
      }
      session.draft.passengerCount = count;
      await saveSession(from, session);
      await sendButtons(from, "Preferred time of day?", [
        { id: "time_morning", title: "🌅 Morning" },
        { id: "time_evening", title: "🌇 Evening" },
      ]);
      return;
    }

    default:
      await sendText(from, "Oops, we didn't quite get that 🙏");
      await sendMainMenu(from);
  }
}

export async function handleBulkFormSubmission({ phone, passengers, date }) {
  const session = getSession(phone);
  const maxWeight = parseInt(process.env.MAX_RIDER_WEIGHT_KG || "110", 10);

  // Save the date selected by the customer in the passenger form
  if (date) {
    session.draft.date = date;
  }
  for (const p of passengers) {
    const w = parseInt(p.weight, 10);
    if (isNaN(w) || w > maxWeight) {
      await sendText(phone, `One passenger's weight (${p.weight}kg) exceeds our ${maxWeight}kg safety limit. Reply "human" to discuss options.`);
      await resetSession(phone);
      return;
    }
    session.draft.passengerList.push({ name: p.name, age: p.age, weight: w, email: p.email });
  }

  session.draft.date = date;

  if (session.draft.passengerList.length === 1) {
    session.draft.email = session.draft.passengerList[0].email;
    session.step = "CONFIRM";
    await saveSession(phone, session);
    await sendButtons(phone, buildConfirmMessage(session.draft), [
      { id: "confirm_yes", title: "✅ Confirm" },
      { id: "confirm_no", title: "❌ Cancel" },
    ]);
    return;
  }

  session.step = "CHOOSE_CONFIRM_EMAIL";
  await saveSession(phone, session);
  const rows = session.draft.passengerList.map((p, i) => ({
    id: `email_${i}`,
    title: `Passenger ${i + 1}`,
    description: p.email,
  }));
  await sendList(phone, "Which email should we send the booking confirmation to?", "Choose Email", [
    { title: "Confirmation Email", rows },
  ]);
}

async function handOffToHuman(to) {
  await sendText(
    to,
    "🙋 Connecting you with our team — someone will reply here shortly. " +
      "For urgent safety issues, please call us directly."
  );
  if (process.env.HUMAN_HANDOFF_NUMBER) {
    sendTemplate(process.env.HUMAN_HANDOFF_NUMBER, "handoff_alert", "en", [
      { type: "body", parameters: [{ type: "text", text: to }] },
    ]).catch((e) => console.error("Handoff template failed:", e.message));
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