
import React, { useState, useEffect, useMemo } from 'react';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { formatEventName, romanize } from '../constants';
import { getPublicData } from '../services/databaseService';

interface CheckinViewProps {
    swimmerId: string;
    onBackToLogin: () => void;
}

export const CheckinView: React.FC<CheckinViewProps> = ({ swimmerId, onBackToLogin }) => {
    const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
    const [events, setEvents] = useState<SwimEvent[]>([]);
    const [competitionInfo, setCompetitionInfo] = useState<CompetitionInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [checkedEvents, setCheckedEvents] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const data = await getPublicData();
                const foundSwimmer = data.swimmers.find((s: Swimmer) => s.id === swimmerId);
                if (foundSwimmer) {
                    setSwimmer(foundSwimmer);
                    const swimmerEvents = data.events.filter((e: SwimEvent) => 
                        e.entries.some(en => en.swimmerId === swimmerId)
                    );
                    setEvents(swimmerEvents);
                    setCompetitionInfo(data.competitionInfo);
                }
            } catch (err) {
                console.error("Gagal memuat data check-in:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [swimmerId]);

    const toggleEvent = (eventId: string) => {
        const next = new Set(checkedEvents);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        setCheckedEvents(next);
    };

    if (isLoading) return <div className="min-h-screen flex justify-center items-center"><Spinner /></div>;
    if (!swimmer) return (
        <div className="min-h-screen flex flex-col justify-center items-center p-6 text-center">
            <h2 className="text-2xl font-bold text-red-500 mb-4">Data Atlet Tidak Ditemukan</h2>
            <Button onClick={onBackToLogin}>Kembali ke Beranda</Button>
        </div>
    );

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <Card className="text-center shadow-xl border-t-4 border-t-primary">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="h-16 mx-auto mb-4 object-contain" />}
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">PROFIL ATLET (CHECK-IN)</p>
                    <h1 className="text-3xl font-black uppercase text-text-primary mb-2 tracking-tight">{swimmer.name}</h1>
                    <p className="text-lg font-bold text-primary uppercase mb-4">{swimmer.club}</p>
                    
                    <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Kelamin</p>
                            <p className="font-bold text-sm">{swimmer.gender === 'Male' ? 'PUTRA' : 'PUTRI'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Tahun</p>
                            <p className="font-bold text-sm">{swimmer.birthYear}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">KU</p>
                            <p className="font-bold text-sm">{swimmer.ageGroup || '-'}</p>
                        </div>
                    </div>
                </Card>

                <Card className="shadow-lg">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2 uppercase italic tracking-tighter">
                        <span className="bg-primary text-white p-1 rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </span>
                        Daftar Nomor Lomba
                    </h2>

                    <div className="space-y-3">
                        {events.map((event) => {
                            const isChecked = checkedEvents.has(event.id);
                            return (
                                <div 
                                    key={event.id} 
                                    onClick={() => toggleEvent(event.id)}
                                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                        isChecked 
                                        ? 'bg-green-50 border-green-500 shadow-inner' 
                                        : 'bg-surface border-border hover:border-primary/40'
                                    }`}
                                >
                                    <div className="flex-1">
                                        <p className={`font-black text-sm uppercase tracking-tight ${isChecked ? 'text-green-700' : 'text-text-primary'}`}>
                                            {formatEventName(event)}
                                        </p>
                                        <p className="text-[10px] font-bold text-text-secondary opacity-60 uppercase mt-1">
                                            Sesi {romanize(event.sessionNumber || 0)}
                                        </p>
                                    </div>
                                    
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                                        isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200'
                                    }`}>
                                        {isChecked && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                    </div>
                                </div>
                            );
                        })}
                        {events.length === 0 && <p className="text-center py-10 text-gray-400 italic">Belum terdaftar di nomor lomba manapun.</p>}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col gap-3">
                        <Button onClick={() => window.print()} variant="secondary" className="w-full">CETAK BUKTI CEK-IN</Button>
                        <Button onClick={onBackToLogin} className="w-full">KEMBALI KE BERANDA</Button>
                    </div>
                </Card>

                <footer className="text-center opacity-40 text-[9px] font-black uppercase tracking-widest pb-10">
                    REAL-TIME CHECK-IN SYSTEM BY R.E.A.C.T
                </footer>
            </div>
        </div>
    );
};
