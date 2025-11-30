import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender } from '../constants';
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

// --- HELPER FUNCTIONS ---
const romanize = (num: number): string => {
    if (isNaN(num) || num <= 0) return '';
    const lookup: { [key: string]: number } = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '';
    for (let i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
};

const formatTime = (ms: number) => {
    if (ms === 0) return 'NT';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
};

const estimateHeatDuration = (distance: number): number => {
    if (distance <= 50) return 2 * 60 * 1000; // 2 menit
    if (distance <= 100) return 3 * 60 * 1000; // 3 menit
    if (distance <= 200) return 5 * 60 * 1000; // 5 menit
    if (distance <= 400) return 7 * 60 * 1000; // 7 menit
    if (distance <= 800) return 11 * 60 * 1000; // 11 menit (dari rentang 11-12)
    if (distance <= 1500) return 24 * 60 * 1000; // 24 menit (dari rentang 23-25)
    return 5 * 60 * 1000; // Default
};


// --- PRINTABLE COMPONENTS ---

const ReportHeader: React.FC<{ info: CompetitionInfo, title: string }> = ({ info, title }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-20 object-contain mx-auto mb-4" />}
        
        <div className="mb-4">
            {info.eventName.split('\n').map((line, index) => {
                if (index === 0) {
                    return <h1 key={index} className="font-bold tracking-tight" style={{ fontSize: '22px' }}>{line}</h1>;
                } else if (index === 1) {
                    return <p key={index} className="font-semibold tracking-tight" style={{ fontSize: '12px' }}>{line}</p>;
                } else { // index 2 and beyond
                    return <p key={index} className="font-semibold tracking-tight" style={{ fontSize: '11px' }}>{line}</p>;
                }
            })}
            <p className="text-lg text-gray-600 mt-1">{info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <h2 className="text-2xl font-semibold tracking-wide my-4 text-center">{title}</h2>
    </header>
);

const ReportFooter: React.FC<{ info: CompetitionInfo }> = ({ info }) => {
    if (!info.sponsorLogo) return null;
    return (
        <footer className="pt-8 mt-12 border-t-2 border-gray-300 text-center">
             <img src={info.sponsorLogo} alt="Sponsor Logo" className="h-20 object-contain mx-auto" />
        </footer>
    );
}

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) {
        return <p className="uppercase text-xs font-sans">{typeText} | TIDAK ADA REKOR TERCATAT</p>;
    }
    const parts = [
        typeText,
        formatTime(record.time),
        record.holderName,
        record.yearSet,
        record.locationSet
    ].filter(p => p != null && String(p).trim() !== '');

    return (
        <p className="uppercase text-xs font-sans">
            {parts.join(' | ')}
        </p>
    );
};

// --- Interfaces for ProgramBook with timing ---
interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}
interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
}

// Define a type for events that have the global numbering attached
type ScheduledEvent = SwimEvent & { globalEventNumber: number };

