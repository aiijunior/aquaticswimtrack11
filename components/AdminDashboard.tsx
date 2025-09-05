import React from 'react';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';

interface AdminDashboardProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
}

const UsersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 10a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const ClipboardListIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);


export const AdminDashboard: React.FC<AdminDashboardProps> = ({ swimmers, events, competitionInfo, isLoading }) => {
  
  const swimmerCount = swimmers.length;
  const eventCount = events.length;
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard Admin</h1>
      {isLoading ? (
        <div className="flex justify-center mt-8">
            <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center space-x-4">
                <UsersIcon />
                <div>
                  <p className="text-text-secondary">Total Perenang</p>
                  <p className="text-2xl font-bold">{swimmerCount}</p>
                </div>
              </div>
            </Card>
            <Card>
               <div className="flex items-center space-x-4">
                <ClipboardListIcon />
                <div>
                  <p className="text-text-secondary">Total Nomor Lomba</p>
                  <p className="text-2xl font-bold">{eventCount}</p>
                </div>
              </div>
            </Card>
          </div>
          <Card className="mt-6">
            <h2 className="text-xl font-bold mb-2">Selamat Datang di SwimComp Manager!</h2>
            <p className="text-text-secondary">
              Anda login sebagai admin. Gunakan menu di samping untuk mengelola detail acara, nomor lomba, dan peserta.
            </p>
            {competitionInfo && (
                <div className="mt-4 pt-4 border-t border-border">
                    {competitionInfo.eventName.split('\n').map((line, index) => (
                        <h3 key={index} className="font-bold text-lg">{line}</h3>
                    ))}
                    <p className="text-text-secondary">{competitionInfo.eventDate}</p>
                </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};