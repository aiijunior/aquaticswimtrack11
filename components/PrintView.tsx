import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender } from '../constants';
import { getRecords } from '../services/databaseService';

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
    if (ms === 0) return '99:99.99';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const formatDifferenceTime = (ms: number): string => {
    if (isNaN(ms)) return 'N/A';
    const sign = ms < 0 ? '-' : '+';
    const absMs = Math.abs(ms);
    const totalSeconds = absMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = absMs % 1000;
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
    return `${sign}${formattedTime}`;
};

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
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

const ScheduleOfEvents: React.FC<{ events: SwimEvent[] }> = ({ events }) => {
    const processedData = useMemo(() => {
        let globalEventCounter = 1;
        const scheduledEvents: SwimEvent[] = events
            .filter((e: SwimEvent) => e.sessionNumber && e.sessionNumber > 0 && e.sessionDateTime)
            .sort((a, b) => {
                const dateA = new Date(a.sessionDateTime!).getTime();
                const dateB = new Date(b.sessionDateTime!).getTime();
                if (dateA !== dateB) return dateA - dateB;
                
                const sessionDiff = (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                if (sessionDiff !== 0) return sessionDiff;
                
                return (a.heatOrder ?? 0) - (b.heatOrder ?? 0);
            });

        const groupedByDate = scheduledEvents.reduce((acc: Record<string, SwimEvent[]>, event: SwimEvent) => {
            const dateStr = new Date(event.sessionDateTime!).toLocaleDateString('id-ID', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {} as Record<string, SwimEvent[]>);

        return Object.entries(groupedByDate).map(([date, dateEvents]) => {
            const groupedBySession = dateEvents.reduce((acc: Record<string, (SwimEvent & { globalEventNumber: number })[]>, event: SwimEvent) => {
                const sessionName = `Sesi ${romanize(event.sessionNumber!)}`;
                if (!acc[sessionName]) acc[sessionName] = [];
                acc[sessionName].push({ ...event, globalEventNumber: globalEventCounter++ });
                return acc;
            }, {} as Record<string, (SwimEvent & { globalEventNumber: number })[]>);
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

const ProgramBook: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[] }> = ({ events, swimmers, info, records }) => {
    const data = useMemo(() => {
        let globalEventCounter = 1;
        const scheduledEvents = events
            .filter((e: SwimEvent) => e.sessionNumber && e.sessionNumber > 0)
            .sort((a, b) => {
                const sessionDiff = (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                if (sessionDiff !== 0) return sessionDiff;
                return (a.heatOrder ?? 0) - (b.heatOrder ?? 0);
            });
        
        return scheduledEvents.reduce((acc: Record<string, (SwimEvent & { detailedEntries: Entry[], globalEventNumber: number })[]>, event: SwimEvent) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber!)}`;
            if (!acc[sessionName]) acc[sessionName] = [];
            
            // FIX: Explicitly type the 'entry' parameter to resolve 'unknown' type error.
            const eventEntries = (event.entries as EventEntry[]).map((entry: EventEntry) => {
                const swimmer = swimmers.find(s => s.id === entry.swimmerId);
                return swimmer ? { ...entry, swimmer } : null;
            }).filter((e): e is Entry => e !== null);

            if (eventEntries.length > 0) {
                 acc[sessionName].push({ ...event, detailedEntries: eventEntries, globalEventNumber: globalEventCounter++ });
            }
            return acc;
        }, {} as Record<string, (SwimEvent & { detailedEntries: Entry[], globalEventNumber: number })[]>);
    }, [events, swimmers]);

    if (Object.keys(data).length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;

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
                        {sessionEvents.map(event => {
                            const lanes = info.numberOfLanes || 8;
                            const heats = generateHeats(event.detailedEntries, lanes);
                            const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const isRelay = event.relayLegs && event.relayLegs > 1;
                            
                            return (
                                <section key={event.id} className="mb-6 print-event-section">
                                    <h4 className="text-lg font-semibold bg-gray-100 p-2 rounded-t-md border-b-2 border-gray-400">
                                       {`Nomor Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                                    </h4>
                                    <div className="text-xs text-gray-600 my-2 px-2 border-l-2 border-gray-300 space-y-1">
                                        <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                                        <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                                    </div>
                                    {heats.map((heat) => (
                                        <div key={heat.heatNumber} className="mt-3">
                                            <h5 className="font-bold text-center mb-1">Seri {heat.heatNumber} dari {heats.length}</h5>
                                            <table className="w-full text-left text-sm">
                                                <colgroup>
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '30%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '27%' }} />
                                                    <col style={{ width: '15%' }} />
                                                </colgroup>
                                                <thead><tr><th>Lane</th><th>Nama</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu Unggulan</th></tr></thead>
                                                <tbody>
                                                    {Array.from({ length: lanes }, (_, i) => i + 1).map(lane => {
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
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                );
            })}
        </main>
    );
};

const EventResults: React.FC<{ events: (SwimEvent & { globalEventNumber: number })[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[], brokenRecords: BrokenRecord[] }> = ({ events, swimmers, info, records, brokenRecords }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        return events
            .map((event) => {
                const getPenalty = (time: number) => {
                    if (time > 0) return 0; // Valid time
                    if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                    if (time === -2) return 2; // NS
                    return 3; // Not yet recorded (NT) or 0
                };
                
                const validResultsForRanking = [...(event.results as Result[])]
                    .filter(r => r.time > 0)
                    .sort((a, b) => a.time - b.time);
    
                const sortedResults = [...(event.results as Result[])]
                    // FIX: Add explicit type annotation to sort callback parameters to resolve 'unknown' type.
                    .sort((a: Result,b: Result) => {
                        if (a.time > 0 && b.time > 0) return a.time - b.time;
                        return getPenalty(a.time) - getPenalty(b.time);
                    })
                    // FIX: Add explicit type annotation to map callback parameter to resolve 'unknown' type.
                    .map((r: Result) => {
                        const swimmer = swimmersMap.get(r.swimmerId);
                        // Correctly find rank among valid finishers
                        const rank = r.time > 0 ? validResultsForRanking.findIndex(vr => vr.swimmerId === r.swimmerId) + 1 : 0;
                        const recordsBroken = brokenRecords.filter(br => br.newHolder.id === swimmer?.id && br.newTime === r.time && br.record.style === event.style && br.record.distance === event.distance);
                        return ({ ...r, rank, swimmer, recordsBroken });
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
                            <thead><tr><th className="text-center">Rank</th><th>Nama Atlet</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu</th><th className="text-center">Medali</th></tr></thead>
                            <tbody>
                                {event.sortedResults.map(res => {
                                    let rankClass = '';
                                    if (res.rank === 1) rankClass = 'print-gold-medal';
                                    else if (res.rank === 2) rankClass = 'print-silver-medal';
                                    else if (res.rank === 3) rankClass = 'print-bronze-medal';

                                    return (
                                        <tr key={res.swimmerId} className={rankClass}>
                                            <td className="text-center font-bold">{res.rank > 0 ? res.rank : '-'}</td>
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
                    </section>
                );
            })}
        </main>
    );
};

const ClubMedalStandings: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo }> = ({ events, swimmers, info }) => {
    const data = useMemo(() => {
        // Initialize clubMedals with all unique clubs from the swimmers list.
        const allClubs = [...new Set(swimmers.map(s => s.club))];
        const clubMedals: Record<string, { gold: number, silver: number, bronze: number }> = allClubs.reduce((acc, club) => {
            acc[club] = { gold: 0, silver: 0, bronze: 0 };
            return acc;
        }, {} as Record<string, { gold: number, silver: number, bronze: number }>);
        
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        // Tally medals for clubs that have won.
        events.forEach((event: SwimEvent) => {
            if (!event.results) return;
            [...(event.results as Result[])]
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time)
                .slice(0, 3)
                .forEach((result: Result, i: number) => {
                    const rank = i + 1;
                    const swimmer = swimmersMap.get(result.swimmerId);
                    // The club is guaranteed to exist in clubMedals from the initialization step.
                    if (swimmer) {
                        if (rank === 1) clubMedals[swimmer.club].gold++;
                        else if (rank === 2) clubMedals[swimmer.club].silver++;
                        else if (rank === 3) clubMedals[swimmer.club].bronze++;
                    }
                });
        });

        // Sort by medal count, then alphabetically by club name as a tie-breaker.
        return Object.entries(clubMedals).sort(([clubA, a]: [string, { gold: number, silver: number, bronze: number }], [clubB, b]: [string, { gold: number, silver: number, bronze: number }]) => 
            b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || clubA.localeCompare(clubB)
        );
    }, [events, swimmers]);

    const grandTotal = useMemo(() => {
        // FIX: Add explicit type annotations to reduce callback parameters to resolve 'unknown' type error.
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
                </tbody>
                <tfoot>
                    <tr className="font-bold border-t-2 border-gray-400 bg-gray-100">
                        <td colSpan={2} className="text-center p-2">TOTAL KESELURUHAN</td>
                        <td className="text-center">{grandTotal.gold}</td>
                        <td className="text-center">{grandTotal.silver}</td>
                        <td className="text-center">{grandTotal.bronze}</td>
                        <td className="text-center">{grandTotal.gold + grandTotal.silver + grandTotal.bronze}</td>
                    </tr>
                </tfoot>
            </table>
        </main>
    );
};

interface TieBreakerDetail {
    eventName: string;
    resultTime: number;
    nationalRecordTime: number | null;
    closeness: number;
}
interface IndividualStandingData {
    swimmer: Swimmer;
    gold: number;
    silver: number;
    bronze: number;
    tiebreakerScore: number;
    tiebreakerDetails: TieBreakerDetail[];
}

const TieBreakerAnalysisTable: React.FC<{ tiedAthletes: IndividualStandingData[]; rankStart: number; }> = ({ tiedAthletes, rankStart }) => {
    const rankEnd = rankStart + tiedAthletes.length - 1;
    const title = `Analisis Tie-Breaker untuk Peringkat ${rankStart}${rankStart !== rankEnd ? `-${rankEnd}` : ''}`;

    return (
        <div className="my-4 p-4 border-2 border-dashed border-primary/50 bg-primary/10 rounded-lg print-event-section">
            <h4 className="font-bold text-center text-primary">{title}</h4>
            <p className="text-xs text-center text-text-secondary mb-2">Peringkat ditentukan berdasarkan rata-rata persentase kedekatan waktu hasil dengan Rekor Nasional. Persentase lebih tinggi lebih baik.</p>
            <table className="w-full text-left text-xs mt-2">
                <thead className="bg-primary/20">
                    <tr>
                        <th className="p-1">Nama Atlet</th>
                        <th className="p-1">Nomor Lomba</th>
                        <th className="p-1 text-right">Waktu Hasil</th>
                        <th className="p-1 text-right">Rekor Nasional</th>
                        <th className="p-1 text-right">Selisih</th>
                        <th className="p-1 text-right">% Kedekatan</th>
                    </tr>
                </thead>
                <tbody>
                    {tiedAthletes.map((athlete, athleteIdx) => (
                        <React.Fragment key={athlete.swimmer.id}>
                            {athlete.tiebreakerDetails.map((detail, detailIdx) => (
                                <tr key={detailIdx} className={athleteIdx % 2 !== 0 ? 'bg-primary/5' : ''}>
                                    {detailIdx === 0 && (
                                        <td rowSpan={athlete.tiebreakerDetails.length || 1} className="font-semibold p-1 align-top">
                                            {athlete.swimmer.name}
                                        </td>
                                    )}
                                    <td className="p-1">{detail.eventName}</td>
                                    <td className="p-1 text-right font-mono">{formatTime(detail.resultTime)}</td>
                                    <td className="p-1 text-right font-mono">{detail.nationalRecordTime ? formatTime(detail.nationalRecordTime) : 'N/A'}</td>
                                    <td className="p-1 text-right font-mono">
                                        {detail.nationalRecordTime ? formatDifferenceTime(detail.resultTime - detail.nationalRecordTime) : 'N/A'}
                                    </td>
                                    <td className="p-1 text-right font-mono">{detail.closeness > 0 ? `${detail.closeness.toFixed(2)}%` : 'N/A'}</td>
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
                <tfoot className="font-semibold text-text-primary bg-primary/20">
                    {tiedAthletes.map(athlete => (
                        <tr key={athlete.swimmer.id}>
                            <td className="p-1 text-right" colSpan={5}>Rata-rata Skor Kedekatan untuk {athlete.swimmer.name}:</td>
                            <td className="p-1 text-right font-mono">{athlete.tiebreakerScore.toFixed(2)}%</td>
                        </tr>
                    ))}
                </tfoot>
            </table>
        </div>
    );
};


const IndividualStandings: React.FC<{ events: SwimEvent[]; swimmers: Swimmer[]; info: CompetitionInfo; records: SwimRecord[] }> = ({ events, swimmers, info, records }) => {
    const processedData = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        const nationalRecordsMap = new Map(
            records.filter(r => r.type === RecordType.NASIONAL).map(r => {
                const key = `${r.gender}_${r.distance}_${r.style}_${r.category ?? null}_${r.relayLegs ?? null}`;
                return [key, r];
            })
        );

        const individualData: Record<string, IndividualStandingData> = {};

        // 1. Calculate Medals
        // FIX: Add explicit type annotations to forEach and other callbacks to resolve 'unknown' type issues.
        events.filter(e => e.gender !== Gender.MIXED && e.results && e.results.length > 0).forEach((event: SwimEvent) => {
            [...(event.results as Result[])].filter((r: Result) => r.time > 0).sort((a: Result, b: Result) => a.time - b.time).slice(0, 3).forEach((result: Result, i: number) => {
                const rank = i + 1;
                const swimmer = swimmersMap.get(result.swimmerId);
                if (swimmer) {
                    if (!individualData[swimmer.id]) {
                        individualData[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0, tiebreakerScore: 0, tiebreakerDetails: [] };
                    }
                    if (rank === 1) individualData[swimmer.id].gold++;
                    else if (rank === 2) individualData[swimmer.id].silver++;
                    else if (rank === 3) individualData[swimmer.id].bronze++;
                }
            });
        });

        // 2. Calculate Tiebreaker scores for all athletes with medals
        // FIX: Add explicit type annotation to forEach callback parameter to resolve 'unknown' type.
        Object.values(individualData).forEach((data: IndividualStandingData) => {
            const swimmerId = data.swimmer.id;
            const relevantResults = events
                .map((e: SwimEvent) => ({ event: e, result: e.results.find((r: Result) => r.swimmerId === swimmerId && r.time > 0) }))
                .filter((item): item is { event: SwimEvent, result: Result } => !!item.result);

            let totalCloseness = 0;
            let comparableEventsCount = 0;

            data.tiebreakerDetails = relevantResults.map(item => {
                const { event, result } = item;
                const recordKey = `${event.gender}_${event.distance}_${event.style}_${event.category ?? null}_${event.relayLegs ?? null}`;
                const record = nationalRecordsMap.get(recordKey);
                let closeness = 0;
                if (record && record.time > 0 && result.time > 0) {
                    closeness = (record.time / result.time) * 100;
                    totalCloseness += closeness;
                    comparableEventsCount++;
                }
                return {
                    eventName: formatEventName(event),
                    resultTime: result.time,
                    nationalRecordTime: record ? record.time : null,
                    closeness: closeness,
                };
            });

            data.tiebreakerScore = comparableEventsCount > 0 ? totalCloseness / comparableEventsCount : 0;
        });

        // 3. Group by medal count
        const groupedByMedals: Record<string, IndividualStandingData[]> = {};
        Object.values(individualData).forEach((data: IndividualStandingData) => {
            const key = `g${data.gold}-s${data.silver}-b${data.bronze}`;
            if (!groupedByMedals[key]) groupedByMedals[key] = [];
            groupedByMedals[key].push(data);
        });

        const sortedGroups = Object.values(groupedByMedals).sort((groupA, groupB) => {
            const a = groupA[0]; const b = groupB[0];
            return b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
        });
        
        // Sort within each tied group by tiebreaker score
        // FIX: Add explicit type annotation to forEach callback parameter to resolve 'unknown' type.
        sortedGroups.forEach((group: IndividualStandingData[]) => {
            if (group.length > 1) {
                group.sort((a, b) => b.tiebreakerScore - a.tiebreakerScore);
            }
        });

        return {
            maleGroups: sortedGroups.map(group => group.filter(d => d.swimmer.gender === 'Male')).filter(g => g.length > 0),
            femaleGroups: sortedGroups.map(group => group.filter(d => d.swimmer.gender === 'Female')).filter(g => g.length > 0),
        };
    }, [events, swimmers, records]);

    if (processedData.maleGroups.length === 0 && processedData.femaleGroups.length === 0) return <p className="text-center text-text-secondary py-10">Belum ada medali perorangan yang diraih.</p>;
    
    const tieBreakerAnalyses: React.ReactNode[] = [];
    let maleRankCounter = 1;
    let femaleRankCounter = 1;

    return (
        <>
            <main>
                <section>
                    <h3 className="text-2xl font-bold text-center mb-4">Klasemen Perorangan Putra</h3>
                    <table className="w-full text-left text-sm">
                        <colgroup>
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '35%' }} />
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-300">
                                <th className="p-2 text-center">#</th>
                                <th className="p-2">Nama Atlet</th>
                                <th className="p-2">Nama Tim</th>
                                <th className="p-2 text-center">🥇</th>
                                <th className="p-2 text-center">🥈</th>
                                <th className="p-2 text-center">🥉</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.maleGroups.map((group) => {
                                if (group.length > 1) {
                                    tieBreakerAnalyses.push(<TieBreakerAnalysisTable key={`male-tie-${maleRankCounter}`} tiedAthletes={group} rankStart={maleRankCounter} />);
                                }
                                return group.map(d => (
                                    <tr key={d.swimmer.id} className="border-b border-gray-200 last:border-b-0">
                                        <td className="p-2 text-center font-bold">{maleRankCounter++}</td>
                                        <td className="p-2 font-semibold">{d.swimmer.name}</td>
                                        <td className="p-2">{d.swimmer.club}</td>
                                        <td className="p-2 text-center">{d.gold}</td>
                                        <td className="p-2 text-center">{d.silver}</td>
                                        <td className="p-2 text-center">{d.bronze}</td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                    {processedData.maleGroups.length === 0 && <p className="text-center text-gray-500 pt-4">Tidak ada data.</p>}
                </section>
                <section className="mt-8">
                    <h3 className="text-2xl font-bold text-center my-4">Klasemen Perorangan Putri</h3>
                     <table className="w-full text-left text-sm">
                        <colgroup>
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '35%' }} />
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-300">
                                <th className="p-2 text-center">#</th>
                                <th className="p-2">Nama Atlet</th>
                                <th className="p-2">Nama Tim</th>
                                <th className="p-2 text-center">🥇</th>
                                <th className="p-2 text-center">🥈</th>
                                <th className="p-2 text-center">🥉</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.femaleGroups.map((group) => {
                                 if (group.length > 1) {
                                    tieBreakerAnalyses.push(<TieBreakerAnalysisTable key={`female-tie-${femaleRankCounter}`} tiedAthletes={group} rankStart={femaleRankCounter} />);
                                }
                                return group.map(d => (
                                    <tr key={d.swimmer.id} className="border-b border-gray-200 last:border-b-0">
                                        <td className="p-2 text-center font-bold">{femaleRankCounter++}</td>
                                        <td className="p-2 font-semibold">{d.swimmer.name}</td>
                                        <td className="p-2">{d.swimmer.club}</td>
                                        <td className="p-2 text-center">{d.gold}</td>
                                        <td className="p-2 text-center">{d.silver}</td>
                                        <td className="p-2 text-center">{d.bronze}</td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                   {processedData.femaleGroups.length === 0 && <p className="text-center text-gray-500 pt-4">Tidak ada data.</p>}
                </section>
            </main>
            
            {tieBreakerAnalyses.length > 0 && (
                <section className="mt-8 pt-4 border-t-2 border-gray-400">
                    <h3 className="text-2xl font-bold my-4 text-center">Detail Analisis Tie-Breaker</h3>
                    {tieBreakerAnalyses}
                </section>
            )}
        </>
    );
};

const BrokenRecordsReport: React.FC<{ brokenRecords: BrokenRecord[], info: CompetitionInfo }> = ({ brokenRecords, info }) => {
    if (brokenRecords.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada rekor yang terpecahkan.</p>;
    }
    return (
        <main>
            <table className="w-full text-left text-sm">
                <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>Nomor Lomba & Tipe</th>
                        <th>Pemecah Rekor Baru</th>
                        <th className="text-right">Waktu Baru</th>
                        <th>Rekor Lama</th>
                        <th className="text-right">Waktu Lama</th>
                    </tr>
                </thead>
                <tbody>
                    {brokenRecords.map(({ record, newEventName, newHolder, newTime }, i) => (
                        <tr key={i} className="even:bg-gray-100">
                            <td>
                                <span className="font-bold">{newEventName}</span>
                                <br />
                                <span className={`record-badge ${record.type.toLowerCase()}`}>{record.type}</span>
                            </td>
                            <td>
                                <span className="font-semibold">{newHolder.name}</span>
                                <br />
                                <span className="text-text-secondary text-xs">{newHolder.club}</span>
                            </td>
                            <td className="text-right font-mono font-bold text-lg text-primary">{formatTime(newTime)}</td>
                            <td>
                                {record.holderName}
                                <br />
                                <span className="text-text-secondary text-xs">({record.yearSet})</span>
                            </td>
                            <td className="text-right font-mono line-through text-text-secondary">{formatTime(record.time)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </main>
    );
};

// FIX: Corrected the type of the `swimmers` prop from `SwimEvent[]` to `Swimmer[]`.
// FIX: Completed the implementation of the RekapJuaraPerKategori component.
const RekapJuaraPerKategori: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo }> = ({ events, swimmers, info }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        
        // Group events by category
        const eventsByCategory = events.reduce((acc, event) => {
            const category = event.category || 'Open'; // Group null/empty categories as 'Open'
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(event);
            return acc;
        }, {} as Record<string, SwimEvent[]>);

        // Process each category
        return Object.entries(eventsByCategory).map(([category, categoryEvents]) => {
            const winnersByEvent = categoryEvents
                .filter(event => event.results && event.results.length > 0)
                .map(event => {
                    const top3 = [...event.results]
                        .filter(r => r.time > 0)
                        .sort((a, b) => a.time - b.time)
                        .slice(0, 3)
                        .map((result, index) => {
                            const swimmer = swimmersMap.get(result.swimmerId);
                            return {
                                rank: index + 1,
                                swimmer,
                                time: result.time,
                            };
                        });

                    return {
                        eventName: formatEventName(event),
                        winners: top3,
                    };
                })
                .filter(e => e.winners.length > 0);
            
            return {
                category,
                eventsWithWinners: winnersByEvent,
            };
        }).filter(c => c.eventsWithWinners.length > 0).sort((a,b) => a.category.localeCompare(b.category));

    }, [events, swimmers]);

    if (data.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada juara untuk ditampilkan.</p>;
    }

    return (
        <main className="space-y-8">
            {data.map(({ category, eventsWithWinners }) => (
                <section key={category} className="print-event-section">
                    <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">
                        Juara Kategori: {category}
                    </h3>
                    {eventsWithWinners.map(({ eventName, winners }) => (
                        <div key={eventName} className="mb-4">
                            <h4 className="font-semibold text-lg">{eventName}</h4>
                            <table className="w-full text-left text-sm mt-1">
                                <colgroup>
                                    <col style={{ width: '10%' }} />
                                    <col style={{ width: '35%' }} />
                                    <col style={{ width: '35%' }} />
                                    <col style={{ width: '20%' }} />
                                </colgroup>
                                <tbody>
                                    {winners.map(({ rank, swimmer, time }) => (
                                        <tr key={rank}>
                                            <td className="font-bold text-center"><Medal rank={rank} /> {rank}</td>
                                            <td>{swimmer?.name}</td>
                                            <td>{swimmer?.club}</td>
                                            <td className="font-mono text-right">{formatTime(time)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </section>
            ))}
        </main>
    );
};
```