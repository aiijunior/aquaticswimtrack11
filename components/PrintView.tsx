
import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { RecordType, Gender, SwimStyle } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender, translateSwimStyle, romanize } from '../constants';
import { getRecords } from '../services/databaseService';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any;

// --- PROPS ---
interface PrintViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
}

// --- TYPES ---
type ReportType = 'schedule' | 'program' | 'results' | 'clubMedals' | 'clubSwimmerMedals' | 'swimmerTotal' | 'swimmerCategory' | 'brokenRecords' | 'onlineRegistration' | 'participantCards';

interface ScheduledEvent extends SwimEvent {
    globalEventNumber: number;
}

interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}

interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
    detailedResults?: any[];
}

// --- TALLY INTERFACES ---
interface TallyClubIndividual {
    name: string;
    medals: { rank: number; eventName: string; time: number }[];
}

interface TallyClub {
    name: string;
    gold: number;
    silver: number;
    bronze: number;
    individualDetails: Record<string, TallyClubIndividual>;
}

interface TallyIndividual {
    swimmer: Swimmer;
    gold: number;
    silver: number;
    bronze: number;
}

// --- HELPER FUNCTIONS ---
const formatTime = (ms: number) => {
    // FIX: Tangani NaN, null, undefined, atau 0 sebagai "No Time" (99:99.99)
    if (isNaN(ms) || ms === null || ms === undefined || ms === 0) return '99:99.99';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const estimateHeatDuration = (distance: number): number => {
    // Basic estimation: 50m = 2 min, 100m = 3 min, others = 5 min
    if (distance <= 50) return 2 * 60 * 1000;
    if (distance <= 100) return 3 * 60 * 1000;
    return 5 * 60 * 1000;
};

const formatEST = (timestamp: number | undefined) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const MedalIcon = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span className="text-lg">🥇</span>;
    if (rank === 2) return <span className="text-lg">🥈</span>;
    if (rank === 3) return <span className="text-lg">🥉</span>;
    return null;
};

// --- PRINTABLE COMPONENTS ---

// FIX: Added explicit cast to info.eventName as string and ensured split result is handled safely to fix 'Property map does not exist on type unknown' error
const ReportHeader = ({ info, title }: { info: CompetitionInfo, title: string }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-16 object-contain mx-auto mb-2" />}
        <div className="mb-2">
            {/* FIX: Explicitly handle split result as string[] or any to ensure map is available */}
            {((info.eventName || "").split('\n') as string[]).map((line: string, index: number) => (
                <p key={index} className={`font-bold uppercase tracking-tight leading-tight ${index === 0 ? 'text-xl' : 'text-xs'}`}>{line}</p>
            ))}
            <p className="text-sm text-gray-600 mt-1 uppercase font-semibold">
                {info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
        </div>
        <h2 className="text-lg font-bold border-y-2 border-black py-1 my-2 text-center bg-gray-50 tracking-widest">{title}</h2>
    </header>
);

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) return <p className="uppercase text-[8px] font-sans text-gray-400 font-bold">{typeText} : -</p>;
    const parts = [formatTime(record.time), record.holderName, record.yearSet, record.locationSet].filter(p => p != null && String(p).trim() !== '');
    return <p className="uppercase text-[8px] font-sans font-bold">{typeText} : {parts.join(' | ')}</p>;
};

