import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: "#0f1117",
          border: "#1e2130",
          hover: "#1a1d2e",
        },
        card: {
          bg: "#141620",
          border: "#1e2130",
        },
      },
    },
  },
  plugins: [],
};

export default config;
