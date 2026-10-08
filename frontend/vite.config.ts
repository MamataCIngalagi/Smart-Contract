import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const appOrigin = process.env.LOGEN_APP_ORIGIN;
const allowedHost = appOrigin ? new URL(appOrigin).hostname : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: allowedHost ? [allowedHost] : [],
  },
});
