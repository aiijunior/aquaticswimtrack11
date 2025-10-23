

import React, { useState } from 'react';
import type { CompetitionInfo } from '../types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { login } from '../services/authService';
import { Spinner } from './ui/Spinner';

interface LoginViewProps {
  onLoginSuccess: () => void;
  onShowPublicResults: () => void;
  onShowRegistration: () => void;
  competitionInfo: CompetitionInfo | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onShowPublicResults, onShowRegistration, competitionInfo }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminLoginVisible, setIsAdminLoginVisible] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch(err: any) {
        // Check for generic network errors that might indicate a CORS or connection issue.
        if (err.message && (err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('network request failed'))) {
            setError('Gagal terhubung ke server otentikasi. Pastikan Anda online dan URL Supabase di `config.ts` sudah benar. Jika sudah di-deploy, periksa konfigurasi URL di Supabase (lihat README).');
        } else {
            setError(err.message || 'Terjadi kesalahan saat login.');
        }
    } finally {
        setIsLoading(false);
    }
  };
  
  const isRegistrationOpen = competitionInfo?.isRegistrationOpen ?? false;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Decorative Blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob dark:mix-blend-overlay"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-sky-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000 dark:mix-blend-overlay"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000 dark:mix-blend-overlay"></div>

      {/* Admin Login Button */}
      <div className="absolute top-4 right-4 z-30">
        <Button variant="secondary" onClick={() => setIsAdminLoginVisible(!isAdminLoginVisible)} className="shadow-lg">
          Login Admin
        </Button>
      </div>

      {/* Admin Login Panel */}
      {isAdminLoginVisible && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-30 z-40"
          onClick={() => setIsAdminLoginVisible(false)}
        >
          <div 
            className="absolute top-16 right-4" 
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-text-primary">Login Admin</h3>
                  <button onClick={() => setIsAdminLoginVisible(false)} className="text-text-secondary hover:text-text-primary">&times;</button>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <Input
                    label="Nama Pengguna (Email)"
                    id="username"
                    type="email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <Input
                    label="Sandi"
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                  <div className="pt-2">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Spinner /> : 'Login'}
                    </Button>
                  </div>
                </form>
            </Card>
          </div>
        </div>
      )}

      {/* Main Centered Content */}
      <div className="flex flex-col items-center text-center z-10">
        <div className="flex items-center justify-center space-x-4 mb-8">
            <svg viewBox="0 0 100 100" className="h-24 w-24 text-primary" fill="none" xmlns="http://www.w3.org/2000/svg" style={{color: '#0284c7'}}>
                <path d="M85 50c0 19.33-15.67 35-35 35S15 69.33 15 50 30.67 15 50 15c8.39 0 16.12 2.79 22.21 7.5" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M38 50c5.52-8.28 19.48-8.28 25 0" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M45.37 15.21c6.53 5.44 15.62 5.44 22.15 0" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-left">
                <h1 className="text-5xl lg:text-6xl font-bold text-primary" style={{fontStyle: 'italic', color: '#0284c7'}}>R.E.A.C.T 11 - SWIM</h1>
                <p className="text-md text-text-secondary mt-1 max-w-[250px] font-semibold" style={{color: '#0284c7'}}>Real-time Evaluation for Aquatic Competition & Timing</p>
            </div>
        </div>

        <div className="mt-12 w-full max-w-md space-y-6">
            <Button variant="secondary" onClick={onShowPublicResults} className="w-full py-4 text-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                Lihat Hasil Langsung
            </Button>
            <div className="text-center">
                <Button 
                    variant="primary" 
                    onClick={onShowRegistration} 
                    className="w-full py-4 text-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                    disabled={!isRegistrationOpen}
                    title={!isRegistrationOpen ? "Pendaftaran online saat ini ditutup" : "Buka formulir pendaftaran"}
                >
                    Daftar Lomba Online
                </Button>
                {!isRegistrationOpen && <p className="text-xs text-yellow-500 mt-1">Pendaftaran online ditutup</p>}
            </div>
        </div>
      </div>
    </div>
  );
};