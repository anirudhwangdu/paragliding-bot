/**
 * Website booking links -> WhatsApp bot
 *
 * Every Book button on the website opens WhatsApp with a message like:
 *   "Hi SkySail! I'd like to book Sunset Solo Experience (Bengaluru). Booking code: BENGALURU-SUNSET-SOLO-EXPERIENCE"
 * This module spots the "Booking code: ..." part and drops the customer straight into the right step
 * of your normal flow, so they don't have to pick a location and package again.
 */
import { getSession, saveSession, hasSession } from "./db.js";
import { LOCATIONS, findPackage, CORPORATE_DETAILS, CAMPING_DETAILS } from "./packages.js";
import { logNewChat } from "./sheets.js";
import { sendText, sendButtons, sendList, errMsg } from "./whatsappClient.js";

/* If a website package doesn't auto-match one of your bot packages, map its code to the bot's package id here.
   Unmatched codes are printed in the server log as "[SITE-BOOKING] no package match for ...". */
const CODE_OVERRIDES = {
  // "BENGALURU-SUNSET-SOLO-EXPERIENCE": "your_bot_package_id",
};

const LOCATION_PREFIX = { BENGALURU: "bangalore", ALAPPUZHA: "alleppey" };
const CAMPING_PLANS = {
  "CAMPING-TWO": "The Two of You",
  "CAMPING-CREW": "Bring the Crew",
  "CAMPING-TAKEOVER": "The Full Takeover",
};

export function parseSiteBookingCode(text) {
  const m = /booking code:\s*([A-Z0-9][A-Z0-9-]{2,80})/i.exec(text || "");
  return m ? m[1].toUpperCase() : null;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function findRow(locationKey, code, slug) {
  const loc = LOCATIONS[locationKey];
  const rows = loc.sections.flatMap((section, sectionIndex) =>
    section.rows.map((row) => ({ row, sectionIndex }))
  );

  if (CODE_OVERRIDES[code]) {
    return rows.find((r) => r.row.id === CODE_OVERRIDES[code]) || null;
  }

  const want = norm(slug);
  const names = (r) => [norm(r.row.title), norm(findPackage(r.row.id)?.title)].filter(Boolean);

  const exact = rows.filter((r) => names(r).includes(want));
  if (exact.length === 1) return exact[0];

  // WhatsApp list titles are capped at 24 characters, so the bot's title may be a shortened version
  const loose = rows.filter((r) => names(r).some((n) => n.length >= 6 && (want.includes(n) || n.includes(want))));
  return loose.length === 1 ? loose[0] : null;
}

async function setLocation(from, session, key) {
  const isNew = !hasSession(from) || !session.draft?.locationKey;
  session.draft = { location: LOCATIONS[key].label, locationKey: key };
  if (isNew) {
    logNewChat(from, LOCATIONS[key].label).catch((e) => console.error("New chat logging failed:", errMsg(e)));
  }
}

async function sendPackageList(to, key) {
  const loc = LOCATIONS[key];
  const sections = loc.sections.map((s) => ({
    title: s.title,
    rows: s.rows.map(({ id, title, description }) => ({ id, title, description })),
  }));
  await sendList(to, `${loc.label} packages:`, "View Packages", sections);
}

/** Returns true if the message was a website booking link and has been handled. */
export async function handleSiteBooking(from, code) {
  const session = getSession(from);
  const wasKnown = hasSession(from);
  session.draft = session.draft || {};
  const [prefix, ...rest] = code.split("-");
  const slug = rest.join("-");

  /* Camping and corporate: go straight to the details + quote buttons */
  if (prefix === "CAMPING" || prefix === "CORPORATE") {
    const isCamp = prefix === "CAMPING";
    if (!session.draft.locationKey) await setLocation(from, session, "bangalore");
    session.draft.quoteType = isCamp ? "Camping" : "Corporate";
    session.draft.quotePlan = CAMPING_PLANS[code] || null;
    session.step = "CHOOSE_CATEGORY";
    await saveSession(from, session);
    if (session.draft.quotePlan) await sendText(from, `Great choice: *${session.draft.quotePlan}* 🏕️`);
    await sendButtons(from, isCamp ? CAMPING_DETAILS : CORPORATE_DETAILS, [
      { id: "cat_quote", title: "📞 Get a Quote" },
      { id: "cat_back", title: "🔄 Other Categories" },
    ]);
    return true;
  }

  const key = LOCATION_PREFIX[prefix];
  if (!key) return false; // not one of ours, let the normal flow handle it

  await setLocation(from, session, key);

  /* "Book a slot" button on the location page: start the normal booking menu */
  if (slug === "ANY-FLIGHT") {
    if (key === "bangalore") {
      session.step = "CHOOSE_CATEGORY";
      await saveSession(from, session);
      await sendList(from, "What are you looking for?", "View Categories", [
        { title: "Categories", rows: LOCATIONS.bangalore.categories },
      ]);
    } else {
      session.step = "CHOOSE_PACKAGE";
      await saveSession(from, session);
      await sendPackageList(from, key);
    }
    return true;
  }

  /* A specific package */
  const hit = findRow(key, code, slug);
  const pkg = hit && findPackage(hit.row.id);
  if (!pkg) {
    console.warn(`[SITE-BOOKING] no package match for ${code}, showing the ${key} package list`);
    session.step = "CHOOSE_PACKAGE";
    await saveSession(from, session);
    await sendText(from, "Great, let's get you booked! Pick your package below 👇");
    await sendPackageList(from, key);
    return true;
  }

  session.draft.selectedPackageId = pkg.id;
  if (key === "bangalore") session.draft.categoryId = hit.sectionIndex === 0 ? "premium" : "classic";
  session.step = "PACKAGE_DETAIL";
  await saveSession(from, session);
  await sendButtons(from, pkg.details, [
    { id: "pkg_book", title: "✅ Book This" },
    { id: "pkg_other", title: "🔄 Other Packages" },
  ]);
  return true;
}