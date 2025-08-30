
import React from 'react';

type Status = 'checking' | 'connected' | 'offline' | 'error';

interface ConnectionStatusIndicatorProps {
  status: Status;
}

const statusConfig: Record<Status, { color: string, text: string, aria: string }> = {
  checking: { color: 'bg-yellow-400', text: 'Mengecek...', aria: 'Mengecek koneksi ke database' },
  connected: { color: 'bg-green-500', text: 'Terhubung', aria: 'Terhubung ke database' },
  offline: { color: 'bg-gray-400', text: 'Offline', aria: 'Tidak ada koneksi internet' },
  error: { color: 'bg-red-500', text: 'Gagal', aria: 'Gagal terhubung ke database' },
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span className={`inline-block w-3 h-3 rounded-full ${color} animate-pulse`}></span>
);

const StaticDot: React.FC<{ color: string }> = ({ color }) => (
    <span className={`inline-block w-3 h-3 rounded-full ${color}`}></span>
);


export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ status }) => {
  const config = statusConfig[status];

  return (
    <div className="flex items-center space-x-2 text-sm text-text-secondary px-3 py-2 bg-background rounded-md" aria-live="polite" aria-atomic="true">
      {status === 'checking' ? <Dot color={config.color} /> : <StaticDot color={config.color} />}
      <span aria-label={config.aria}>{config.text}</span>
    </div>
  );
};
