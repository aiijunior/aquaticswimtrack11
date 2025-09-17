

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
  const isPublicResultsVisible = competitionInfo?.isPublicResultsVisible ?? false;

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
        <div className="flex flex-col items-center mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-28 w-28 lg:h-36 lg:w-36 text-blue-800 dark:text-blue-500" viewBox="0 0 80 60" fill="none">
              <path d="M40.1,10.6c-4.6-1.1-8.5-3.6-10.9-7.1c-0.6-0.8-1.7-1-2.5-0.4c-0.8,0.6-1,1.7-0.4,2.5c2.8,4.1,7.3,7,12.5,8.2c1,0.2,2-0.5,2.2-1.5C41.2,11.3,40.9,10.7,40.1,10.6z" fill="currentColor"/>
              <path d="M42.4,21.7c-2.3,0-4.5,0.7-6.4,1.9c-1.4,0.9-3.2,0.5-4.1-0.9c-0.9-1.4-0.5-3.2,0.9-4.1c2.8-1.8,6.1-2.8,9.5-2.8c1.6,0,3,1.3,3,3S44,21.7,42.4,21.7z" fill="currentColor"/>
              <path d="M66,35.7C59.5,32,50.7,30,41,30c-2.8,0-5.6,0.3-8.3,0.9c-1.5,0.3-2.9-0.7-3.2-2.2c-0.3-1.5,0.7-2.9,2.2-3.2c3.1-0.6,6.3-1,9.3-1c10.3,0,19.7,2.1,26.7,6.2c1.3,0.8,1.8,2.4,1,3.7C69.1,38.7,67.3,38.8,66,35.7z" fill="#0ea5e9"/>
              <path d="M78.9,47.7c-8.1-4.7-19.1-7.5-30.8-7.5c-4.9,0-9.7,0.8-14.2,2.3c-1.5,0.5-3.1-0.2-3.6-1.7c-0.5-1.5,0.2-3.1,1.7-3.6c5-1.7,10.3-2.5,15.6-2.5c12.3,0,24,2.9,32.7,8.1c1.3,0.8,1.7,2.4,0.9,3.7C80.4,48.2,79.7,48.5,78.9,47.7z" fill="#0ea5e9"/>
              <path d="M78.9,56.7C64.9,47,46.9,42.5,28.5,42.5c-4.9,0-9.8,0.5-14.5,1.5c-1.6,0.3-3.1-0.7-3.4-2.2c-0.3-1.6,0.7-3.1,2.2-3.4c5.2-1,10.4-1.5,15.7-1.5c19,0,37.6,4.7,52.2,14.8c1.2,0.8,1.6,2.5,0.7,3.6C81.1,56.5,80.1,57.1,78.9,56.7z" fill="#0ea5e9"/>
            </svg>
            <div className="mt-4 text-center">
                <h1 className="text-4xl lg:text-5xl font-bold uppercase tracking-wide text-primary">Aquatic</h1>
                <h2 className="text-3xl lg:text-4xl font-semibold uppercase text-primary opacity-80">Swimtrack 11</h2>
            </div>
            <div className="w-2/3 h-0.5 bg-red-500 mt-4"></div>
        </div>

        <div className="mt-12 w-full max-w-md space-y-6">
            {isPublicResultsVisible && (
                <Button variant="secondary" onClick={onShowPublicResults} className="w-full py-4 text-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                    Lihat Hasil Langsung
                </Button>
            )}
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