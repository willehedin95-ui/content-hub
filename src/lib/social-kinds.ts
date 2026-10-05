// Post types for the social queue. Shared by server and the page (no SDK imports here).
export const SOCIAL_KINDS = {
  product: "Produktbild utan personer",
  person: "Person med produkten",
  knowledge: "Kunskap (karusell)",
  humor: "Humor",
  question: "Fråga till följarna",
  other: "Annat",
} as const;
export type SocialKind = keyof typeof SOCIAL_KINDS;