// 1. Susunan Acara
const ScheduleReport: React.FC<{ events: ScheduledEvent[] }> = ({ events }) => {
    const grouped = events.reduce((acc: Record<string, ScheduledEvent[]>, e) => {
        const session = `SESI ${romanize(e.sessionNumber || 0)}`;
        if (!acc[session]) acc[session] = [];
        acc[session].push(e);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([session, sessionEvents]) => (
                <div key={session} className="page-break-inside-avoid">
                    <h3 className="font-bold text-md border-b-2 border-black mb-2 uppercase">{session}</h3>
                    <table className="w-full text-[11px] border-collapse">
                        <thead><tr className="border-b bg-gray-100"><th className="text-left py-1 px-2 w-12">NO</th><th className="text-left px-2">NOMOR LOMBA</th><th className="text-center w-24 px-2">PESERTA</th></tr></thead>
                        <tbody>
                            {sessionEvents.map(e => (
                                <tr key={e.id} className="border-b border-gray-200">
                                    <td className="py-1 px-2 font-bold">{e.globalEventNumber}</td>
                                    <td className="px-2 font-medium">{formatEventName(e)}</td>
                                    <td className="text-center px-2">{e.entries.length}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

// 2 & 3. Buku Acara & Buku Hasil (Unified UI Style)
// FIX: Added explicit cast to any[] for events to fix 'Property map does not exist on type unknown' error if necessary
const EventBaseReport = ({ events, info, records, showResults }: { events: TimedEvent[], info: CompetitionInfo, records: SwimRecord[], showResults?: boolean }) => (
    <div className="space-y-8">
        {(events as any[]).map(event => {
            const porprov = records.find(r => r.type === RecordType.PORPROV && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            const nasional = records.find(r => r.type === RecordType.NASIONAL && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            
            return (
                <div key={event.id} className="page-break-inside-avoid border-b-2 border-gray-400 pb-4">
                    <div className="bg-black text-white p-1 px-2 font-bold text-xs flex justify-between uppercase">
                        <span>#{event.globalEventNumber} - {formatEventName(event)}</span>
                        {event.estimatedEventStartTime && !showResults && <span>EST: {formatEST(event.estimatedEventStartTime)}</span>}
                    </div>
                    <div className="my-1 px-2 border-l-2 border-black bg-gray-50 py-1">
                        <PrintRecordRow record={porprov} type="PORPROV" />
                        <PrintRecordRow record={nasional} type="NASIONAL" />
                    </div>

                    {!showResults ? (
                        (event.heatsWithTimes || []).map((heat: any) => (
                            <div key={heat.heatNumber} className="mt-2">
                                <p className="text-center font-bold text-[9px] uppercase bg-gray-200 py-0.5">
                                    Seri {heat.heatNumber} dari {event.heatsWithTimes?.length} 
                                    {heat.estimatedHeatStartTime && <span className="ml-2">— EST: {formatEST(heat.estimatedHeatStartTime)}</span>}
                                </p>
                                <table className="w-full text-[10px] mt-0.5 border-collapse table-fixed">
                                    <thead><tr className="border-y border-black font-bold">
                                        <th className="w-8 text-center">LIN</th>
                                        <th className="text-left px-2">NAMA ATLET</th>
                                        <th className="w-12 text-center">THN</th>
                                        <th className="text-left px-2">TIM</th>
                                        <th className="w-20 text-right px-2">SEED</th>
                                    </tr></thead>
                                    <tbody>
                                        {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                            const ass = heat.assignments.find((a: any) => a.lane === lane);
                                            return (
                                                <tr key={lane} className="border-b border-gray-100 h-6">
                                                    <td className="text-center font-bold border-r border-gray-100">{lane}</td>
                                                    <td className="px-2 truncate font-medium uppercase">{ass ? ass.entry.swimmer.name : '-'}</td>
                                                    <td className="text-center">{ass ? ass.entry.swimmer.birthYear : '-'}</td>
                                                    <td className="px-2 truncate text-[9px] uppercase">{ass ? ass.entry.swimmer.club : '-'}</td>
                                                    <td className="text-right font-mono px-2">{ass ? formatTime(ass.entry.seedTime) : '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    ) : (
                        <div className="mt-2">
                            <table className="w-full text-[10px] border-collapse table-fixed">
                                <thead><tr className="border-y border-black font-bold bg-gray-100">
                                    <th className="w-12 text-center">RANK</th>
                                    <th className="text-left px-2">NAMA ATLET</th>
                                    <th className="w-12 text-center">THN</th>
                                    <th className="text-left px-2">TIM</th>
                                    <th className="w-24 text-right px-2">HASIL</th>
                                    <th className="w-12 text-center">MEDALI</th>
                                </tr></thead>
                                <tbody>
                                    {event.detailedResults?.map((r: any) => (
                                        <tr key={r.swimmerId} className="border-b border-gray-200 h-7">
                                            <td className="text-center font-bold">{r.rank || '-'}</td>
                                            <td className="px-2 uppercase font-medium">{r.swimmer?.name}</td>
                                            <td className="text-center">{r.swimmer?.birthYear}</td>
                                            <td className="px-2 uppercase text-[9px]">{r.swimmer?.club}</td>
                                            <td className="text-right font-mono px-2">{formatTime(r.time)}</td>
                                            <td className="text-center scale-125"><MedalIcon rank={r.rank} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);

// 4. Rekap Medali Klub
const ClubMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <table className="w-full text-[12px] border-collapse">
        <thead><tr className="bg-black text-white border-2 border-black">
            <th className="p-2 w-12 text-center">#</th><th className="text-left px-2">NAMA TIM / KLUB</th><th className="w-16 text-center">🥇</th><th className="w-16 text-center">🥈</th><th className="w-16 text-center">🥉</th><th className="w-16 text-center font-bold">TOTAL</th>
        </tr></thead>
        <tbody>
            {data.map((item, i) => (
                <tr key={i} className="border-b-2 border-gray-300">
                    <td className="text-center font-bold py-2">{i + 1}</td>
                    <td className="font-bold uppercase px-2">{item.name}</td>
                    <td className="text-center">{item.gold}</td>
                    <td className="text-center">{item.silver}</td>
                    <td className="text-center">{item.bronze}</td>
                    <td className="text-center font-bold bg-gray-50">{item.gold + item.silver + item.bronze}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

// 5. Rekap Medali Klub & Atlet (Custom Format)
const ClubSwimmerMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <div className="space-y-8">
        {data.map((club, idx) => (
            <div key={idx} className="page-break-inside-avoid border-2 border-black rounded overflow-hidden shadow-sm">
                <div className="bg-black text-white p-2 flex justify-between items-center font-bold">
                    <span className="text-lg uppercase tracking-tight">{club.name}</span>
                    <span className="text-lg">🥇{club.gold} 🥈{club.silver} 🥉{club.bronze}</span>
                </div>
                <table className="w-full text-[11px]">
                    <thead><tr className="bg-gray-200 border-b border-black">
                        <th className="text-left p-2 w-1/3">NAMA ATLET</th><th className="text-left p-2">NOMOR LOMBA YANG DIMENANGKAN</th>
                    </tr></thead>
                    <tbody>
                        {club.individualDetails.map((swimmer: any, sIdx: number) => (
                            <tr key={sIdx} className="border-b border-gray-200 align-top">
                                <td className="p-2 font-bold uppercase">{swimmer.name}</td>
                                <td className="p-2 py-3 space-y-1">
                                    {swimmer.medals.map((m: any, mIdx: number) => (
                                        <div key={mIdx} className="flex gap-2 items-center">
                                            <MedalIcon rank={m.rank} />
                                            <span className="font-medium uppercase">{m.eventName} - {formatTime(m.time)}</span>
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
    </div>
);

// 6 & 7. Rekap Atlet (Gender Split)
const AthleteRecapReport: React.FC<{ data: any[], title?: string }> = ({ data, title }) => {
    const male = data.filter(i => i.swimmer?.gender === 'Male');
    const female = data.filter(i => i.swimmer?.gender === 'Female');
    
    const RenderTable = ({ list, label }: { list: any[], label: string }) => (
        <div className="mt-6 page-break-inside-avoid">
            <h4 className="bg-gray-800 text-white p-2 px-3 font-bold text-xs uppercase mb-1 tracking-widest">{label}</h4>
            <table className="w-full text-[11px] border-collapse table-fixed">
                <thead>
                    <tr className="border-y-2 border-black bg-gray-100 font-bold">
                        <th className="w-12 text-center py-2">#</th>
                        <th className="text-left px-2">NAMA ATLET</th>
                        <th className="text-left px-2">TIM / KLUB</th>
                        <th className="w-10 text-center">🥇</th>
                        <th className="w-10 text-center">🥈</th>
                        <th className="w-10 text-center">🥉</th>
                        <th className="w-14 text-center font-black">TOT</th>
                    </tr>
                </thead>
                <tbody>
                    {list.map((item, i) => (
                        <tr key={i} className="border-b border-gray-300">
                            <td className="text-center py-2 font-bold bg-gray-50">{i + 1}</td>
                            <td className="px-2 font-bold uppercase truncate">{item.swimmer?.name}</td>
                            <td className="px-2 uppercase text-[9px] truncate">{item.swimmer?.club}</td>
                            <td className="text-center font-bold text-lg">{item.gold}</td>
                            <td className="text-center font-bold text-lg">{item.silver}</td>
                            <td className="text-center font-bold text-lg">{item.bronze}</td>
                            <td className="text-center font-black text-lg bg-gray-100">{item.gold + item.silver + item.bronze}</td>
                        </tr>
                    ))}
                    {list.length === 0 && (
                        <tr>
                            <td colSpan={7} className="text-center py-6 text-gray-400 italic">BELUM ADA DATA PEMENANG MEDALI</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-4">
            {title && <h3 className="text-center font-black text-xl mb-4 uppercase underline tracking-tighter">{title}</h3>}
            <RenderTable list={male} label="KATEGORI PUTRA (MEN'S)" />
            <RenderTable list={female} label="KATEGORI PUTRI (WOMEN'S)" />
        </div>
    );
};

// 8. Laporan Pendaftaran Online
const OnlineRegistrationReport: React.FC<{ data: any[] }> = ({ data }) => (
    <table className="w-full text-[10px] border-collapse table-fixed">
        <thead>
            <tr className="bg-black text-white border-y-2 border-black font-bold">
                <th className="w-8 text-center py-2">#</th>
                <th className="w-1/4 text-left px-2">NAMA ATLET / TIM</th>
                <th className="w-24 text-center">BUKTI BAYAR</th>
                <th className="w-28 text-right px-2">NOMINAL</th>
                <th className="text-left px-2">DAFTAR NOMOR LOMBA & SEED TIME</th>
            </tr>
        </thead>
        <tbody>
            {data.map((item, i) => (
                <tr key={i} className="border-b border-gray-300 align-top">
                    <td className="text-center py-2 font-bold bg-gray-50">{i + 1}</td>
                    <td className="px-2 py-2">
                        <p className="font-bold uppercase text-[11px]">{item.swimmer.name}</p>
                        <p className="text-[9px] text-gray-600 font-medium uppercase">{item.swimmer.club}</p>
                        <p className="text-[8px] text-primary mt-1 font-mono">{item.swimmer.picPhone || '-'}</p>
                    </td>
                    <td className="p-1 text-center">
                        {item.swimmer.paymentProof ? (
                            <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                                <img 
                                    src={item.swimmer.paymentProof} 
                                    alt="Proof" 
                                    className="h-16 w-full object-contain mx-auto" 
                                />
                            </div>
                        ) : (
                            <span className="text-[8px] text-gray-400 italic">BELUM UNGGAH</span>
                        )}
                    </td>
                    <td className="px-2 py-2 text-right font-black text-xs">
                        {item.swimmer.paymentAmount ? `Rp ${item.swimmer.paymentAmount.toLocaleString('id-ID')}` : 'Rp 0'}
                    </td>
                    <td className="px-2 py-2">
                        <div className="space-y-1">
                            {item.registeredEvents.map((ev: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center border-b border-gray-100 last:border-0 pb-0.5">
                                    <span className="uppercase text-[8px] leading-tight font-medium max-w-[70%]">{ev.name}</span>
                                    <span className="font-mono text-[9px] font-black bg-gray-100 px-1 rounded">{ev.time}</span>
                                </div>
                            ))}
                            {item.registeredEvents.length === 0 && <span className="text-gray-400 italic text-[8px]">TIDAK ADA NOMOR LOMBA</span>}
                        </div>
                    </td>
                </tr>
            ))}
            {data.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 italic">BELUM ADA DATA PENDAFTARAN ONLINE</td></tr>
            )}
        </tbody>
    </table>
);

// 9. Kartu Peserta (ID Cards)
const ParticipantCardsReport: React.FC<{ data: any[], info: CompetitionInfo }> = ({ data, info }) => {
    return (
        <div className="grid grid-cols-2 gap-4">
            {data.map((item, idx) => {
                const swimmer = item.swimmer;
                const checkinUrl = `${window.location.origin}${window.location.pathname}?view=checkin&id=${swimmer.id}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(checkinUrl)}`;
                
                return (
                    <div key={swimmer.id} className="page-break-inside-avoid border-2 border-black p-4 rounded-xl flex flex-col items-center bg-white shadow-sm relative overflow-hidden h-[300px]">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary opacity-10 rounded-bl-[100px]" />
                        
                        {/* Header */}
                        <div className="w-full flex items-center justify-between border-b border-gray-300 pb-2 mb-3">
                            <div className="flex items-center gap-2">
                                {info.eventLogo && <img src={info.eventLogo} alt="Logo" className="h-8 object-contain" />}
                                <span className="text-[10px] font-black uppercase tracking-tighter max-w-[120px] leading-none">{info.eventName.split('\n')[0]}</span>
                            </div>
                            <span className="text-[9px] font-bold text-gray-500 uppercase">{info.eventDate ? new Date(info.eventDate).getFullYear() : ''}</span>
                        </div>

                        {/* Body */}
                        <div className="flex flex-1 w-full gap-4">
                            <div className="flex-1">
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nama Peserta</p>
                                <p className="text-sm font-black uppercase text-text-primary mb-3 leading-tight">{swimmer.name}</p>
                                
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Klub / Tim</p>
                                <p className="text-xs font-bold uppercase text-primary mb-3 truncate">{swimmer.club}</p>
                                
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div>
                                        <p className="text-[7px] font-bold text-gray-400 uppercase">Tahun</p>
                                        <p className="text-[10px] font-black">{swimmer.birthYear || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[7px] font-bold text-gray-400 uppercase">KU</p>
                                        <p className="text-[10px] font-black">{swimmer.ageGroup || '-'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* QR Code Section */}
                            <div className="w-24 flex flex-col items-center justify-center bg-gray-50 rounded-lg p-2 border border-gray-200">
                                <img src={qrUrl} alt="QR Check-in" className="w-full h-auto" />
                                <p className="text-[6px] font-black mt-1 text-center text-gray-400 uppercase tracking-tighter">SCAN UNTUK CEK-IN</p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="w-full mt-2 pt-2 border-t border-dashed border-gray-300 flex justify-between items-center text-[7px] font-bold text-gray-400 uppercase">
                            <span>KARTU PESERTA RESMI</span>
                            <span>ID: {swimmer.id.slice(0, 8)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// --- MAIN COMPONENT ---
export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<ReportType>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [sessionFilter, setSessionFilter] = useState<number>(0); // 0 for All
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const { addNotification } = useNotification();

    useEffect(() => { getRecords().then(setRecords); }, []);

    // Session helper
    const availableSessions = useMemo(() => {
        const set = new Set(events.map(e => e.sessionNumber || 0).filter(s => s > 0));
        return Array.from(set).sort((a, b) => a - b);
    }, [events]);

    // 1. Filtered Base Events
    const baseEvents = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .filter(e => sessionFilter === 0 || e.sessionNumber === sessionFilter)
            .sort((a, b) => (Number(a.sessionNumber) || 0) - (Number(b.sessionNumber) || 0) || (Number(a.heatOrder) || 0) - (Number(b.heatOrder) || 0))
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events, sessionFilter]);

    // Selection helper
    const handleToggleAllEvents = (select: boolean) => {
        if (select) setSelectedEventIds(new Set(baseEvents.map(e => e.id)));
        else setSelectedEventIds(new Set());
    };

    const handleToggleEventId = (id: string) => {
        const next = new Set(selectedEventIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedEventIds(next);
    };

    // Final Events to Render (Filtered by ID if type is program/results)
    const renderEvents = useMemo(() => {
        const isSelectionActive = selectedEventIds.size > 0 && ['program', 'results'].includes(reportType);
        return baseEvents.filter(e => !isSelectionActive || selectedEventIds.has(e.id));
    }, [baseEvents, selectedEventIds, reportType]);

    // 2. Data Processing for Reports
    const processedData = useMemo(() => {
        // FIX: Explicitly type swimmersMap as Map<string, Swimmer> to fix 'unknown' property access errors
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        
        // Track running time per session cursor to calculate cumulative EST
        const sessionCursors = new Map<number, number>();

        // Detailed Events (Program & Results)
        const detailedEvents = renderEvents.map(event => {
            const entries: Entry[] = event.entries.map(en => ({ ...en, swimmer: swimmersMap.get(en.swimmerId)! })).filter(e => e.swimmer);
            const heats = generateHeats(entries, competitionInfo?.numberOfLanes || 8);
            
            // Results calculation
            const validRes = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const detailedRes = [...event.results].sort((a, b) => {
                if (a.time > 0 && b.time > 0) return a.time - b.time;
                if (a.time > 0) return -1; if (b.time > 0) return 1;
                return b.time - a.time;
            }).map(r => ({
                ...r,
                swimmer: swimmersMap.get(r.swimmerId),
                rank: r.time > 0 ? validRes.findIndex(v => v.swimmerId === r.swimmerId) + 1 : 0
            }));

            // EST CALCULATION
            const sessionNum = event.sessionNumber || 0;
            let currentCursor = sessionCursors.get(sessionNum);
            
            // Initial session start time from the first event in that session
            if (currentCursor === undefined && event.sessionDateTime) {
                currentCursor = new Date(event.sessionDateTime).getTime();
            }

            const eventStartTime = currentCursor;

            const heatsWithTimes = heats.map(h => {
                const th = { ...h, estimatedHeatStartTime: currentCursor || undefined };
                // FIX: Used explicit type narrowing and variable for arithmetic with any casting to fix arithmetic type errors
                if (typeof currentCursor === 'number') {
                    const start: any = currentCursor;
                    const duration: any = estimateHeatDuration(event.distance);
                    currentCursor = (start as number) + (duration as number);
                }
                return th;
            });

            // Update session cursor for next event in this session
            if (currentCursor !== undefined) {
                sessionCursors.set(sessionNum, currentCursor);
            }

            return { 
                ...event, 
                detailedEntries: entries, 
                heatsWithTimes, 
                detailedResults: detailedRes,
                estimatedEventStartTime: eventStartTime 
            };
        });

        // Tallying
        const clubs: Record<string, TallyClub> = {};
        const individual: Record<string, TallyIndividual> = {};
        const broken: BrokenRecord[] = [];

        // We tally based on ALL base events (ignoring print selection for overall standings)
        baseEvents.forEach(rawEvent => {
            const valid = [...rawEvent.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const winner = valid[0];
            
            if (winner) {
                const ws = swimmersMap.get(winner.swimmerId);
                if (ws) {
                    [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                        const rec = records.find(r => r.type === type && r.gender === rawEvent.gender && r.distance === rawEvent.distance && r.style === rawEvent.style && (r.category ?? null) === (rawEvent.category ?? null));
                        // FIX: Cast to Number to ensure valid arithmetic comparison
                        if (rec && Number(winner.time) < Number(rec.time)) { 
                            broken.push({ record: rec, newEventName: formatEventName(rawEvent), newHolder: ws, newTime: winner.time });
                        }
                    });
                }
            }

            valid.forEach((r, idx) => {
                const rank = idx + 1;
                if (rank > 3) return;
                const s = swimmersMap.get(r.swimmerId);
                if (!s) return;

                if (!clubs[s.club]) {
                    clubs[s.club] = { name: s.club, gold: 0, silver: 0, bronze: 0, individualDetails: {} };
                }
                if (!individual[s.id]) {
                    individual[s.id] = { swimmer: s, gold: 0, silver: 0, bronze: 0 };
                }
                
                const mKey = (rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze') as 'gold' | 'silver' | 'bronze';
                clubs[s.club][mKey]++;
                individual[s.id][mKey]++;

                // Collect data for Club & Swimmer report
                if (!clubs[s.club].individualDetails[s.id]) {
                    clubs[s.club].individualDetails[s.id] = { name: s.name, medals: [] };
                }
                clubs[s.club].individualDetails[s.id].medals.push({ rank, eventName: formatEventName(rawEvent), time: r.time });
            });
        });

        // Online Registration Data Mapping
        const registrationData = swimmers
            .filter(s => s.birthYear !== 0) // Exclude generic relay entities if any
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(swimmer => {
                const registeredEvents = events
                    .filter(e => e.entries.some(en => en.swimmerId === swimmer.id))
                    .map(e => {
                        const entry = e.entries.find(en => en.swimmerId === swimmer.id);
                        return {
                            name: formatEventName(e),
                            time: entry ? formatTime(entry.seedTime) : '99:99.99'
                        };
                    });
                return { swimmer, registeredEvents };
            });

        // FIX: Cast medal counts to Number for safe arithmetic sorting
        const sortFn = (a: TallyClub | TallyIndividual, b: TallyClub | TallyIndividual) => 
            (Number(b.gold) - Number(a.gold)) || (Number(b.silver) - Number(a.silver)) || (Number(b.bronze) - Number(a.bronze));

        const sortedClubs = Object.values(clubs).sort(sortFn).map((c) => ({
            ...c,
            individualDetails: Object.values(c.individualDetails).sort((a, b) => b.medals.length - a.medals.length)
        }));
        const sortedIndividuals = Object.values(individual).sort(sortFn);

        const categoryLeaderboard = [...new Set(swimmers.map(s => s.ageGroup))].filter(Boolean).sort().map(ku => ({
            ku,
            leaders: sortedIndividuals.filter((i) => i.swimmer.ageGroup === ku)
        }));

        return { 
            detailedEvents, 
            clubs: sortedClubs, 
            individuals: sortedIndividuals, 
            categoryLeaderboard, 
            broken,
            registrationData
        };
    }, [renderEvents, baseEvents, swimmers, competitionInfo, records, events]);


    const handleExportExcel = () => {
        if (!XLSX) return alert("Pustaka Excel belum siap.");
        let data: any[] = [];
        let fileName = "Laporan";

        switch(reportType) {
            case 'schedule':
                data = renderEvents.map(e => ({ "NO ACARA": e.globalEventNumber, "NOMOR LOMBA": formatEventName(e), "JUMLAH PESERTA": e.entries.length }));
                break;
            case 'results':
                processedData.detailedEvents.forEach(e => e.detailedResults?.forEach(r => data.push({
                    "NOMOR": e.globalEventNumber, "EVENT": formatEventName(e), "RANK": r.rank || '-', "NAMA ATLET": r.swimmer?.name, "TIM": r.swimmer?.club, "WAKTU": formatTime(r.time)
                })));
                break;
            case 'clubMedals':
                data = processedData.clubs.map((c, i) => ({ "PERINGKAT": i+1, "KLUB": c.name, "EMAS": c.gold, "PERAK": c.silver, "PERUNGGU": c.bronze, "TOTAL": c.gold+c.silver+c.bronze }));
                break;
            case 'swimmerTotal':
            case 'swimmerCategory':
                processedData.individuals.forEach((i: any, idx) => data.push({
                    "NO": idx+1, "NAMA ATLET": i.swimmer.name, "TIM": i.swimmer.club, "JENIS KELAMIN": i.swimmer.gender === 'Male' ? 'PUTRA' : 'PUTRI', "KU": i.swimmer.ageGroup || '-', "EMAS": i.gold, "PERAK": i.silver, "PERUNGGU": i.bronze, "TOTAL": i.gold+i.silver+i.bronze
                }));
                break;
            case 'onlineRegistration':
                processedData.registrationData.forEach((item, idx) => {
                    data.push({
                        "NO": idx + 1,
                        "NAMA ATLET": item.swimmer.name,
                        "KLUB": item.swimmer.club,
                        "NOMINAL BAYAR": item.swimmer.paymentAmount || 0,
                        "NOMOR LOMBA": item.registeredEvents.map(re => re.name).join(', '),
                        "WAKTU UNGGULAN": item.registeredEvents.map(re => re.time).join(', ')
                    });
                });
                break;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan");
        XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
    };

    if (isLoading || !competitionInfo) return <div className="flex justify-center p-20"><Spinner /></div>;

    const reportTitles: Record<ReportType, string> = {
        schedule: 'SUSUNAN ACARA (ORDER OF EVENTS)',
        program: 'BUKU ACARA (MEET PROGRAM)',
        results: 'BUKU HASIL LOMBA (MEET RESULTS)',
        clubMedals: 'REKAPITULASI MEDALI KLUB / TIM',
        clubSwimmerMedals: 'REKAPITULASI MEDALI KLUB & ATLET',
        swimmerTotal: 'REKAPITULASI MEDALI ATLET (TOTAL)',
        swimmerCategory: 'KLASEMEN PERORANGAN (PER KATEGORI)',
        brokenRecords: 'DAFTAR REKOR TERPECAHKAN',
        onlineRegistration: 'LAPORAN PENDAFTARAN ONLINE & PEMBAYARAN',
        participantCards: 'KARTU PESERTA ATLET'
    };

    return (
        <div className="print-view-container">
            <div className="no-print space-y-4 mb-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Pengaturan Laporan</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Pilih Jenis Laporan</label>
                            <select 
                                value={reportType} 
                                onChange={(e) => {
                                    setReportType(e.target.value as ReportType);
                                    setSessionFilter(0);
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                {Object.entries(reportTitles).map(([k, v]) => <option key={k} value={k}>{v.replace(/\(.*\)/, '')}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Filter Sesi</label>
                            <select 
                                value={sessionFilter} 
                                onChange={(e) => {
                                    setSessionFilter(Number(e.target.value));
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                <option value={0}>SEMUA SESI</option>
                                {availableSessions.map(s => <option key={s} value={s}>SESI {romanize(s)}</option>)}
                            </select>
                        </div>
                    </div>

                    {['program', 'results'].includes(reportType) && (
                        <div className="mt-6 border-t pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-black uppercase text-text-secondary">Pilih Nomor Lomba ({selectedEventIds.size || 'Semua'} Dipilih)</label>
                                <div className="space-x-2">
                                    <button onClick={() => handleToggleAllEvents(true)} className="text-[10px] font-bold text-primary hover:underline">PILIH SEMUA</button>
                                    <button onClick={() => handleToggleAllEvents(false)} className="text-[10px] font-bold text-red-500 hover:underline">HAPUS SEMUA</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-background/50 rounded border">
                                {baseEvents.map(e => (
                                    <label key={e.id} className="flex items-center gap-2 p-1 hover:bg-primary/5 cursor-pointer rounded">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedEventIds.has(e.id)} 
                                            onChange={() => handleToggleEventId(e.id)} 
                                            className="h-4 w-4 rounded border-gray-300 text-primary"
                                        />
                                        <span className="text-[10px] font-bold truncate">#{e.globalEventNumber} - {formatEventName(e)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-6 mt-4 border-t border-border">
                        <div className="flex gap-4">
                             <Button onClick={() => window.print()} className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                CETAK / PDF
                            </Button>
                            <Button onClick={handleExportExcel} variant="secondary" className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                UNDUH EXCEL
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="print-only bg-white text-black p-2 min-h-screen">
                <ReportHeader info={competitionInfo} title={reportTitles[reportType]} />
                
                {reportType === 'schedule' && <ScheduleReport events={baseEvents} />}
                
                {reportType === 'program' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                    />
                )}
                
                {reportType === 'results' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                        showResults 
                    />
                )}

                {reportType === 'clubMedals' && <ClubMedalsReport data={processedData.clubs} />}
                
                {reportType === 'clubSwimmerMedals' && <ClubSwimmerMedalsReport data={processedData.clubs} />}
                
                {reportType === 'swimmerTotal' && <AthleteRecapReport data={processedData.individuals} />}
                
                {reportType === 'swimmerCategory' && (
                    <div className="space-y-12">
                        {processedData.categoryLeaderboard.map(cat => (
                            <AthleteRecapReport key={cat.ku} data={cat.leaders} title={`KATEGORI: ${cat.ku}`} />
                        ))}
                    </div>
                )}

                {reportType === 'onlineRegistration' && <OnlineRegistrationReport data={processedData.registrationData} />}
                
                {reportType === 'participantCards' && <ParticipantCardsReport data={processedData.registrationData} info={competitionInfo} />}

                {reportType === 'brokenRecords' && (
                    <div className="space-y-4">
                        {processedData.broken.map((br, i) => (
                            <div key={i} className="p-4 border-2 border-black rounded bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="font-black text-sm uppercase">{br.newEventName}</p>
                                    <p className="text-lg font-black uppercase tracking-tight">{br.newHolder.name} ({br.newHolder.club})</p>
                                    <p className="text-[10px] mt-1 font-bold italic text-red-600 uppercase">MEMECAHKAN REKOR {br.record.type} ({formatTime(br.record.time)} - {br.record.holderName})</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-3xl font-black">{formatTime(br.newTime)}</p>
                                </div>
                            </div>
                        ))}
                        {processedData.broken.length === 0 && <p className="text-center italic py-10">TIDAK ADA REKOR YANG TERPECAHKAN PADA SESI INI.</p>}
                    </div>
                )}

                <footer className="pt-8 mt-12 border-t-2 border-black text-center opacity-70 text-[9px] font-bold uppercase tracking-widest">
                     DICETAK PADA: {new Date().toLocaleString('id-ID')} | SYSTEM BY R.E.A.C.T | HALAMAN 1
                </footer>
            </div>
        </div>
    );
};
