export const LOCATIONS = {
  bangalore: {
    label: "Bangalore",
    sections: [
      {
        title: "Premium Packages",
        rows: [
          { id: "blr_scenic", title: "Skysail Scenic Ride", description: "₹9,999/person · 25-30 min · up to 1500ft" },
          { id: "blr_thriller", title: "Thriller Scenic Exp", description: "Most Popular · ₹14,999/person · 35-40 min · up to 2500ft" },
          { id: "blr_sunset", title: "Sunset Solo Experience", description: "₹16,999/person · 35-40 min · golden hour flight" },
          { id: "blr_elite", title: "Skysail Elite Ride", description: "₹18,999/person · 40-45 min · premium cinematic edit" },
          { id: "blr_couple", title: "Love in the Air", description: "₹24,999/couple · 40-45 min each · side-by-side flight" },
        ],
      },
      {
        title: "Classic Packages",
        rows: [
          { id: "blr_intro", title: "Tandem Introductory", description: "₹3,999/person · 10 min · up to 1000ft" },
          { id: "blr_classicthr", title: "SkySail Thriller Flight", description: "₹6,999/person · 15 min · up to 2000ft" },
          { id: "blr_birthday", title: "Birthday Blast Off!", description: "₹6,999/person · 20 min · birthday special" },
          { id: "blr_pet", title: "Fluff 'n' Flight", description: "₹6,999/pair · 10 min · 1 adult + 1 pet" },
          { id: "blr_duo", title: "Tandem Sky Duo", description: "₹5,999/pair · 10 min · 1 adult + 1 child" },
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
          { id: "alp_intro", title: "Tandem Introductory", description: "₹4,500/person · 4-5 min · Insta360 video included" },
          { id: "alp_thriller", title: "SkySail Thriller", description: "₹5,999/person · 5-6 min · extra altitude & thrills" },
          { id: "alp_pet", title: "Fluff & Fly", description: "₹5,999/person · 5-6 min · pet-friendly flight" },
          { id: "alp_birthday", title: "Birthday Blast", description: "₹5,999/person · 5-6 min · birthday surprises" },
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