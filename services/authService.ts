

import { supabase } from './supabaseClient';
import type { User } from '../types';
import { config } from '../config';

const AUTH_KEY = 'swimcomp_auth_user';

export const login = async (email?: string, password?: string): Promise<User | null> => {
  if (!email || !password) {
      throw new Error("Email dan kata sandi wajib diisi.");
  }

  // Step 1: Check for Super Admin credentials from config file.
  if (email === config.superAdmin.email && password === config.superAdmin.password) {
    const superAdminUser: User = {
      id: 'super-admin-local', // Static ID for the local super admin
      role: 'SUPER_ADMIN',
      email: config.superAdmin.email,
      app_metadata: { provider: 'local' },
      user_metadata: { full_name: 'Super Admin' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(superAdminUser));
    return superAdminUser;
  }

  // Step 2: If not super admin, proceed with Supabase authentication for regular admins.
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (authError || !authData.user) {
    if (authError) {
      console.error("Supabase Auth sign-in failed:", authError.name, authError.message);

      // Check for the generic invalid credentials error first.
      // This is what Supabase returns for both wrong passwords and unconfirmed emails during sign-in
      // to avoid leaking information about which emails are registered.
      if (authError.message.includes("Invalid login credentials")) {
        throw new Error("Login Gagal: Kredensial tidak valid. PENYEBAB PALING UMUM: Jika ini akun Admin baru, Anda harus menonaktifkan 'Confirm email' di pengaturan Authentication Supabase Anda. Lihat petunjuk di README. Jika sudah, periksa kembali email dan kata sandi.");
      }
      
      // Check for a more specific email confirmation error, which might be returned in other scenarios.
      if (authError.message.includes("Email not confirmed")) {
        throw new Error("Email untuk akun ini belum dikonfirmasi. Silakan periksa kotak masuk email Anda.");
      }
      
      // For any other specific auth errors, throw the original message.
      throw new Error(authError.message);

    } else {
      // This case handles when Supabase returns no user and no error, which is unexpected.
      console.error("Supabase Auth sign-in failed: No user data returned without an explicit error.");
      throw new Error("Login gagal karena respons tak terduga dari server otentikasi.");
    }
  }
  
  const authUser = authData.user;

  // Step 3: Now that the user is authenticated, fetch their role from our public.users table.
  const { data: profileData, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (profileError || !profileData) {
    console.error("Failed to fetch user profile/role after login:", profileError?.message);
    // This is a critical error. The user exists in Auth but not in our profiles table.
    // It's crucial to log them out to prevent a broken state.
    await supabase.auth.signOut();
    throw new Error("Profil pengguna tidak ditemukan. Hubungi administrator.");
  }
  
  // Step 4: Combine the auth user and profile data into our app's User type.
  const finalUser: User = {
    ...authUser,
    role: (profileData as { role: 'SUPER_ADMIN' | 'ADMIN' }).role,
  };

  sessionStorage.setItem(AUTH_KEY, JSON.stringify(finalUser));
  return finalUser;
};

export const logout = async (): Promise<void> => {
  sessionStorage.removeItem(AUTH_KEY);
  await supabase.auth.signOut();
};

export const getCurrentUser = (): User | null => {
  const data = sessionStorage.getItem(AUTH_KEY);
  try {
    const user = data ? JSON.parse(data) : null;
    return user;
  } catch (error) {
    console.error("Failed to parse user from session storage", error);
    return null;
  }
};

export const isLoggedIn = (): boolean => {
  return getCurrentUser() !== null;
};
