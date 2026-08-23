export const FAQ = {
  pricing:
    "💰 *Pricing — Tandem Paramotor Joyrides*\n\n" +
    "- Tandem Introductory (9-10 min): ₹4,500\n" +
    "- SkySail Thriller (14-16 min, extra altitude): ₹5,999\n" +
    "- Fluff & Fly — bring your pet! (13-15 min): ₹5,999\n" +
    "- Birthday Blast — with sky surprises! (14-16 min): ₹5,999\n\n" +
    "All packages include Insta 360° photos & video and a certified pilot.",

  gear:
    "🪂 *Gear & Safety*\n\n" +
    "Certified professional pilots, premium safety equipment, and " +
    "5000+ successful tandem flights completed. Every flight follows " +
    "rigorous safety standards.",

  weight:
    `⚖️ *Weight & Fitness*\n\nMax rider weight: ${process.env.MAX_RIDER_WEIGHT_KG || 110}kg. ` +
    "No major cardiac/spine conditions. Minimum age 12 with guardian consent.",

  weather:
    "🌤️ *Weather Policy*\n\n" +
    "Flights depend on live wind/weather conditions. If your slot is " +
    "unsafe, we'll offer a free reschedule — no questions asked.",

  location:
    "📍 *Location*\n\nVijaya Park backside, Alleppey Beach, Alappuzha, Kerala.\n\n" +
    "Soar above golden beaches and serene backwaters — Alappuzha like never before!",
};

export const FAQ_MENU_SECTIONS = [
  {
    title: "Common Questions",
    rows: [
      { id: "faq_pricing", title: "Pricing", description: "Tour costs & packages" },
      { id: "faq_gear", title: "Gear & Safety", description: "Equipment & certifications" },
      { id: "faq_weight", title: "Weight & Fitness", description: "Eligibility requirements" },
      { id: "faq_weather", title: "Weather Policy", description: "Cancellations & reschedules" },
      { id: "faq_location", title: "Location", description: "Where to meet us" },
    ],
  },
];
