/**
 * =================================================================
 * 🚀 AQUATIC SWIMTRACK CONFIGURATION 🚀
 * =================================================================
 * This file contains all the essential settings for your application.
 * Update these values to match your own project setup.
 *
 * INSTRUCTIONS:
 * 1. Fill in your Supabase URL and Public Anon Key.
 * 2. Customize the application and competition default names.
 * =================================================================
 */

export const config = {
  /**
   * Supabase Project Credentials
   * Found in your Supabase project's "Project Settings" > "API"
   */
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL || "https://kbtyaxrddbcnkhlohlnn.supabase.co", // 👈 VITE_SUPABASE_URL
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidHlheHJkZGJjbmtobG9obG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NjUwODYsImV4cCI6MjA3MDU0MTA4Nn0.jmi-2h7K-4Q3zGlqGSFwpGzp00MpWDZ1F9HLEKiHiS4", // 👈 VITE_SUPABASE_ANON_KEY
  },

  /**
   * Super Admin Credentials
   * This account bypasses database authentication and provides full access.
   * IMPORTANT: Use strong, unique credentials.
   */
  superAdmin: {
    email: import.meta.env.VITE_SUPER_ADMIN_EMAIL || "muarifamir@sman11mks.com", // 👈 Change this for the super admin login
    password: import.meta.env.VITE_SUPER_ADMIN_PASSWORD || "12345", // 👈 Change this for the super admin login
  },

  /**
   * Application Display Information
   * Used in page titles and headers.
   */
  app: {
    name: "R.E.A.C.T",
    title: "R.E.A.C.T",
    shortTitle: "REACT",
  },

  /**
   * Default Competition Settings
   * Used when initializing the competition for the first time or when clearing data.
   */
  competition: {
    defaultName: "My Swim Meet",
    defaultLanes: 8,
  },
};