const ScheduleOfEvents: React.FC<{ events: ScheduledEvent[] }> = ({ events }) => {
    const processedData = useMemo(() => {
        // Use the passed `events` which already have `globalEventNumber` and are sorted.
        // We just need to group them by date.
        const eventsToProcess = events as ScheduledEvent[];
        const groupedByDate = eventsToProcess.reduce((acc, event) => {
            const dateStr = event.sessionDateTime 
                ? new Date(event.sessionDateTime).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : 'Tanggal Belum Ditentukan';
            
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {} as Record<string, ScheduledEvent[]>);

        return Object.entries(groupedByDate).map(([date, dateEvents]) => {
            const groupedBySession = dateEvents.reduce((acc, event) => {
                const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
                if (!acc[sessionName]) acc[sessionName] = [];
                acc[sessionName].push(event);
                return acc;
            }, {} as Record<string, ScheduledEvent[]>);
            return { date, sessions: Object.entries(groupedBySession) };
        });
    }, [events]);

    if (processedData.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;
    }

    return (
        <main className="space-y-6">
            {processedData.map(({ date, sessions }) => (
                <div key={date}>
                    <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">{date}</h3>
                    {sessions.map(([sessionName, sessionEvents]) => (
                        <div key={sessionName} className="mb-4">
                            <h4 className="text-xl font-semibold mb-2">{sessionName}</h4>
                            <table className="w-full text-left text-sm">
                                <colgroup>
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '85%' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>No. Acara</th>
                                        <th>Nomor Lomba</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionEvents.map(event => (
                                        <tr key={event.id}>
                                            <td className="font-bold">{event.globalEventNumber}</td>
                                            <td>{formatEventName(event)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            ))}
        </main>
    );
};

const ProgramBook: React.FC<{ events: ScheduledEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[] }> = ({ events, swimmers, info, records }) => {
    const data = useMemo<Record<string, TimedEvent[]>>(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

        const sessionsData = (events as ScheduledEvent[]).reduce<Record<string, TimedEvent[]>>((acc, event: ScheduledEvent) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
            if (!acc[sessionName]) {
                acc[sessionName] = [];
            }
            
// FIX: Added explicit type cast to `event.entries` to resolve 'map' does not exist on type 'unknown' error.
            const eventEntries: Entry[] = ((event.entries as EventEntry[]) || []).map((entry: EventEntry) => {
                const swimmer = swimmersMap.get(entry.swimmerId);
                return swimmer ? { ...entry, swimmer } : null;
            }).filter((e): e is Entry => e !== null);

            // Only push if there are entries or if we want to show empty events
            if (eventEntries.length > 0) {
                 acc[sessionName].push({ ...event, detailedEntries: eventEntries });
            } else {
                 // To ensure event numbering consistency, always include the event shell.
                 acc[sessionName].push({ ...event, detailedEntries: [] });
            }
            
            return acc;
        }, {} as Record<string, TimedEvent[]>);

        Object.values(sessionsData).forEach((sessionEvents: TimedEvent[]) => {
            if (sessionEvents.length === 0) return;

            const firstEvent = sessionEvents[0];
            const sessionDT = firstEvent?.sessionDateTime ? new Date(firstEvent.sessionDateTime) : null;
            let runningTime = sessionDT ? sessionDT.getTime() : null;

            sessionEvents.forEach((event: TimedEvent) => {
                if (runningTime !== null) {
                    event.estimatedEventStartTime = runningTime;
                    
                    const lanes = info.numberOfLanes || 8;
                    const heats = generateHeats(event.detailedEntries, lanes);
                    event.heatsWithTimes = [];
                    
                    (heats || []).forEach((heat: Heat) => {
                        (event.heatsWithTimes as TimedHeat[]).push({
                            ...heat,
                            estimatedHeatStartTime: runningTime || undefined
                        });
                        runningTime = (runningTime || 0) + estimateHeatDuration(event.distance);
                    });
                } else {
                    const lanes = info.numberOfLanes || 8;
                    event.heatsWithTimes = generateHeats(event.detailedEntries, lanes).map(h => ({ ...h }));
                }
            });
        });

        return sessionsData;
    }, [events, swimmers, info]);

    if (!data || Object.keys(data).length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;

    return (
        <main className="space-y-8">
            {Object.entries(data).map(([sessionName, sessionEvents]) => {
                const firstEvent = sessionEvents[0];
                const sessionDT = firstEvent?.sessionDateTime ? new Date(firstEvent.sessionDateTime) : null;
                return (
                    <div key={sessionName}>
                        <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">
                            {sessionName}
                            {sessionDT && (
                                <span className="block text-lg font-normal">
                                    {sessionDT.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    {' - '}
                                    {sessionDT.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                            )}
                        </h3>
                        {sessionEvents.map((event: TimedEvent) => {
                            const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const isRelay = event.relayLegs && event.relayLegs > 1;
                            const hasHeats = (event.heatsWithTimes || []).length > 0;
                            
                            return (
                                <section key={event.id} className="mb-6 print-event-section">
                                    <h4 className="text-lg font-semibold bg-gray-100 p-2 rounded-t-md border-b-2 border-gray-400">
                                       {`Nomor Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                                       {event.estimatedEventStartTime && (
                                            <span className="font-normal text-sm block">
                                                Perkiraan waktu: {new Date(event.estimatedEventStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </h4>
                                    <div className="text-xs text-gray-600 my-2 px-2 border-l-2 border-gray-300 space-y-1">
                                        <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                                        <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                                    </div>
                                    
                                    {hasHeats ? (event.heatsWithTimes || []).map((heat: TimedHeat) => (
                                        <div key={heat.heatNumber} className="mt-3">
                                            <h5 className="font-bold text-center mb-1">
                                                Seri {heat.heatNumber} dari {event.heatsWithTimes?.length || 0}
                                                {heat.estimatedHeatStartTime && (
                                                    <span className="font-normal text-gray-600 text-sm ml-4">
                                                        (Perkiraan waktu: {new Date(heat.estimatedHeatStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
                                                    </span>
                                                )}
                                            </h5>
                                            <table className="w-full text-left text-sm">
                                                <colgroup>
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '30%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '27%' }} />
                                                    <col style={{ width: '15%' }} />
                                                </colgroup>
                                                <thead><tr><th>Lintasan</th><th>Nama Atlet</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu Unggulan</th></tr></thead>
                                                <tbody>
                                                    {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                                        const assignment = heat.assignments.find(a => a.lane === lane);
                                                        const displayName = assignment ? (isRelay ? assignment.entry.swimmer.club : assignment.entry.swimmer.name) : '-';
                                                        const displayClub = assignment ? assignment.entry.swimmer.club : '-';
                                                        return (
                                                            <tr key={lane}>
                                                                <td className="w-12 text-center font-bold">{lane}</td>
                                                                <td>{displayName}</td>
                                                                <td>{assignment && !isRelay ? (assignment.entry.swimmer.ageGroup || '-') : '-'}</td>
                                                                <td>{assignment && !isRelay ? assignment.entry.swimmer.birthYear : '-'}</td>
                                                                <td>{displayClub}</td>
                                                                <td className="text-right font-mono">{assignment ? formatTime(assignment.entry.seedTime) : '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )) : (
                                        <p className="text-center text-sm text-text-secondary py-4 italic border border-dashed border-gray-300 rounded mt-2">
                                            Belum ada peserta terdaftar untuk nomor lomba ini.
                                        </p>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                );
            })}
        </main>
    );
};

const EventResults: React.FC<{ events: ScheduledEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[], brokenRecords: BrokenRecord[] }> = ({ events, swimmers, info, records, brokenRecords }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        return (events as ScheduledEvent[]).map((event: ScheduledEvent) => {
            const getPenalty = (time: number) => {
                if (time > 0) return 0; // Valid time
                if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                if (time === -2) return 2; // NS
                return 3; // Not yet recorded (NT) or 0
            };
            
            const validResultsForRanking = (event.results || [])
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time);

            const sortedResults = [...(event.results || [])]
                .sort((a: Result, b: Result) => {
                    if (a.time > 0 && b.time > 0) return a.time - b.time;
                    return getPenalty(a.time) - getPenalty(b.time);
                })
                .map((r: Result) => {
                    const swimmer = swimmersMap.get(r.swimmerId);
                    const rank = r.time > 0 ? validResultsForRanking.findIndex((vr: Result) => vr.swimmerId === r.swimmerId) + 1 : 0;
                    const recordsBroken = brokenRecords.filter((br: BrokenRecord) => br.newHolder.id === swimmer?.id && br.newTime === r.time && br.record.style === event.style && br.record.distance === event.distance);
                    return { ...r, rank, swimmer, recordsBroken };
                });

            return { ...event, sortedResults };
        });
    }, [events, swimmers, brokenRecords]);

    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada hasil lomba yang tercatat untuk nomor yang dipilih.</p>;

    return (
        <main>
            {data.map(event => {
                const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                
                return (
                    <section key={event.id} className="print-event-section">
                        <h3 className="text-xl font-semibold bg-gray-100 p-2 rounded-t-md border-b-2 border-gray-400">
                            {`Hasil Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                        </h3>
                         <div className="text-xs text-gray-600 mt-2 mb-2 px-2 border-l-2 border-gray-300 space-y-1">
                            <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                            <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                        </div>
                        {event.sortedResults.length > 0 ? (
                            <table className="w-full text-left text-sm mt-2">
                                <colgroup>
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '25%' }} />
                                    <col style={{ width: '13%' }} />
                                    <col style={{ width: '8%' }} />
                                </colgroup>
                                <thead><tr><th className="text-center">Peringkat</th><th>Nama Atlet</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu</th><th className="text-center">Medali</th></tr></thead>
                                <tbody>
                                    {event.sortedResults.map(res => {
                                        let rankClass = '';
                                        if (res.rank === 1) rankClass = 'print-gold-medal';
                                        else if (res.rank === 2) rankClass = 'print-silver-medal';
                                        else if (res.rank === 3) rankClass = 'print-bronze-medal';

                                        return (
                                            <tr key={res.swimmerId} className={rankClass}>
                                                <td className="text-center font-bold">{res.rank > 0 ? res.rank : formatTime(res.time)}</td>
                                                <td>{res.swimmer?.name || 'N/A'}</td>
                                                <td>{event.relayLegs ? '-' : res.swimmer?.ageGroup || '-'}</td>
                                                <td>{event.relayLegs ? '-' : res.swimmer?.birthYear || ''}</td>
                                                <td>{res.swimmer?.club || 'N/A'}</td>
                                                <td className="text-right font-mono">
                                                    {formatTime(res.time)}
                                                    {res.recordsBroken.map(br => (
                                                        <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                            {br.record.type}
                                                        </span>
                                                    ))}
                                                </td>
                                                <td className="text-center"><Medal rank={res.rank} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-sm text-text-secondary italic mt-2 border p-4 rounded text-center bg-gray-50">
                                Belum ada hasil lomba yang tercatat atau belum ada peserta.
                            </p>
                        )}
                    </section>
                );
            })}
        </main>
    );
};

const ClubMedalStandings: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo }> = ({ events, swimmers, info }) => {
    const data = useMemo(() => {
        const allClubs = [...new Set(swimmers.map(s => s.club))];
        
        const clubMedals = allClubs.reduce((acc: Record<string, { gold: number, silver: number, bronze: number }>, club: string) => {
            acc[club] = { gold: 0, silver: 0, bronze: 0 };
            return acc;
        }, {} as Record<string, { gold: number, silver: number, bronze: number }>);
        
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        (events as SwimEvent[]).forEach((event: SwimEvent) => {
            if (!event.results) return;
            [...(event.results as Result[])]
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time)
                .slice(0, 3)
                .forEach((result: Result, i: number) => {
                    const rank = i + 1;
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer && clubMedals[swimmer.club]) {
                        if (rank === 1) clubMedals[swimmer.club].gold++;
                        else if (rank === 2) clubMedals[swimmer.club].silver++;
                        else if (rank === 3) clubMedals[swimmer.club].bronze++;
                    }
                });
        });

        return Object.entries(clubMedals).sort(([clubA, a]: [string, { gold: number, silver: number, bronze: number }], [clubB, b]: [string, { gold: number, silver: number, bronze: number }]) => 
            b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || clubA.localeCompare(clubB)
        );
    }, [events, swimmers]);

    const grandTotal = useMemo(() => {
        return data.reduce((acc: { gold: number, silver: number, bronze: number }, [, medals]: [string, { gold: number, silver: number, bronze: number }]) => {
            acc.gold += medals.gold;
            acc.silver += medals.silver;
            acc.bronze += medals.bronze;
            return acc;
        }, { gold: 0, silver: 0, bronze: 0 });
    }, [data]);

    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Belum ada medali yang diraih.</p>;

    return (
        <main className="print-event-section">
            <table className="w-full text-left">
                <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '45%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                </colgroup>
                <thead><tr><th className="text-center">#</th><th>Nama Tim</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th><th className="text-center">Total</th></tr></thead>
                <tbody>
                    {data.map(([club, medals], i) => (
                        <tr key={club}>
                            <td className="text-center font-bold">{i + 1}</td>
                            <td className="font-semibold">{club}</td>
                            <td className="text-center">{medals.gold}</td>
                            <td className="text-center">{medals.silver}</td>
                            <td className="text-center">{medals.bronze}</td>
                            <td className="text-center font-bold">{medals.gold + medals.silver + medals.bronze}</td>
                        </tr>
                    ))}
                    <tr className="border-t-2 border-black font-bold bg-gray-200">
                        <td colSpan={2} className="text-right pr-4">TOTAL</td>
                        <td className="text-center">{grandTotal.gold}</td>
                        <td className="text-center">{grandTotal.silver}</td>
                        <td className="text-center">{grandTotal.bronze}</td>
                        <td className="text-center">{grandTotal.gold + grandTotal.silver + grandTotal.bronze}</td>
                    </tr>
                </tbody>
            </table>
        </main>
    );
};

// --- NEW COMPONENT: ClubMedalStandingsWithAthletes ---
const ClubMedalStandingsWithAthletes: React.FC<{ events: SwimEvent[], swimmers: Swimmer[] }> = ({ events, swimmers }) => {
    type MedalCounts = { gold: number, silver: number, bronze: number };
    type Win = { eventName: string, rank: number, time: number };
    type AthleteWins = { swimmer: Swimmer, wins: Win[] };
    type ClubData = { medals: MedalCounts, athletes: Record<string, AthleteWins> };

    const data = useMemo(() => {
        const clubData: Record<string, ClubData> = {};
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        swimmers.forEach((s: Swimmer) => {
            if (!clubData[s.club]) {
                clubData[s.club] = { medals: { gold: 0, silver: 0, bronze: 0 }, athletes: {} };
            }
        });

        (events as SwimEvent[]).forEach((event: SwimEvent) => {
            if (!event.results) return;
            [...event.results]
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time)
                .slice(0, 3)
                .forEach((result: Result, i: number) => {
                    const rank = i + 1;
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        const club = clubData[swimmer.club];
                        if (rank === 1) club.medals.gold++;
                        else if (rank === 2) club.medals.silver++;
                        else if (rank === 3) club.medals.bronze++;

                        if (!club.athletes[swimmer.id]) {
                            club.athletes[swimmer.id] = { swimmer, wins: [] };
                        }
                        club.athletes[swimmer.id].wins.push({ eventName: formatEventName(event), rank, time: result.time });
                    }
                });
        });

        return Object.entries(clubData)
            .sort(([clubA, a]: [string, ClubData], [clubB, b]: [string, ClubData]) => 
                b.medals.gold - a.medals.gold || b.medals.silver - a.medals.silver || b.medals.bronze - a.medals.bronze || clubA.localeCompare(clubB)
            );
    }, [events, swimmers]);

    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada data medali untuk ditampilkan.</p>;

    return (
        <main className="space-y-8">
            {data.map(([clubName, clubData]) => {
// FIX: Added explicit type annotation for 'a' to resolve 'wins' does not exist on type 'unknown' error.
                const athletesWithWins = Object.values(clubData.athletes).filter((a: AthleteWins) => a.wins.length > 0);
                if (athletesWithWins.length === 0) return null;

                return (
                    <section key={clubName} className="print-event-section">
                        <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md">
                            {clubName} - (🥇{clubData.medals.gold} 🥈{clubData.medals.silver} 🥉{clubData.medals.bronze})
                        </h3>
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr>
                                    <th style={{width: '25%'}}>Nama Atlet</th>
                                    <th>Nomor Lomba yang Dimenangkan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {athletesWithWins.map(({ swimmer, wins }) => (
                                    <tr key={swimmer.id}>
                                        <td className="font-semibold align-top">{swimmer.name}</td>
                                        <td>
                                            <ul className="space-y-1">
                                                {wins.sort((a,b)=> a.rank - b.rank).map((win, i) => (
                                                    <li key={i}><Medal rank={win.rank} /> {win.eventName} - <span className="font-mono">{formatTime(win.time)}</span></li>
                                                ))}
                                            </ul>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                );
            })}
        </main>
    );
};


// --- NEW COMPONENT: IndividualMedalStandings ---
const IndividualMedalStandings: React.FC<{ events: SwimEvent[], swimmers: Swimmer[] }> = ({ events, swimmers }) => {
    const { maleStandings, femaleStandings } = useMemo(() => {
        const individualMedals: Record<string, { swimmer: Swimmer, gold: number, silver: number, bronze: number }> = {};
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        (events as SwimEvent[]).forEach((event: SwimEvent) => {
            if (event.results && event.results.length > 0 && event.gender !== Gender.MIXED) {
                [...event.results]
                    .filter((r: Result) => r.time > 0)
                    .sort((a: Result, b: Result) => a.time - b.time)
                    .slice(0, 3)
                    .forEach((result: Result, i: number) => {
                        const rank = i + 1;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        if (swimmer) {
                            if (!individualMedals[swimmer.id]) {
                                individualMedals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                            }
                            if (rank === 1) individualMedals[swimmer.id].gold++;
                            else if (rank === 2) individualMedals[swimmer.id].silver++;
                            else if (rank === 3) individualMedals[swimmer.id].bronze++;
                        }
                    });
            }
        });

        const sortedStandings = Object.values(individualMedals)
            .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.swimmer.name.localeCompare(b.swimmer.name));
        
        const maleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Male');
        const femaleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Female');

        return { maleStandings, femaleStandings };
    }, [events, swimmers]);

    const renderTable = (data: typeof maleStandings, title: string) => (
        <div className="print-event-section">
            <h3 className="text-2xl font-bold mb-4 text-center">{title}</h3>
            {data.length > 0 ? (
                <table className="w-full text-left">
                    <colgroup><col style={{width: '8%'}} /><col style={{width: '32%'}} /><col style={{width: '30%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /></colgroup>
                    <thead><tr><th className="text-center">#</th><th>Nama Atlet</th><th>Nama Tim</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th></tr></thead>
                    <tbody>
                        {data.map((entry, i) => (
                            <tr key={entry.swimmer.id}>
                                <td className="text-center font-bold">{i + 1}</td>
                                <td className="font-semibold">{entry.swimmer.name}</td>
                                <td>{entry.swimmer.club}</td>
                                <td className="text-center">{entry.gold}</td>
                                <td className="text-center">{entry.silver}</td>
                                <td className="text-center">{entry.bronze}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="text-center text-text-secondary py-6">Tidak ada medali yang diraih.</p>}
        </div>
    );

    return (
        <main className="space-y-12">
            {renderTable(maleStandings, "Rekap Medali Atlet (Putra)")}
            {renderTable(femaleStandings, "Rekap Medali Atlet (Putri)")}
            <p className="text-center text-xs text-gray-500 pt-4">Klasemen perorangan tidak termasuk medali dari nomor lomba campuran.</p>
        </main>
    );
};

// --- NEW COMPONENT: IndividualMedalStandingsByCategory ---
const IndividualMedalStandingsByCategory: React.FC<{ events: SwimEvent[], swimmers: Swimmer[] }> = ({ events, swimmers }) => {
    type Standing = { swimmer: Swimmer, gold: number, silver: number, bronze: number };

    const dataByCategory = useMemo(() => {
        const medalsByAgeGroup: Record<string, Record<string, Standing>> = {};
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        (events as SwimEvent[]).forEach((event: SwimEvent) => {
            if (event.results && event.results.length > 0 && event.gender !== Gender.MIXED) {
                [...event.results]
                    .filter((r: Result) => r.time > 0)
                    .sort((a: Result, b: Result) => a.time - b.time)
                    .slice(0, 3)
                    .forEach((result: Result, i: number) => {
                        const rank = i + 1;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        if (swimmer) {
                            const ageGroup = swimmer.ageGroup || 'Umum';
                            if (!medalsByAgeGroup[ageGroup]) medalsByAgeGroup[ageGroup] = {};
                            if (!medalsByAgeGroup[ageGroup][swimmer.id]) {
                                medalsByAgeGroup[ageGroup][swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                            }
                            if (rank === 1) medalsByAgeGroup[ageGroup][swimmer.id].gold++;
                            else if (rank === 2) medalsByAgeGroup[ageGroup][swimmer.id].silver++;
                            else if (rank === 3) medalsByAgeGroup[ageGroup][swimmer.id].bronze++;
                        }
                    });
            }
        });

        const finalData = Object.entries(medalsByAgeGroup).map(([ageGroup, swimmersMedals]) => {
            const sortedStandings = Object.values(swimmersMedals)
                .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.swimmer.name.localeCompare(b.swimmer.name));
            const maleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Male');
            const femaleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Female');
            return { ageGroup, maleStandings, femaleStandings };
        });

        return finalData.sort((a, b) => a.ageGroup.localeCompare(b.ageGroup));
    }, [events, swimmers]);

    const renderTable = (data: Standing[], title: string) => (
        <div className="print-event-section">
            <h4 className="text-xl font-bold mb-4 text-center">{title}</h4>
            {data.length > 0 ? (
                <table className="w-full text-left">
                    <colgroup><col style={{width: '8%'}} /><col style={{width: '32%'}} /><col style={{width: '30%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /></colgroup>
                    <thead><tr><th className="text-center">#</th><th>Nama Atlet</th><th>Nama Tim</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th></tr></thead>
                    <tbody>
                        {data.map((entry, i) => (
                            <tr key={entry.swimmer.id}>
                                <td className="text-center font-bold">{i + 1}</td>
                                <td className="font-semibold">{entry.swimmer.name}</td>
                                <td>{entry.swimmer.club}</td>
                                <td className="text-center">{entry.gold}</td>
                                <td className="text-center">{entry.silver}</td>
                                <td className="text-center">{entry.bronze}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="text-center text-text-secondary py-6">Tidak ada medali yang diraih.</p>}
        </div>
    );

    if (dataByCategory.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada medali perorangan untuk ditampilkan per kategori.</p>;
    }

    return (
        <main className="space-y-12">
            {dataByCategory.map(({ ageGroup, maleStandings, femaleStandings }) => (
                <div key={ageGroup} className="print-event-section">
                    <h3 className="text-3xl font-bold mb-6 text-center bg-gray-200 text-black p-2 rounded-md">{ageGroup}</h3>
                    {renderTable(maleStandings, `Putra`)}
                    <br/>
                    {renderTable(femaleStandings, `Putri`)}
                </div>
            ))}
            <p className="text-center text-xs text-gray-500 pt-4">Klasemen perorangan tidak termasuk medali dari nomor lomba campuran.</p>
        </main>
    );
};


// --- NEW COMPONENT: BrokenRecordsReport ---
const BrokenRecordsReport: React.FC<{ brokenRecords: BrokenRecord[] }> = ({ brokenRecords }) => {
    if (brokenRecords.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada rekor yang terpecahkan dalam kompetisi ini.</p>;
    }

    return (
        <main className="space-y-6">
            {brokenRecords.map(({ record, newEventName, newHolder, newTime }, i) => (
                <section key={i} className="print-event-section bg-gray-50 p-4 rounded-lg border">
                    <h3 className="text-lg font-bold text-primary">{newEventName}</h3>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-green-100 p-3 rounded">
                            <h4 className="font-bold text-green-800">REKOR BARU</h4>
                            <p className="text-2xl font-semibold">{newHolder.name}</p>
                            <p className="text-md text-gray-700">{newHolder.club}</p>
                            <p className="text-3xl font-mono mt-2">{formatTime(newTime)}</p>
                        </div>
                        <div className="bg-red-100 p-3 rounded">
                            <h4 className="font-bold text-red-800">REKOR LAMA</h4>
                            <p className="text-lg font-semibold">{record.holderName}</p>
                            <p className="text-sm text-gray-600">{record.locationSet ? `${record.yearSet} - ${record.locationSet}` : record.yearSet}</p>
                            <p className="text-2xl font-mono mt-2 line-through">{formatTime(record.time)}</p>
                        </div>
                    </div>
                </section>
            ))}
        </main>
    );
};


export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [activeReport, setActiveReport] = useState<'schedule' | 'program' | 'results' | 'medals' | 'medalsWithAthletes' | 'individualMedals' | 'individualMedalsByCategory' | 'brokenRecords'>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [brokenRecords, setBrokenRecords] = useState<BrokenRecord[]>([]);
    const [selectedSession, setSelectedSession] = useState<number>(0); // 0 means "All Sessions"
    const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
    const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
    const { addNotification } = useNotification();

     useEffect(() => {
        if (!['program', 'results', 'individualMedalsByCategory'].includes(activeReport)) {
            setSelectedEventIds([]);
        }
    }, [activeReport]);

    useEffect(() => {
        const fetchRecords = async () => {
            const recordsData = await getRecords();
            setRecords(recordsData);
        };
        fetchRecords();
    }, []);

    useEffect(() => {
        const calculateBrokenRecords = () => {
            const broken: BrokenRecord[] = [];
            const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

            (events as SwimEvent[]).forEach((event: SwimEvent) => {
                if (!event.results) return;
                event.results.forEach((result: Result) => {
                    if (result.time > 0) {
                        const swimmer = swimmersMap.get(result.swimmerId);
                        if (!swimmer) return;

                        [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                            const record = records.find(r => 
                                r.type.toUpperCase() === type.toUpperCase() &&
                                r.gender === event.gender &&
                                r.distance === event.distance &&
                                r.style === event.style &&
                                (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
                                (r.category ?? null) === (event.category ?? null)
                            );

                            if (record && result.time < record.time) {
                                broken.push({
                                    record,
                                    newEventName: formatEventName(event),
                                    newHolder: swimmer,
                                    newTime: result.time
                                });
                            }
                        });
                    }
                });
            });
            const uniqueBroken = [...new Map(broken.sort((a,b) => a.newTime - b.newTime).map(item => [item.record.id, item])).values()];
            setBrokenRecords(uniqueBroken);
        };

        if (events.length > 0 && records.length > 0) {
            calculateBrokenRecords();
        }
    }, [events, swimmers, records]);

    const handlePrint = () => {
        window.print();
    };

    const sessionOptions = useMemo(() => {
        const sessions = new Set<number>();
        (events as SwimEvent[]).forEach((e: SwimEvent) => {
            if (e.sessionNumber && e.sessionNumber > 0) {
                sessions.add(e.sessionNumber);
            }
        });
        return Array.from(sessions).sort((a, b) => a - b);
    }, [events]);

    const eventsWithGlobalNumbers = useMemo<ScheduledEvent[]>(() => {
        let globalCounter = 1;
        const allScheduled = [...(events as SwimEvent[])]
            .filter((e: SwimEvent) => e.sessionNumber && e.sessionNumber > 0)
            .sort((a: SwimEvent, b: SwimEvent) => {
                const sessionDiff = (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                if (sessionDiff !== 0) return sessionDiff;
                return (a.heatOrder ?? 0) - (b.heatOrder ?? 0);
            });
        
        return allScheduled.map((e: SwimEvent) => ({
            ...e,
            globalEventNumber: globalCounter++
        }));
    }, [events]);

    const eventsToDisplay = useMemo<ScheduledEvent[]>(() => {
        if (selectedEventIds.length > 0) {
            const selectedSet = new Set(selectedEventIds);
            return eventsWithGlobalNumbers.filter(e => selectedSet.has(e.id));
        }
        if (selectedSession === 0) {
            return eventsWithGlobalNumbers;
        }
        return eventsWithGlobalNumbers.filter(e => e.sessionNumber === selectedSession);
    }, [eventsWithGlobalNumbers, selectedSession, selectedEventIds]);


    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    if (!competitionInfo) return <p className="text-center mt-8">Data kompetisi tidak tersedia.</p>;

    const getReportTitle = () => {
        if (selectedEventIds.length > 0) {
            const reportType = activeReport === 'program' ? 'Buku Acara' : 'Buku Hasil';
            if (selectedEventIds.length === 1) {
                const specificEvent = eventsWithGlobalNumbers.find(e => e.id === selectedEventIds[0]);
                return specificEvent ? `${reportType}: ${formatEventName(specificEvent)}` : reportType;
            }
            return `${reportType} (Pilihan Ganda)`;
        }
        
        const sessionSuffix = selectedSession > 0 && ['schedule', 'program', 'results'].includes(activeReport) ? ` - Sesi ${romanize(selectedSession)}` : '';
        switch (activeReport) {
            case 'schedule': return `Susunan Acara${sessionSuffix}`;
            case 'program': return `Buku Acara (Start List)${sessionSuffix}`;
            case 'results': return `Buku Hasil${sessionSuffix}`;
            case 'medals': return 'Rekap Medali Klub';
            case 'medalsWithAthletes': return 'Rekap Medali Klub & Atlet';
            case 'individualMedals': return 'Rekap Medali Atlet (Total)';
            case 'individualMedalsByCategory': return 'Klasemen Perorangan per Kategori (KU)';
            case 'brokenRecords': return 'Rekor Terpecahkan';
            default: return '';
        }
    };
    
    // --- EXCEL DOWNLOAD HANDLER ---
    const handleDownloadExcel = () => {
        if (typeof XLSX === 'undefined' || !competitionInfo) {
            addNotification('Pustaka Excel belum termuat atau data kompetisi tidak ada.', 'error');
            return;
        }
        setIsDownloadingExcel(true);
        try {
            const wb = XLSX.utils.book_new();
            const reportTitle = getReportTitle();
            const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

            const createHeaderAoa = (title: string) => [
                [competitionInfo.eventName.split('\n')[0] || ''],
                [competitionInfo.eventName.split('\n')[1] || ''],
                [competitionInfo.eventName.split('\n')[2] || ''],
                [competitionInfo.eventDate ? new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''],
                [],
                [title],
                []
            ];

            switch(activeReport) {
                 case 'schedule': {
                    // FIX: Explicitly type `aoa` to allow mixed content types (string, number).
                    let aoa: (string | number | null | undefined)[][] = createHeaderAoa(reportTitle);
                    aoa.push(['No. Acara', 'Nomor Lomba', 'Sesi', 'Perkiraan Waktu Mulai']);
                    eventsToDisplay.forEach(e => {
                        const startTime = e.sessionDateTime ? new Date(e.sessionDateTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'TBD';
                        aoa.push([e.globalEventNumber, formatEventName(e), e.sessionNumber, startTime]);
                    });
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    ws['!cols'] = [{wch: 10}, {wch: 60}, {wch: 10}, {wch: 20}];
                    XLSX.utils.book_append_sheet(wb, ws, 'Susunan Acara');
                    break;
                }
                
                case 'program':
                case 'results': {
                    // FIX: Explicitly type `aoa` to allow mixed content types (string, number).
                    let aoa: (string | number | null | undefined)[][] = createHeaderAoa(reportTitle);
                    const eventsBySession = eventsToDisplay.reduce((acc, event) => {
                        const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
                        if (!acc[sessionName]) acc[sessionName] = [];
                        acc[sessionName].push(event);
                        return acc;
                    }, {} as Record<string, ScheduledEvent[]>);

                    Object.entries(eventsBySession).forEach(([sessionName, sessionEvents]) => {
                        aoa.push([sessionName.toUpperCase()]);
                        aoa.push([]);

                        sessionEvents.forEach(event => {
                            aoa.push([`Nomor Acara ${event.globalEventNumber}: ${formatEventName(event)}`]);
                            const porprov = records.find(r => r.type === RecordType.PORPROV && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const nasional = records.find(r => r.type === RecordType.NASIONAL && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            if (porprov) aoa.push([`Rekor PORPROV: ${formatTime(porprov.time)} - ${porprov.holderName} (${porprov.yearSet})`]);
                            if (nasional) aoa.push([`Rekor Nasional: ${formatTime(nasional.time)} - ${nasional.holderName} (${nasional.yearSet})`]);
                            aoa.push([]);

                            if (activeReport === 'program') {
                                const entries: Entry[] = (event.entries || []).map(entry => ({...entry, swimmer: swimmersMap.get(entry.swimmerId)!})).filter(e => e.swimmer);
                                const heats = generateHeats(entries, competitionInfo.numberOfLanes || 8);
                                if (heats.length === 0) { aoa.push(['(Belum ada peserta terdaftar)']); } 
                                else {
                                    heats.forEach(heat => {
                                        aoa.push([`Seri ${heat.heatNumber} dari ${heats.length}`]);
                                        aoa.push(['Lintasan', 'Nama Atlet', 'KU', 'Tahun', 'Nama Tim', 'Waktu Unggulan']);
                                        Array.from({length: competitionInfo.numberOfLanes || 8}, (_,i)=>i+1).forEach(lane => {
                                            const assignment = heat.assignments.find(a => a.lane === lane);
// FIX: Used optional chaining and nullish coalescing to prevent errors when accessing properties of a potentially undefined 'swimmer' object.
                                            const swimmer = assignment?.entry.swimmer;
                                            aoa.push([lane, swimmer?.name ?? '-', swimmer?.ageGroup ?? '-', swimmer?.birthYear ?? '-', swimmer?.club ?? '-', assignment ? formatTime(assignment.entry.seedTime) : '-']);
                                        });
                                        aoa.push([]);
                                    });
                                }
                            } else { // results
                                if (!event.results || event.results.length === 0) { aoa.push(['(Belum ada hasil tercatat)']); } 
                                else {
                                    const validResults = event.results.filter(r => r.time > 0).sort((a,b) => a.time - b.time);
                                    const sorted = [...event.results].sort((a,b) => (a.time > 0 && b.time > 0) ? a.time - b.time : (a.time < 0 ? 1 : -1)).map(r => ({...r, rank: r.time > 0 ? validResults.findIndex(vr => vr.swimmerId === r.swimmerId) + 1 : 0}));
                                    aoa.push(['Peringkat', 'Nama Atlet', 'KU', 'Tahun', 'Nama Tim', 'Waktu', 'Rekor']);
                                    sorted.forEach(res => {
                                        const swimmer = swimmersMap.get(res.swimmerId);
                                        const recordsBrokenText = brokenRecords.filter(br => br.newHolder.id === swimmer?.id && br.newTime === res.time && br.record.style === event.style && br.record.distance === event.distance).map(br => br.record.type).join(', ');
                                        aoa.push([res.rank > 0 ? res.rank : formatTime(res.time), swimmer?.name || 'N/A', event.relayLegs ? '-' : (swimmer?.ageGroup || '-'), event.relayLegs ? '-' : (swimmer?.birthYear || ''), swimmer?.club || 'N/A', formatTime(res.time), recordsBrokenText]);
                                    });
                                }
                            }
                            aoa.push([]);
                        });
                    });
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    ws['!cols'] = [{wch:10},{wch:30},{wch:10},{wch:10},{wch:30},{wch:15},{wch:10}];
                    XLSX.utils.book_append_sheet(wb, ws, reportTitle);
                    break;
                }
                
                case 'medals': {
                     const allClubs = [...new Set(swimmers.map(s => s.club))];
// FIX: Explicitly typed the accumulator in the reduce function to prevent TypeScript from inferring it as `{}`, resolving several type errors.
                     const clubMedals = allClubs.reduce((acc: Record<string, { gold: number, silver: number, bronze: number }>, club) => ({ ...acc, [club]: { gold: 0, silver: 0, bronze: 0 } }), {});
// FIX: Added explicit types to parameters in array methods to ensure correct type inference.
                     (events as SwimEvent[]).forEach((event: SwimEvent) => { if (!event.results) return; [...(event.results as Result[])].filter((r: Result) => r.time > 0).sort((a: Result, b: Result) => a.time - b.time).slice(0, 3).forEach((result: Result, i: number) => { const rank = i + 1; const swimmer = swimmersMap.get(result.swimmerId); if (swimmer && clubMedals[swimmer.club]) { if (rank === 1) clubMedals[swimmer.club].gold++; else if (rank === 2) clubMedals[swimmer.club].silver++; else if (rank === 3) clubMedals[swimmer.club].bronze++; } }); });
                     const sortedData = Object.entries(clubMedals).sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);

                    // FIX: Explicitly type `aoa` to allow mixed content types (string, number).
                     const aoa: (string | number | null | undefined)[][] = createHeaderAoa(reportTitle);
                     aoa.push(['#', 'Nama Tim', '🥇', '🥈', '🥉', 'Total']);
                     sortedData.forEach(([club, medals], i) => {
                        aoa.push([i+1, club, medals.gold, medals.silver, medals.bronze, medals.gold + medals.silver + medals.bronze]);
                     });
                     const ws = XLSX.utils.aoa_to_sheet(aoa);
                     ws['!cols'] = [{wch:5},{wch:40},{wch:5},{wch:5},{wch:5},{wch:10}];
                     XLSX.utils.book_append_sheet(wb, ws, reportTitle);
                     break;
                }
                case 'medalsWithAthletes': {
                     type MedalCounts = { gold: number, silver: number, bronze: number }; type Win = { eventName: string, rank: number, time: number }; type AthleteWins = { swimmer: Swimmer, wins: Win[] }; type ClubData = { medals: MedalCounts, athletes: Record<string, AthleteWins> };
                    const clubDataRecalc: Record<string, ClubData> = {}; (swimmers as Swimmer[]).forEach((s: Swimmer) => { if (!clubDataRecalc[s.club]) { clubDataRecalc[s.club] = { medals: { gold: 0, silver: 0, bronze: 0 }, athletes: {} }; }});
// FIX: Added explicit types to parameters in array methods to ensure correct type inference.
                    (events as SwimEvent[]).forEach((event: SwimEvent) => { if (!event.results) return; [...(event.results as Result[])].filter((r: Result) => r.time > 0).sort((a: Result, b: Result) => a.time - b.time).slice(0, 3).forEach((result: Result, i: number) => { const rank = i + 1; const swimmer = swimmersMap.get(result.swimmerId); if (swimmer) { const club = clubDataRecalc[swimmer.club]; if (rank === 1) club.medals.gold++; else if (rank === 2) club.medals.silver++; else if (rank === 3) club.medals.bronze++; if (!club.athletes[swimmer.id]) { club.athletes[swimmer.id] = { swimmer, wins: [] }; } club.athletes[swimmer.id].wins.push({ eventName: formatEventName(event), rank, time: result.time }); } }); });
                    const sortedData = Object.entries(clubDataRecalc).sort(([cA, a], [cB, b]) => b.medals.gold - a.medals.gold || b.medals.silver - a.medals.silver || b.medals.bronze - a.medals.bronze || cA.localeCompare(cB));

                    // FIX: Explicitly type `aoa` to allow mixed content types (string, number).
                    let aoa: (string | number | null | undefined)[][] = createHeaderAoa(reportTitle);
                    sortedData.forEach(([clubName, clubData]) => {
                         const athletesWithWins = Object.values(clubData.athletes).filter((a: AthleteWins) => a.wins.length > 0);
                         if (athletesWithWins.length === 0) return;
                         aoa.push([]);
                         aoa.push([clubName, `🥇${clubData.medals.gold}`, `🥈${clubData.medals.silver}`, `🥉${clubData.medals.bronze}`]);
                         aoa.push(['Nama Atlet', 'Nomor Lomba yang Dimenangkan']);
                         athletesWithWins.forEach(({ swimmer, wins }) => {
                            aoa.push([swimmer.name]);
                            wins.sort((a,b)=>a.rank-b.rank).forEach(win => {
                                aoa.push(['', `${win.rank === 1 ? '🥇' : win.rank === 2 ? '🥈' : '🥉'} ${win.eventName} - ${formatTime(win.time)}`]);
                            });
                         });
                    });
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    ws['!cols'] = [{wch:30},{wch:60}];
                    XLSX.utils.book_append_sheet(wb, ws, reportTitle);
                    break;
                }
                case 'individualMedals': {
                    const individualMedals: Record<string, { swimmer: Swimmer, gold: number, silver: number, bronze: number }> = {};
// FIX: Added explicit types to parameters in array methods to ensure correct type inference.
                    (events as SwimEvent[]).forEach((event: SwimEvent) => { if (event.results && event.results.length > 0 && event.gender !== Gender.MIXED) { [...(event.results as Result[])].filter((r: Result) => r.time > 0).sort((a: Result, b: Result) => a.time - b.time).slice(0, 3).forEach((result: Result, i: number) => { const rank = i + 1; const swimmer = swimmersMap.get(result.swimmerId); if (swimmer) { if (!individualMedals[swimmer.id]) { individualMedals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 }; } if (rank === 1) individualMedals[swimmer.id].gold++; else if (rank === 2) individualMedals[swimmer.id].silver++; else if (rank === 3) individualMedals[swimmer.id].bronze++; } }); } });
                    const sortedStandings = Object.values(individualMedals).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.swimmer.name.localeCompare(b.swimmer.name));
                    const maleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Male');
                    const femaleStandings = sortedStandings.filter(s => s.swimmer.gender === 'Female');
                     
                    const maleData = maleStandings.map((s: any, i: number) => ({'#':i+1, 'Nama':s.swimmer.name, 'Klub':s.swimmer.club, '🥇':s.gold, '🥈':s.silver, '🥉':s.bronze}));
                    const femaleData = femaleStandings.map((s: any, i: number) => ({'#':i+1, 'Nama':s.swimmer.name, 'Klub':s.swimmer.club, '🥇':s.gold, '🥈':s.silver, '🥉':s.bronze}));
                    
                    const ws_male = XLSX.utils.json_to_sheet(maleData); ws_male['!cols'] = [{wch:5},{wch:30},{wch:30},{wch:5},{wch:5},{wch:5}];
                    const ws_female = XLSX.utils.json_to_sheet(femaleData); ws_female['!cols'] = [{wch:5},{wch:30},{wch:30},{wch:5},{wch:5},{wch:5}];
                    
                    XLSX.utils.book_append_sheet(wb, ws_male, 'Putra');
                    XLSX.utils.book_append_sheet(wb, ws_female, 'Putri');
                    break;
                }
                case 'individualMedalsByCategory': {
                    type Standing = { swimmer: Swimmer, gold: number, silver: number, bronze: number };
                    const medalsByAgeGroup: Record<string, Record<string, Standing>> = {};
// FIX: Added explicit types to parameters in array methods to ensure correct type inference.
                    (events as SwimEvent[]).forEach((event: SwimEvent) => { if (event.results && event.results.length > 0 && event.gender !== Gender.MIXED) { [...(event.results as Result[])].filter((r: Result) => r.time > 0).sort((a: Result, b: Result) => a.time - b.time).slice(0, 3).forEach((result: Result, i: number) => { const rank = i + 1; const swimmer = swimmersMap.get(result.swimmerId); if (swimmer) { const ageGroup = swimmer.ageGroup || 'Umum'; if (!medalsByAgeGroup[ageGroup]) medalsByAgeGroup[ageGroup] = {}; if (!medalsByAgeGroup[ageGroup][swimmer.id]) { medalsByAgeGroup[ageGroup][swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 }; } if (rank === 1) medalsByAgeGroup[ageGroup][swimmer.id].gold++; else if (rank === 2) medalsByAgeGroup[ageGroup][swimmer.id].silver++; else if (rank === 3) medalsByAgeGroup[ageGroup][swimmer.id].bronze++; } }); } });
                    const finalData = Object.entries(medalsByAgeGroup).map(([ageGroup, swimmersMedals]) => {
                        const sorted = Object.values(swimmersMedals).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.swimmer.name.localeCompare(b.swimmer.name));
                        return { ageGroup, maleStandings: sorted.filter(s => s.swimmer.gender === 'Male'), femaleStandings: sorted.filter(s => s.swimmer.gender === 'Female') };
                    }).sort((a, b) => a.ageGroup.localeCompare(b.ageGroup));

                    finalData.forEach(cat => {
                       const maleData = cat.maleStandings.map((s,i) => ({'#':i+1, 'Nama':s.swimmer.name, 'Klub':s.swimmer.club, '🥇':s.gold, '🥈':s.silver, '🥉':s.bronze}));
                       const femaleData = cat.femaleStandings.map((s,i) => ({'#':i+1, 'Nama':s.swimmer.name, 'Klub':s.swimmer.club, '🥇':s.gold, '🥈':s.silver, '🥉':s.bronze}));
                       const aoa = [
                           ['Klasemen Putra'],
                           ['#', 'Nama Atlet', 'Nama Tim', '🥇', '🥈', '🥉'],
                           ...maleData.map(d => [d['#'], d.Nama, d.Klub, d['🥇'], d['🥈'], d['🥉']]),
                           [],
                           ['Klasemen Putri'],
                           ['#', 'Nama Atlet', 'Nama Tim', '🥇', '🥈', '🥉'],
                           ...femaleData.map(d => [d['#'], d.Nama, d.Klub, d['🥇'], d['🥈'], d['🥉']])
                       ];
                       const ws_cat = XLSX.utils.aoa_to_sheet(aoa);
                       ws_cat['!cols'] = [{wch:5},{wch:30},{wch:30},{wch:5},{wch:5},{wch:5}];
                       XLSX.utils.book_append_sheet(wb, ws_cat, cat.ageGroup.replace(/[/\\?%*:|"[\]]/g, '-'));
                    });
                    break;
                }
                case 'brokenRecords': {
                    if (brokenRecords.length > 0) {
                        const data = brokenRecords.map((br: BrokenRecord) => ({ 'Nomor Lomba': br.newEventName, 'Rekor Baru': formatTime(br.newTime), 'Pemegang Rekor Baru': br.newHolder.name, 'Klub': br.newHolder.club, 'Rekor Lama': formatTime(br.record.time), 'Pemegang Rekor Lama': br.record.holderName, 'Tipe Rekor': br.record.type }));
                        const ws = XLSX.utils.json_to_sheet(data);
                        ws['!cols'] = [{wch:40},{wch:15},{wch:30},{wch:30},{wch:15},{wch:30},{wch:15}];
                        XLSX.utils.book_append_sheet(wb, ws, reportTitle);
                    }
                    break;
                }
            }

            if (wb.SheetNames.length > 0) {
                XLSX.writeFile(wb, `${reportTitle.replace(/[\/\\?%*:|"<>]/g, '-')}.xlsx`);
            } else {
                 addNotification('Tidak ada data untuk diunduh untuk laporan ini.', 'info');
            }
        } catch (error: any) {
            console.error("Gagal membuat file Excel:", error);
            addNotification(`Gagal membuat file Excel: ${error.message || 'Unknown error'}`, 'error');
        } finally {
            setIsDownloadingExcel(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="no-print space-y-4 mb-6">
                <h1 className="text-3xl font-bold">Cetak & Unduh Laporan</h1>
                <div className="bg-surface p-4 rounded-lg border border-border flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            <Button variant={activeReport === 'schedule' ? 'primary' : 'secondary'} onClick={() => setActiveReport('schedule')}>Susunan Acara</Button>
                            <Button variant={activeReport === 'program' ? 'primary' : 'secondary'} onClick={() => setActiveReport('program')}>Buku Acara</Button>
                            <Button variant={activeReport === 'results' ? 'primary' : 'secondary'} onClick={() => setActiveReport('results')}>Buku Hasil</Button>
                            <Button variant={activeReport === 'medals' ? 'primary' : 'secondary'} onClick={() => setActiveReport('medals')}>Rekap Medali Klub</Button>
                            <Button variant={activeReport === 'medalsWithAthletes' ? 'primary' : 'secondary'} onClick={() => setActiveReport('medalsWithAthletes')}>Rekap Medali Klub & Atlet</Button>
                            <Button variant={activeReport === 'individualMedals' ? 'primary' : 'secondary'} onClick={() => setActiveReport('individualMedals')}>Rekap Medali Atlet (Total)</Button>
                            <Button variant={activeReport === 'individualMedalsByCategory' ? 'primary' : 'secondary'} onClick={() => setActiveReport('individualMedalsByCategory')}>Klasemen Perorangan (Kategori)</Button>
                            <Button variant={activeReport === 'brokenRecords' ? 'primary' : 'secondary'} onClick={() => setActiveReport('brokenRecords')}>Rekor Terpecahkan</Button>
                        </div>
                        <div className="flex space-x-2">
                             <Button onClick={handleDownloadExcel} variant="secondary" className="flex items-center space-x-2" disabled={isDownloadingExcel}>
                                {isDownloadingExcel ? <Spinner/> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                                <span>Unduh Excel</span>
                            </Button>
                            <Button onClick={handlePrint} className="flex items-center space-x-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                <span>Cetak / PDF</span>
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-border">
                        {['schedule', 'program', 'results'].includes(activeReport) && (
                            <div>
                                <label htmlFor="session-filter" className="text-sm font-medium text-text-secondary">Filter Sesi</label>
                                <select 
                                    id="session-filter"
                                    value={selectedSession} 
                                    onChange={(e) => setSelectedSession(Number(e.target.value))}
                                    className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={selectedEventIds.length > 0}
                                    title={selectedEventIds.length > 0 ? 'Filter sesi dinonaktifkan saat nomor lomba spesifik dipilih' : 'Pilih sesi untuk dicetak'}
                                >
                                    <option value={0}>Semua Sesi</option>
                                    {sessionOptions.map(s => (
                                        <option key={s} value={s}>Sesi {romanize(s)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                         {['program', 'results'].includes(activeReport) && (
                            <div className="flex-grow max-w-md">
                                <div className="flex justify-between items-center mb-1">
                                    <label htmlFor="event-filter-container" className="text-sm font-medium text-text-secondary">Pilih Nomor Lomba untuk Dicetak</label>
                                    {selectedEventIds.length > 0 && (
                                        <button onClick={() => setSelectedEventIds([])} className="text-xs text-blue-500 hover:underline">Reset Pilihan</button>
                                    )}
                                </div>
                                <div id="event-filter-container" className="w-full bg-background border border-border rounded-md p-2 text-sm h-40 overflow-y-auto space-y-1">
                                    {eventsWithGlobalNumbers.map(event => (
                                        <div key={event.id} className="flex items-center p-1 rounded hover:bg-surface">
                                            <input
                                                type="checkbox"
                                                id={`event-checkbox-${event.id}`}
                                                value={event.id}
                                                checked={selectedEventIds.includes(event.id)}
                                                onChange={(e) => {
                                                    const eventId = e.target.value;
                                                    setSelectedEventIds(prev => 
                                                        prev.includes(eventId) 
                                                            ? prev.filter(id => id !== eventId) 
                                                            : [...prev, eventId]
                                                    );
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <label htmlFor={`event-checkbox-${event.id}`} className="ml-2 text-text-primary select-none cursor-pointer flex-grow">
                                                {`No. ${event.globalEventNumber}: ${formatEventName(event)}`}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-grow bg-gray-100 dark:bg-gray-900 overflow-auto p-4 md:p-8 print:p-0 print:bg-white print:overflow-visible">
                <div className="print-preview-content">
                    <ReportHeader info={competitionInfo} title={getReportTitle()} />
                    
                    {activeReport === 'schedule' && <ScheduleOfEvents events={eventsToDisplay} />}
                    {activeReport === 'program' && <ProgramBook events={eventsToDisplay} swimmers={swimmers} info={competitionInfo} records={records} />}
                    {activeReport === 'results' && <EventResults events={eventsToDisplay} swimmers={swimmers} info={competitionInfo} records={records} brokenRecords={brokenRecords} />}
                    {activeReport === 'medals' && <ClubMedalStandings events={events} swimmers={swimmers} info={competitionInfo} />}
                    {activeReport === 'medalsWithAthletes' && <ClubMedalStandingsWithAthletes events={events} swimmers={swimmers} />}
                    {activeReport === 'individualMedals' && <IndividualMedalStandings events={events} swimmers={swimmers} />}
                    {activeReport === 'individualMedalsByCategory' && <IndividualMedalStandingsByCategory events={events} swimmers={swimmers} />}
                    {activeReport === 'brokenRecords' && <BrokenRecordsReport brokenRecords={brokenRecords} />}


                    <ReportFooter info={competitionInfo} />
                </div>
            </div>
        </div>
    );
};