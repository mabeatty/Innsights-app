import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const fallbackSupabaseUrl = "https://xdwoczxzifqojhqvjlzd.supabase.co";
const fallbackSupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Inhkd29jenh6aWZxb2pocXZqbHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTE0OTMsImV4cCI6MjA4NzM2NzQ5M30.0C-w01BsxRZUaU2RXJJ_EZzXmaysST5ed5D3GHgIrX0";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || fallbackSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseKey
    ),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
