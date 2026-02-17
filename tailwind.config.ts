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
          bg: "#ffffff",
          border: "#e5e7eb",
          hover: "#f3f4f6",
        },
        card: {
          bg: "#ffffff",
          border: "#e5e7eb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
