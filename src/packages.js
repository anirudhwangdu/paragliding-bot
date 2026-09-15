export const LOCATIONS = {
  bangalore: {
    label: "Bangalore",
    sections: [
      {
        title: "Premium Packages",
        rows: [
          { id: "blr_thriller", title: "Thriller Scenic Exp", description: "Most Popular · ₹14,999/person · 25-30 min · up to 2500ft", priceValue: 14999, unit: "person",
            details: "🪂 Thriller Scenic Experience (Most Popular)\n₹14,999/person\nDuration: 25-30 min | Altitude: up to 2,500ft\nIncludes: Extended flight, cinematic edited reel & full Insta360 footage." },
          { id: "blr_sunset", title: "Sunset Solo Experience", description: "₹16,999/person · 25-30 min · golden hour flight", priceValue: 16999, unit: "person",
            details: "🪂 Sunset Solo Experience\n₹16,999/person\nDuration: 25-30 min | Altitude: up to 2,500ft\nIncludes: Golden hour sunset flight & cinematic edited reel." },
          { id: "blr_couple", title: "Love in the Air", description: "₹24,999/couple · 25-30 min each · side-by-side flight", priceValue: 24999, unit: "flat",
            details: "🪂 Love in the Air (Elite Couple Experience)\n₹24,999/couple\nDuration: 25-30 min each | Altitude: up to 2,500ft\nIncludes: Simultaneous side-by-side flight, cinematic couple highlight video & individual Insta360 footage." }
        ],
      },
      {
        title: "Classic Packages",
        rows: [
         { id: "blr_intro", title: "Tandem Introductory", description: "₹3,999/person · 7 min · up to 1000ft", priceValue: 3999, unit: "person",
            details: "🪂 Tandem Introductory Flight\n₹3,999/person\nDuration: 7 min | Altitude: up to 1,000ft MSL\nIdeal for first-time flyers seeking a gentle intro to the sky." },
          { id: "blr_classicthr", title: "SkySail Thriller Flight", description: "₹6,999/person · 12 min · up to 2000ft", priceValue: 6999, unit: "person",
            details: "🪂 SkySail Thriller Flight\n₹6,999/person\nDuration: 12 min | Altitude: up to 2,000ft MSL\nIdeal for thrill-seekers looking for daring turns and higher adrenaline." },
          { id: "blr_birthday", title: "Birthday Blast Off!", description: "₹6,999/person · 15 min · birthday special", priceValue: 6999, unit: "person",
            details: "🪂 Birthday Blast Off!\n₹6,999/person\nDuration: 15 min | Altitude: up to 2,000ft MSL\nIdeal for special birthday celebrations and surprises." },
          { id: "blr_pet", title: "Fluff 'n' Flight", description: "₹6,999/pair · 15 min · 1 adult + 1 pet", priceValue: 6999, unit: "flat",
            details: "🪂 Fluff 'n' Flight\n₹6,999/pair\nDuration: 15 min | Altitude: up to 1,500ft MSL\nIncludes: 1 adult + 1 pet tandem flight." },
          { id: "blr_duo", title: "Tandem Sky Duo", description: "₹5,999/pair · 10 min · 1 adult + 1 child", priceValue: 5999, unit: "flat",
            details: "🪂 Tandem Sky Duo\n₹5,999/pair\nDuration: 10 min | Altitude: up to 1,000ft MSL\nIncludes: 1 adult + 1 child tandem flight." },
        ],
      },
    ],
  },
  alleppey: {
    label: "Alleppey",
    sections: [
      {
        title: "Flight Packages",
        rows: [
          { id: "alp_intro", title: "Tandem Introductory", description: "₹4,500/person · 4-5 min · Insta360 video included", priceValue: 4500, unit: "person",
            details: "🪂 *Tandem Introductory*\n₹4,500/person\nDuration: 4-5 min\nIncludes: Tandem flight with a professional pilot & Insta360 video.\n\"Short ride. Big memories!\"" },
          { id: "alp_thriller", title: "SkySail Thriller", description: "₹5,999/person · 5-6 min · extra altitude & thrills", priceValue: 5999, unit: "person",
            details: "🪂 *SkySail Thriller*\n₹5,999/person\nDuration: 5-6 min\nIncludes: Extra altitude & thrills, Insta360 photos & video.\n\"Higher. Longer. Unforgettable.\"" },
          { id: "alp_pet", title: "Fluff & Fly", description: "₹5,999/person · 5-6 min · pet-friendly flight", priceValue: 5999, unit: "person",
            details: "🪂 *Fluff & Fly*\n₹5,999/person\nDuration: 5-6 min\nIncludes: Tandem flight, Insta360 photos & video.\nDesigned for pet lovers flying with their furry companion." },
          { id: "alp_birthday", title: "Birthday Blast", description: "₹5,999/person · 5-6 min · birthday surprises", priceValue: 5999, unit: "person",
            details: "🪂 *Birthday Blast*\n₹5,999/person\nDuration: 5-6 min\nIncludes: Tandem flight, Insta360 photos & video, birthday surprises in the sky." },
        ],
      },
    ],
  },
};

export function findPackage(id) {
  for (const loc of Object.values(LOCATIONS)) {
    for (const section of loc.sections) {
      const found = section.rows.find((r) => r.id === id);
      if (found) return found;
    }
  }
  return null;
}