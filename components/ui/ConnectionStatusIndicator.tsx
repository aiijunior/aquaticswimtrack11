import React from 'react';

type InternetStatus = 'online' | 'offline';
type DbStatus = 'checking' | 'connected' | 'error' | 'offline' | 'reconnecting';

interface ConnectionStatusIndicatorProps {
  internetStatus: InternetStatus;
  dbStatus: DbStatus;
}

const internetStatusConfig: Record<InternetStatus, { color: string, text: string }> = {
  online: { color: 'bg-green-500', text: 'Online' },
  offline: { color: 'bg-gray-400', text: 'Offline' },
};

const dbStatusConfig: Record<DbStatus, { color: string, text: string }> = {
  checking: { color: 'bg-yellow-400', text: 'Mengecek...' },
  connected: { color: 'bg-green-500', text: 'Terhubung' },
  error: { color: 'bg-red-500', text: 'Gagal' },
  offline: { color: 'bg-gray-400', text: 'Offline' },
  reconnecting: { color: 'bg-yellow-400', text: 'Menyambung...' },
};

const Dot: React.FC<{ color: string, pulse: boolean }> = ({ color, pulse }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`}></span>
);

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ internetStatus, dbStatus }) => {
  const internetConfig = internetStatusConfig[internetStatus];
  const dbConfig = dbStatusConfig[dbStatus];

  return (
    <div className="text-xs text-text-secondary px-3 py-2 bg-background rounded-md space-y-1" aria-live="polite" aria-atomic="true">
      <div className="flex items-center justify-between">
        <span className="font-medium">Internet</span>
        <div className="flex items-center space-x-2">
          <Dot color={internetConfig.color} pulse={false} />
          <span>{internetConfig.text}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-medium">Database</span>
        <div className="flex items-center space-x-2">
          <Dot color={dbConfig.color} pulse={dbStatus === 'checking' || dbStatus === 'reconnecting'} />
          <span>{dbConfig.text}</span>
        </div>
      </div>
    </div>
  );
};