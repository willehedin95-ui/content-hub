// Person options shared by Before/After and Swipe Image, so both tools offer
// the same ages and ethnicities.

// Woman is listed first. Before/After has deliberately no "Random" gender -
// a man is only ever generated when explicitly picked.
export const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
];

export const AGE_OPTIONS = [
  { value: "", label: "Random" },
  { value: "30-35", label: "30-35" },
  { value: "36-40", label: "36-40" },
  { value: "40-45", label: "40-45" },
  { value: "46-50", label: "46-50" },
  { value: "51-55", label: "51-55" },
  { value: "56-60", label: "56-60" },
  { value: "61-65", label: "61-65" },
  { value: "66-70", label: "66-70" },
  { value: "71-75", label: "71-75" },
];

export const ETHNICITY_OPTIONS = [
  { value: "scandinavian", label: "Scandinavian (default)" },
  { value: "north_european", label: "Northern European" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "east_asian", label: "East Asian" },
  { value: "south_asian", label: "South Asian" },
  { value: "latin", label: "Latin / Hispanic" },
  { value: "middle_eastern", label: "Middle Eastern" },
  { value: "african", label: "African / African American" },
];

export interface PersonOverride {
  gender?: string;
  age?: string;
  ethnicity?: string;
  hair_color?: string;
}

/** "Scandinavian woman, 56-60 years old, silver-grey hair" - only the parts that are set. Empty string when nothing is set. */
export function describePersonOverride(p: PersonOverride | null | undefined): string {
  if (!p) return "";
  const eth = ETHNICITY_OPTIONS.find((o) => o.value === p.ethnicity)?.label.replace(/ \(default\)$/, "");
  const gender = GENDER_OPTIONS.find((o) => o.value === p.gender)?.value;
  const age = AGE_OPTIONS.find((o) => o.value === p.age && o.value)?.value;
  const hair = (p.hair_color ?? "").trim().slice(0, 60);
  const who = [eth, gender].filter(Boolean).join(" ");
  const parts = [who, age ? `${age} years old` : "", hair ? `${hair} hair` : ""].filter(Boolean);
  return parts.join(", ");
}
