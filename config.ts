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
    url: "https://kcvqgbucosorfxnwtlmt.supabase.co/rest/v1/", // 👈 VITE_SUPABASE_URL
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjdnFnYnVjb3NvcmZ4bnd0bG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzE3NTYsImV4cCI6MjA5NzI0Nzc1Nn0.KGf2MixhA6q_hoAvW_YUHScWWSdWZgMn_bhSSFafUQY", // 👈 VITE_SUPABASE_ANON_KEY
  },

  /**
   * Super Admin Credentials
   * This account bypasses database authentication and provides full access.
   * IMPORTANT: Use strong, unique credentials.
   */
  superAdmin: {
    email: "muarifamir@sman11mks.com", // 👈 Change this for the super admin login
    password: "12345", // 👈 Change this for the super admin login
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