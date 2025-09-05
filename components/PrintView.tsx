import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender } from '../constants';
import { getRecords } from '../services/databaseService';
import { generateCoverImage } from '../services/geminiService';

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
    if (ms < 0) return 'DQ'
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
            <h1 className="text-3xl font-bold tracking-tight">{info.eventName}</h1>
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
        const scheduledEvents = events
            .filter(e => e.sessionNumber && e.sessionNumber > 0 && e.sessionDateTime)
            .sort((a, b) => {
                const dateA = new Date(a.sessionDateTime!).getTime();
                const dateB = new Date(b.sessionDateTime!).getTime();
                if (dateA !== dateB) return dateA - dateB;
                
                const sessionDiff = (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                if (sessionDiff !== 0) return sessionDiff;
                
                return (a.heatOrder ?? 0) - (b.heatOrder ?? 0);
            });

        const groupedByDate = scheduledEvents.reduce((acc, event) => {
            const dateStr = new Date(event.sessionDateTime!).toLocaleDateString('id-ID', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {} as Record<string, SwimEvent[]>);

        return Object.entries(groupedByDate).map(([date, dateEvents]) => {
            const groupedBySession = dateEvents.reduce((acc, event) => {
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
            .filter(e => e.sessionNumber && e.sessionNumber > 0)
            .sort((a, b) => {
                const sessionDiff = (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0);
                if (sessionDiff !== 0) return sessionDiff;
                return (a.heatOrder ?? 0) - (b.heatOrder ?? 0);
            });
        
        return scheduledEvents.reduce((acc, event) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber!)}`;
            if (!acc[sessionName]) acc[sessionName] = [];
            
            const eventEntries = event.entries.map(entry => {
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
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '35%' }} />
                                                    <col style={{ width: '35%' }} />
                                                    <col style={{ width: '20%' }} />
                                                </colgroup>
                                                <thead><tr><th>Lintasan</th><th>Nama</th><th>Klub</th><th className="text-right">Waktu Unggulan</th></tr></thead>
                                                <tbody>
                                                    {Array.from({ length: lanes }, (_, i) => i + 1).map(lane => {
                                                        const assignment = heat.assignments.find(a => a.lane === lane);
                                                        const displayName = assignment ? (isRelay ? assignment.entry.swimmer.club : assignment.entry.swimmer.name) : '-';
                                                        const displayClub = assignment ? assignment.entry.swimmer.club : '-';
                                                        return (
                                                            <tr key={lane}>
                                                                <td className="w-12 text-center font-bold">{lane}</td>
                                                                <td>{displayName}</td>
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

const EventResults: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[], brokenRecords: BrokenRecord[] }> = ({ events, swimmers, info, records, brokenRecords }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        return events
            .filter(e => e.results && e.results.length > 0)
            .map(event => ({
                ...event,
                sortedResults: [...event.results]
                    .sort((a,b) => {
                        if (a.time < 0) return 1; // DQ at the end
                        if (b.time < 0) return -1;
                        if (a.time === 0) return 1; // NT at the end
                        if (b.time === 0) return -1;
                        return a.time - b.time;
                    })
                    .map((r, i) => {
                        const swimmer = swimmersMap.get(r.swimmerId);
                        const recordsBroken = brokenRecords.filter(br => br.newHolder.id === swimmer?.id && br.newTime === r.time && br.record.style === event.style && br.record.distance === event.distance);
                        return ({ ...r, rank: r.time > 0 ? i + 1 : 0, swimmer, recordsBroken });
                    })
            }))
            .sort((a,b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || (a.heatOrder ?? 0) - (b.heatOrder ?? 0));
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
                            {formatEventName(event)}
                        </h3>
                         <div className="text-xs text-gray-600 mt-2 mb-2 px-2 border-l-2 border-gray-300 space-y-1">
                            <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                            <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                        </div>
                        <table className="w-full text-left text-sm mt-2">
                            <colgroup>
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '35%' }} />
                                <col style={{ width: '30%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '10%' }} />
                            </colgroup>
                            <thead><tr><th className="text-center">RANK</th><th>Nama</th><th>Klub</th><th className="text-right">Waktu</th><th className="text-center">Medali</th></tr></thead>
                            <tbody>
                                {event.sortedResults.map(res => (
                                    <tr key={res.swimmerId}>
                                        <td className="text-center font-bold">{res.rank > 0 ? res.rank : '-'}</td>
                                        <td>{res.swimmer?.name || 'N/A'}</td>
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
                                ))}
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
        const clubMedals: Record<string, { gold: number, silver: number, bronze: number }> = {};
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

        events.forEach(event => {
            if (!event.results) return;
            [...event.results]
                .filter(r => r.time > 0)
                .sort((a, b) => a.time - b.time)
                .slice(0, 3)
                .forEach((result, i) => {
                    const rank = i + 1;
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        if (!clubMedals[swimmer.club]) clubMedals[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                        if (rank === 1) clubMedals[swimmer.club].gold++;
                        else if (rank === 2) clubMedals[swimmer.club].silver++;
                        else if (rank === 3) clubMedals[swimmer.club].bronze++;
                    }
                });
        });
        return Object.entries(clubMedals).sort(([,a], [,b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
    }, [events, swimmers]);

    const grandTotal = useMemo(() => {
        return data.reduce((acc, [, medals]) => {
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
                <thead><tr><th className="text-center">#</th><th>Klub</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th><th className="text-center">Total</th></tr></thead>
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
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const nationalRecordsMap = new Map(
            records.filter(r => r.type === RecordType.NASIONAL).map(r => {
                const key = `${r.gender}_${r.distance}_${r.style}_${r.category ?? null}_${r.relayLegs ?? null}`;
                return [key, r];
            })
        );

        const individualData: Record<string, IndividualStandingData> = {};

        // 1. Calculate Medals
        events.filter(e => e.gender !== Gender.MIXED && e.results && e.results.length > 0).forEach(event => {
            [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time).slice(0, 3).forEach((result, i) => {
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
        Object.values(individualData).forEach(data => {
            const swimmerId = data.swimmer.id;
            const relevantResults = events
                .map(e => ({ event: e, result: e.results.find(r => r.swimmerId === swimmerId && r.time > 0) }))
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
        Object.values(individualData).forEach(data => {
            const key = `g${data.gold}-s${data.silver}-b${data.bronze}`;
            if (!groupedByMedals[key]) groupedByMedals[key] = [];
            groupedByMedals[key].push(data);
        });

        const sortedGroups = Object.values(groupedByMedals).sort((groupA, groupB) => {
            const a = groupA[0]; const b = groupB[0];
            return b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
        });
        
        // Sort within each tied group by tiebreaker score
        sortedGroups.forEach(group => {
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
                                <th className="p-2">Team/Klub</th>
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
                                <th className="p-2">Team/Klub</th>
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
const RekapJuaraPerKategori: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo }> = ({ events, swimmers, info }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        
        const getCategoryKey = (event: SwimEvent): string => {
            const category = event.category?.trim() || 'Umum';
            return category;
        };

        const eventsWithWinners = events
            .filter(e => e.results && e.results.length > 0)
            .map(event => ({
                ...event,
                winners: [...event.results]
                    .filter(r => r.time > 0)
                    .sort((a,b) => a.time - b.time)
                    .slice(0, 3)
                    .map((result, i) => ({
                        rank: i + 1,
                        time: result.time,
                        swimmer: swimmersMap.get(result.swimmerId)
                    })),
                categoryKey: getCategoryKey(event)
            }))
            .filter(e => e.winners.length > 0);
        
        const groupedByCategory = eventsWithWinners.reduce((acc, event) => {
            if (!acc[event.categoryKey]) {
                acc[event.categoryKey] = [];
            }
            acc[event.categoryKey].push(event);
            return acc;
        }, {} as Record<string, typeof eventsWithWinners>);

        return Object.entries(groupedByCategory).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
        
    }, [events, swimmers]);

    const hasData = data.length > 0;

    if (!hasData) return <p className="text-center text-text-secondary py-10">Tidak ada juara untuk ditampilkan.</p>;

    return (
        <main>
            {data.map(([categoryKey, categoryEvents]) => (
                <section key={categoryKey} className="mb-6">
                    <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">{categoryKey}</h3>
                    <div className="space-y-4">
                        {categoryEvents.sort((a,b) => formatEventName(a).localeCompare(formatEventName(b))).map(event => (
                            <div key={event.id}>
                                <h4 className="text-lg font-semibold">{formatEventName(event)}</h4>
                                <table className="w-full text-left text-sm mt-1">
                                    <colgroup>
                                        <col style={{ width: '15%' }} />
                                        <col style={{ width: '35%' }} />
                                        <col style={{ width: '35%' }} />
                                        <col style={{ width: '15%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th className="w-16">Peringkat</th>
                                            <th>Nama</th>
                                            <th>Klub</th>
                                            <th className="text-right">Waktu</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {event.winners.map(winner => (
                                            <tr key={winner.swimmer?.id}>
                                                <td className="font-bold text-center">{winner.rank} <Medal rank={winner.rank} /></td>
                                                <td>{winner.swimmer?.name || 'N/A'}</td>
                                                <td>{winner.swimmer?.club || 'N/A'}</td>
                                                <td className="text-right font-mono">{formatTime(winner.time)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </main>
    )
};

const ClubAthleteMedalRecap: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo, brokenRecords: BrokenRecord[], selectedClub: string }> = ({ events, swimmers, info, brokenRecords, selectedClub }) => {
    type MedalInfo = {
        club: string;
        event: string;
        athleteName: string;
        time: number;
        rank: number;
        recordBreakType: RecordType | null;
    };

    const data = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const allMedals: MedalInfo[] = [];

        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winners = [...event.results]
                    .filter(r => r.time > 0)
                    .sort((a, b) => a.time - b.time)
                    .slice(0, 3);

                winners.forEach((result, index) => {
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        const recordBreakInfo = brokenRecords.find(br =>
                            br.newHolder.id === swimmer.id &&
                            br.newTime === result.time &&
                            br.record.style === event.style &&
                            br.record.distance === event.distance &&
                            br.record.gender === event.gender &&
                            (br.record.category ?? null) === (event.category ?? null)
                        );

                        allMedals.push({
                            club: swimmer.club,
                            event: formatEventName(event),
                            athleteName: swimmer.name,
                            time: result.time,
                            rank: index + 1,
                            recordBreakType: recordBreakInfo ? recordBreakInfo.record.type : null
                        });
                    }
                });
            }
        });

        const groupedByClub = allMedals.reduce((acc, medal) => {
            if (!acc[medal.club]) acc[medal.club] = [];
            acc[medal.club].push(medal);
            return acc;
        }, {} as Record<string, MedalInfo[]>);

        let clubData = Object.entries(groupedByClub).map(([clubName, medals]) => {
            const counts = medals.reduce((acc, medal) => {
                if (medal.rank === 1) acc.gold++;
                else if (medal.rank === 2) acc.silver++;
                else if (medal.rank === 3) acc.bronze++;
                return acc;
            }, { gold: 0, silver: 0, bronze: 0 });

            const sortedMedals = medals.sort((a, b) => {
                const rankOrder: { [key: number]: number } = { 1: 1, 3: 2, 2: 3 };
                const rankA = rankOrder[a.rank] || 4;
                const rankB = rankOrder[b.rank] || 4;
                if (rankA !== rankB) return rankA - rankB;
                return a.event.localeCompare(b.event);
            });

            return { clubName, medals: sortedMedals, counts };
        });

        clubData.sort((a, b) => {
            return b.counts.gold - a.counts.gold ||
                   b.counts.silver - a.counts.silver ||
                   b.counts.bronze - a.counts.bronze ||
                   a.clubName.localeCompare(b.clubName);
        });
        
        if (selectedClub !== 'all') {
            return clubData.filter(d => d.clubName === selectedClub);
        }

        return clubData;

    }, [events, swimmers, brokenRecords, selectedClub]);

    if (data.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada data medali untuk ditampilkan.</p>;
    }

    return (
        <main>
            {data.map(({ clubName, medals, counts }) => (
                <section key={clubName} className="mb-8" style={{ pageBreakInside: 'avoid' }}>
                     <div className="my-2 bg-gray-200 text-black p-2 rounded-md flex justify-between items-center">
                        <h3 className="text-xl font-bold">{clubName}</h3>
                        <div className="text-sm font-semibold">
                            <span>🥇 Emas: {counts.gold}</span>
                            <span className="mx-2">|</span>
                            <span>🥈 Perak: {counts.silver}</span>
                            <span className="mx-2">|</span>
                            <span>🥉 Perunggu: {counts.bronze}</span>
                        </div>
                    </div>
                    <table className="w-full text-left text-sm">
                        <colgroup>
                            <col style={{ width: '5%' }} />
                            <col style={{ width: '35%' }} />
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '15%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>Nomor Lomba</th>
                                <th>Nama Atlet</th>
                                <th>Klub/Tim</th>
                                <th>Catatan Waktu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {medals.map((medal, index) => (
                                <tr key={index}>
                                    <td className="text-center">{index + 1}</td>
                                    <td>
                                        {medal.rank === 1 ? '🥇 ' : medal.rank === 2 ? '🥈 ' : '🥉 '}
                                        {medal.event}
                                    </td>
                                    <td>{medal.athleteName}</td>
                                    <td>{medal.club}</td>
                                    <td>
                                        <span className="font-mono">{formatTime(medal.time)}</span>
                                        {medal.recordBreakType && <span className={`record-badge ${medal.recordBreakType.toLowerCase()}`}>{medal.recordBreakType}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ))}
        </main>
    );
};


// --- MAIN VIEW COMPONENT ---
type PrintTab = 'scheduleOfEvents' | 'programBook' | 'eventResults' | 'clubStandings' | 'individualStandings' | 'brokenRecords' | 'rekapJuaraKategori' | 'clubAthleteRecap' | 'cover';

const PRINT_TITLES: Record<PrintTab, string> = {
    scheduleOfEvents: 'Susunan Acara',
    programBook: 'Buku Acara',
    eventResults: 'Hasil Lomba per Nomor',
    clubStandings: 'Rekapitulasi Medali Klub',
    individualStandings: 'Klasemen Medali Perorangan',
    brokenRecords: 'Daftar Rekor Terpecahkan',
    rekapJuaraKategori: 'Rekapitulasi Juara per Kategori',
    clubAthleteRecap: 'Rekapitulasi Medali Klub & Atlet',
    cover: 'Buat Sampul AI'
};


export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [activeTab, setActiveTab] = useState<PrintTab>('scheduleOfEvents');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedEventIdForPrint, setSelectedEventIdForPrint] = useState<string>('all');
    const [selectedClubForRecap, setSelectedClubForRecap] = useState<string>('all');
    
    // State for AI Cover Generation
    const [generatedCover, setGeneratedCover] = useState<string | null>(null);
    const [isGeneratingCover, setIsGeneratingCover] = useState(false);
    const [coverType, setCoverType] = useState<'event' | 'results' | null>(null);
    const [coverError, setCoverError] = useState<string | null>(null);


    const eventsWithResults = useMemo(() => events.filter(e => e.results && e.results.length > 0), [events]);
    
    const uniqueClubs = useMemo(() => {
        const clubs = new Set(swimmers.map(s => s.club));
        return Array.from(clubs).sort();
    }, [swimmers]);
    
    useEffect(() => {
        getRecords().then(setRecords);
    }, []);

    const brokenRecords = useMemo(() => {
        if (!records.length || !events.length || !swimmers.length) return [];
        
        const calculated: BrokenRecord[] = [];
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

        events.forEach(event => {
            if (!event.results || event.results.length === 0) return;
            const winner = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time)[0];
            
            if (winner) {
                const winnerSwimmer = swimmersMap.get(winner.swimmerId);
                if (winnerSwimmer) {
                    const checkRecord = (type: string) => {
                         const recordToCompare = records.find(r => 
                            r.type.toUpperCase() === type.toUpperCase() &&
                            r.gender === event.gender &&
                            r.distance === event.distance &&
                            r.style === event.style &&
                            (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
                            (r.category ?? null) === (event.category ?? null)
                        );

                        if (recordToCompare && winner.time < recordToCompare.time) {
                            calculated.push({
                                record: recordToCompare,
                                newEventName: formatEventName(event),
                                newHolder: winnerSwimmer,
                                newTime: winner.time,
                            });
                        }
                    };
                    checkRecord(RecordType.PORPROV);
                    checkRecord(RecordType.NASIONAL);
                }
            }
        });
         // Deduplicate
        return [...new Map(calculated.map(item => [item.record.id, item])).values()];
    }, [events, swimmers, records]);
    
    // --- AI Cover Generation Logic ---
    const handleGenerateCover = async (type: 'event' | 'results') => {
        if (!competitionInfo) {
            setCoverError("Informasi kompetisi tidak tersedia.");
            return;
        }
        setIsGeneratingCover(true);
        setCoverType(type);
        setCoverError(null);
        setGeneratedCover(null);

        const eventDateStr = new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

        const basePrompt = `Buat gambar sampul artistik dan profesional untuk sebuah kompetisi renang. Tema visual harus modern, dinamis, dan berhubungan dengan air atau renang, seperti percikan air, perenang bergaya, atau lintasan kolam renang. Gunakan palet warna biru dan aqua yang menarik. Integrasikan logo acara dan sponsor secara alami ke dalam desain. Sertakan teks berikut dengan tipografi yang jelas dan mudah dibaca:\n- Judul Utama: "${competitionInfo.eventName}"\n- Tanggal: "${eventDateStr}"`;
        
        const prompt = type === 'event' 
            ? `${basePrompt}\n\nFokus sampul ini adalah untuk promosi acara dan buku acara (start list). Desain harus terasa energik dan mengundang. Tambahkan sub-judul "BUKU ACARA".`
            : `${basePrompt}\n\nFokus sampul ini adalah untuk laporan hasil akhir kompetisi. Desain harus terasa lebih formal dan merayakan pencapaian, mungkin dengan elemen medali atau piala. Palet warna bisa menggunakan emas, perak, dan biru tua. Tambahkan judul utama "HASIL AKHIR PERLOMBAAN" dan nama acara sebagai sub-judul.`;

        try {
            const imageBase64 = await generateCoverImage(prompt, competitionInfo.eventLogo, competitionInfo.sponsorLogo);
            setGeneratedCover(imageBase64);
        } catch (err: any) {
            setCoverError(err.message || 'Terjadi kesalahan yang tidak diketahui.');
        } finally {
            setIsGeneratingCover(false);
            setCoverType(null);
        }
    };
    
    const handlePrintCover = () => {
        if (!generatedCover) return;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head><title>Cetak Sampul</title>
                        <style>
                            @page { size: A4; margin: 0; }
                            body { margin: 0; padding: 0; }
                            img { width: 100vw; height: 100vh; object-fit: cover; }
                        </style>
                    </head>
                    <body><img src="${generatedCover}" onload="window.print(); setTimeout(function(){window.close();}, 100);" /></body>
                </html>
            `);
            printWindow.document.close();
        }
    };


    // --- EXCEL DOWNLOAD LOGIC ---
    const getExcelHeaderAOA = (reportTitle: string, numCols: number): { aoa: any[][], merges: any[], currentRow: number } => {
        if (!competitionInfo) return { aoa: [], merges: [], currentRow: 0 };
    
        const aoa: any[][] = [];
        const merges: any[] = [];
        let currentRow = 0;
    
        aoa.push([competitionInfo.eventName]);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: numCols - 1 } });
        currentRow++;
        const eventDateStr = competitionInfo.eventDate ? new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
        aoa.push([eventDateStr]);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: numCols - 1 } });
        currentRow++;
        aoa.push([reportTitle]);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: numCols - 1 } });
        currentRow++;
        aoa.push([]); // Spacer
        currentRow++;
    
        return { aoa, merges, currentRow };
    };

    const downloadScheduleOfEventsExcel = () => {
        if (!competitionInfo) return;
        const NUM_COLS = 2;
        const headerInfo = getExcelHeaderAOA('Susunan Acara', NUM_COLS);
        const aoa = headerInfo.aoa;
        const merges = headerInfo.merges;
        let currentRow = headerInfo.currentRow;

        let globalEventCounter = 1;
        const scheduledEvents = events.filter(e => e.sessionNumber && e.sessionNumber > 0 && e.sessionDateTime).sort((a,b) => new Date(a.sessionDateTime!).getTime() - new Date(b.sessionDateTime!).getTime() || (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || (a.heatOrder ?? 0) - (b.heatOrder ?? 0));
        const groupedByDate = scheduledEvents.reduce((acc,event) => {
            const dateStr = new Date(event.sessionDateTime!).toLocaleDateString('id-ID',{weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
            if(!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {} as Record<string, SwimEvent[]>);
        const processedData = Object.entries(groupedByDate).map(([date,dateEvents])=>{
            const groupedBySession = dateEvents.reduce((acc,event)=>{
                const sessionName = `Sesi ${romanize(event.sessionNumber!)}`;
                if(!acc[sessionName]) acc[sessionName] = [];
                acc[sessionName].push({...event, globalEventNumber: globalEventCounter++});
                return acc;
            },{} as Record<string, (SwimEvent & { globalEventNumber: number })[]>);
            return {date, sessions: Object.entries(groupedBySession)};
        });

        processedData.forEach(({ date, sessions }) => {
            aoa.push([date]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;

            sessions.forEach(([sessionName, sessionEvents]) => {
                aoa.push([sessionName]);
                merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                currentRow++;
                aoa.push(['No. Acara', 'Nomor Lomba']);
                currentRow++;
                sessionEvents.forEach(event => {
                    aoa.push([event.globalEventNumber, formatEventName(event)]);
                    currentRow++;
                });
                aoa.push([]); currentRow++;
            });
        });

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [{ wch: 15 }, { wch: 60 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Susunan Acara");
        XLSX.writeFile(workbook, "Susunan_Acara.xlsx");
    };

    const downloadProgramBookExcel = () => {
        if (!competitionInfo) return;
        
        const NUM_COLS = 4;
        const headerInfo = getExcelHeaderAOA('Buku Acara', NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        const merges: any[] = headerInfo.merges;
        let currentRow = headerInfo.currentRow;

        let globalEventCounter = 1;
        const programBookData = (() => {
            const scheduledEvents = events
                .filter(e => e.sessionNumber && e.sessionNumber > 0)
                .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || (a.heatOrder ?? 0) - (b.heatOrder ?? 0));
            return scheduledEvents.reduce((acc, event) => {
                const sessionName = `Sesi ${romanize(event.sessionNumber!)}`;
                if (!acc[sessionName]) acc[sessionName] = [];
                const eventEntries = event.entries.map(entry => {
                    const swimmer = swimmers.find(s => s.id === entry.swimmerId);
                    return swimmer ? { ...entry, swimmer } : null;
                }).filter((e): e is Entry => e !== null);
                if (eventEntries.length > 0) acc[sessionName].push({ ...event, detailedEntries: eventEntries });
                return acc;
            }, {} as Record<string, (SwimEvent & { detailedEntries: Entry[] })[]>);
        })();

        Object.entries(programBookData).forEach(([sessionName, sessionEvents]) => {
            const firstEvent = sessionEvents[0];
            const sessionDT = firstEvent?.sessionDateTime ? new Date(firstEvent.sessionDateTime) : null;
            
            aoa.push([sessionName]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;
            if(sessionDT){
                const sessionDate = sessionDT.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
                const sessionTime = sessionDT.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
                aoa.push([`${sessionDate} - ${sessionTime}`]);
                merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                currentRow++;
            }
            aoa.push([]); currentRow++;

            sessionEvents.forEach(event => {
                const eventNameStr = `Nomor Acara ${globalEventCounter++}: ${formatEventName(event)}`;
                const isRelay = event.relayLegs && event.relayLegs > 1;
                aoa.push([eventNameStr]);
                merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                currentRow++;
                
                const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                const porprovText = porprovRecord ? `${formatTime(porprovRecord.time)} | ${porprovRecord.holderName} | ${porprovRecord.yearSet}` : 'TIDAK ADA REKOR TERCATAT';
                aoa.push([`REKOR PORPROV | ${porprovText}`]);
                merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                currentRow++;

                const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                const nasionalText = nasionalRecord ? `${formatTime(nasionalRecord.time)} | ${nasionalRecord.holderName} | ${nasionalRecord.yearSet}` : 'TIDAK ADA REKOR TERCATAT';
                aoa.push([`REKOR NASIONAL | ${nasionalText}`]);
                merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                currentRow++;

                const heats = generateHeats(event.detailedEntries, competitionInfo.numberOfLanes || 8);
                heats.forEach(heat => {
                    aoa.push([]); currentRow++;
                    aoa.push([`Seri ${heat.heatNumber} dari ${heats.length}`]);
                    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
                    currentRow++;
                    
                    aoa.push(['Lintasan', 'Nama', 'Klub', 'Waktu Unggulan']);
                    currentRow++;

                    Array.from({ length: competitionInfo.numberOfLanes || 8 }, (_, i) => i + 1).forEach(lane => {
                        const assignment = heat.assignments.find(a => a.lane === lane);
                        const displayName = assignment ? (isRelay ? assignment.entry.swimmer.club : assignment.entry.swimmer.name) : '-';
                        const displayClub = assignment ? assignment.entry.swimmer.club : '-';
                        aoa.push([
                            lane,
                            displayName,
                            displayClub,
                            assignment ? formatTime(assignment.entry.seedTime) : '-'
                        ]);
                        currentRow++;
                    });
                });
                aoa.push([]); currentRow++;
            });
        });

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 20 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Buku Acara");
        XLSX.writeFile(workbook, "Buku_Acara_Start_List.xlsx");
    };

    const downloadEventResultsExcel = () => {
        if (!competitionInfo) return;
        const getMedalEmoji = (rank: number): string => {
            if (rank === 1) return '🥇'; if (rank === 2) return '🥈'; if (rank === 3) return '🥉'; return '';
        };

        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const NUM_COLS = 6;
        const headerInfo = getExcelHeaderAOA('Hasil Lomba per Nomor', NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        const merges: any[] = headerInfo.merges;
        let currentRow = headerInfo.currentRow;

        const sortedEvents = events.filter(e => e.results && e.results.length > 0)
            .sort((a,b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || (a.heatOrder ?? 0) - (b.heatOrder ?? 0));

        sortedEvents.forEach(event => {
            aoa.push([formatEventName(event)]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;
            aoa.push(['Peringkat', 'Medali', 'Nama Peserta', 'Klub', 'Waktu', 'Catatan']);
            currentRow++;
            
            const sortedResults = [...event.results].sort((a,b) => {
                if (a.time < 0) return 1; if (b.time < 0) return -1; if (a.time === 0) return 1; if (b.time === 0) return -1; return a.time - b.time;
            });

            sortedResults.forEach((res, i) => {
                const swimmer = swimmersMap.get(res.swimmerId);
                const rankNumber = res.time > 0 ? i + 1 : 0;
                const rankDisplay = rankNumber > 0 ? rankNumber : 'DQ';
                const medalEmoji = getMedalEmoji(rankNumber);
                const note = brokenRecords.find(br => br.newHolder.id === swimmer?.id && br.newTime === res.time && br.record.style === event.style && br.record.distance === event.distance)?.record.type;
                
                aoa.push([rankDisplay, medalEmoji, swimmer?.name || 'N/A', swimmer?.club || 'N/A', formatTime(res.time), note ? `REKOR BARU ${note}`: '']);
                currentRow++;
            });
            aoa.push([]); currentRow++;
        });

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 25 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Lomba");
        XLSX.writeFile(workbook, "Hasil_Lomba.xlsx");
    };

    const downloadClubStandingsExcel = () => {
        if (!competitionInfo) return;
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const clubMedalsData = Object.entries(
            events.reduce((acc, event) => {
                if (!event.results) return acc;
                [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time).slice(0, 3).forEach((result, i) => {
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        if (!acc[swimmer.club]) acc[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                        if (i === 0) acc[swimmer.club].gold++;
                        else if (i === 1) acc[swimmer.club].silver++;
                        else if (i === 2) acc[swimmer.club].bronze++;
                    }
                });
                return acc;
            }, {} as Record<string, { gold: number; silver: number; bronze: number }>)
        ).sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
        
        const NUM_COLS = 6;
        const headerInfo = getExcelHeaderAOA('Rekapitulasi Medali Klub', NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        aoa.push(['Peringkat', 'Klub', 'Emas 🥇', 'Perak 🥈', 'Perunggu 🥉', 'Total']);
        clubMedalsData.forEach(([club, medals], i) => {
            aoa.push([i + 1, club, medals.gold, medals.silver, medals.bronze, medals.gold + medals.silver + medals.bronze]);
        });
        
        const grandTotal = clubMedalsData.reduce((acc, [, medals]) => {
            acc.gold += medals.gold; acc.silver += medals.silver; acc.bronze += medals.bronze; return acc;
        }, { gold: 0, silver: 0, bronze: 0 });

        aoa.push([]);
        aoa.push(['', 'TOTAL KESELURUHAN', grandTotal.gold, grandTotal.silver, grandTotal.bronze, grandTotal.gold + grandTotal.silver + grandTotal.bronze]);

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = headerInfo.merges;
        worksheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Medali Klub");
        XLSX.writeFile(workbook, "Rekap_Medali_Klub.xlsx");
    };
    
    const downloadIndividualStandingsExcel = () => {
        if (!competitionInfo) return;
        const processedData = (() => { // Re-implementing tie-breaker logic inside function
            const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
            const nationalRecordsMap = new Map(records.filter(r => r.type === RecordType.NASIONAL).map(r => [`${r.gender}_${r.distance}_${r.style}_${r.category ?? null}_${r.relayLegs ?? null}`, r]));
            const individualData: Record<string, IndividualStandingData> = {};
            events.filter(e => e.gender !== Gender.MIXED && e.results && e.results.length > 0).forEach(event => {
                [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time).slice(0, 3).forEach((result, i) => {
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        if (!individualData[swimmer.id]) individualData[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0, tiebreakerScore: 0, tiebreakerDetails: [] };
                        if (i === 0) individualData[swimmer.id].gold++; else if (i === 1) individualData[swimmer.id].silver++; else if (i === 2) individualData[swimmer.id].bronze++;
                    }
                });
            });
            Object.values(individualData).forEach(data => {
                const swimmerId = data.swimmer.id;
                const relevantResults = events.map(e => ({ event: e, result: e.results.find(r => r.swimmerId === swimmerId && r.time > 0) })).filter((item): item is { event: SwimEvent, result: Result } => !!item.result);
                let totalCloseness = 0; let comparableEventsCount = 0;
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
                    return { eventName: formatEventName(event), resultTime: result.time, nationalRecordTime: record ? record.time : null, closeness: closeness, };
                });
                data.tiebreakerScore = comparableEventsCount > 0 ? totalCloseness / comparableEventsCount : 0;
            });
            const groupedByMedals: Record<string, IndividualStandingData[]> = {};
            Object.values(individualData).forEach(data => {
                const key = `g${data.gold}-s${data.silver}-b${data.bronze}`;
                if (!groupedByMedals[key]) groupedByMedals[key] = [];
                groupedByMedals[key].push(data);
            });
            const sortedGroups = Object.values(groupedByMedals).sort((groupA, groupB) => {
                const a = groupA[0]; const b = groupB[0]; return b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
            });
            sortedGroups.forEach(group => { if (group.length > 1) { group.sort((a, b) => b.tiebreakerScore - a.tiebreakerScore); }});
            return {
                maleGroups: sortedGroups.map(group => group.filter(d => d.swimmer.gender === 'Male')).filter(g => g.length > 0),
                femaleGroups: sortedGroups.map(group => group.filter(d => d.swimmer.gender === 'Female')).filter(g => g.length > 0),
            };
        })();

        const wb = XLSX.utils.book_new();
        const NUM_COLS = 6;
        const createSheet = (title: string, reportTitle: string, groups: IndividualStandingData[][]) => {
            const headerInfo = getExcelHeaderAOA(reportTitle, NUM_COLS);
            const aoa = headerInfo.aoa;
            aoa.push(['Peringkat', 'Nama', 'Klub', 'Emas 🥇', 'Perak 🥈', 'Perunggu 🥉']);
            let rankCounter = 1;
            groups.forEach(group => { group.forEach(d => { aoa.push([rankCounter++, d.swimmer.name, d.swimmer.club, d.gold, d.silver, d.bronze]); }); });
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet['!merges'] = headerInfo.merges;
            worksheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
            return worksheet;
        };
        XLSX.utils.book_append_sheet(wb, createSheet("Klasemen Putra", "Klasemen Medali Perorangan - Putra", processedData.maleGroups), "Klasemen Putra");
        XLSX.utils.book_append_sheet(wb, createSheet("Klasemen Putri", "Klasemen Medali Perorangan - Putri", processedData.femaleGroups), "Klasemen Putri");
        XLSX.writeFile(wb, "Klasemen_Perorangan.xlsx");
    };
    
    const downloadBrokenRecordsExcel = () => {
        if (!competitionInfo || brokenRecords.length === 0) return;
        const NUM_COLS = 1; 
        const headerInfo = getExcelHeaderAOA('Daftar Rekor Terpecahkan', NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        let currentRow = headerInfo.currentRow;
        const merges: any[] = headerInfo.merges;

        brokenRecords.forEach(br => {
            aoa.push([br.newEventName]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;
            const newRecordInfo = `${br.newHolder.name.toUpperCase()} (${br.newHolder.club.toUpperCase()}) - ${formatTime(br.newTime)} ${br.record.type.toUpperCase()}`;
            aoa.push([newRecordInfo]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;
            const oldRecordInfo = `Memecahkan Rekor ${br.record.type.toUpperCase()} (${formatTime(br.record.time)}) atas nama ${br.record.holderName.toUpperCase()} (${br.record.yearSet})`;
            aoa.push([oldRecordInfo]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } });
            currentRow++;
            aoa.push([]); currentRow++;
        });
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [{ wch: 120 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekor Terpecahkan");
        XLSX.writeFile(workbook, "Daftar_Rekor_Terpecahkan.xlsx");
    };

    const downloadRekapJuaraKategoriExcel = () => {
        if (!competitionInfo) return;
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
         const getCategoryKey = (event: SwimEvent): string => {
            const category = event.category?.trim() || 'Umum'; return category;
        };
        const eventsWithWinners = events
            .filter(e => e.results && e.results.length > 0)
            .map(event => ({ ...event, winners: [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time).slice(0, 3) .map((result, i) => ({ rank: i + 1, time: result.time, swimmer: swimmersMap.get(result.swimmerId) })), categoryKey: getCategoryKey(event) }))
            .filter(e => e.winners.length > 0);
        const groupedByCategory = eventsWithWinners.reduce((acc, event) => { if (!acc[event.categoryKey]) acc[event.categoryKey] = []; acc[event.categoryKey].push(event); return acc; }, {} as Record<string, typeof eventsWithWinners>);
        const sortedGroupedData = Object.entries(groupedByCategory).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

        const NUM_COLS = 5;
        const headerInfo = getExcelHeaderAOA("Rekapitulasi Juara per Kategori", NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        const merges: any[] = headerInfo.merges;
        let currentRow = headerInfo.currentRow;
        
        sortedGroupedData.forEach(([categoryKey, categoryEvents]) => {
            aoa.push([]); currentRow++;
            aoa.push([categoryKey]); merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } }); currentRow++;
            aoa.push([]); currentRow++;
            categoryEvents.sort((a,b) => formatEventName(a).localeCompare(formatEventName(b))).forEach(event => {
                aoa.push([formatEventName(event)]); merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } }); currentRow++;
                aoa.push(['Peringkat', 'Medali', 'Nama Peserta', 'Klub/Tim', 'Waktu']); currentRow++;
                event.winners.forEach(winner => {
                    aoa.push([winner.rank, winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : '🥉', winner.swimmer?.name || 'N/A', winner.swimmer?.club || 'N/A', formatTime(winner.time)]);
                    currentRow++;
                });
                aoa.push([]); currentRow++;
            });
        });
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 15 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Juara per Kategori");
        XLSX.writeFile(workbook, "Rekap_Juara_per_Kategori.xlsx");
    };

    const downloadClubAthleteRecapExcel = () => {
        if (!competitionInfo) return;
        type MedalInfo = { club: string; event: string; athleteName: string; time: number; rank: number; recordBreakType: RecordType | null; };
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const allMedals: MedalInfo[] = [];
        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winners = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time).slice(0, 3);
                winners.forEach((result, index) => {
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer) {
                        const recordBreakInfo = brokenRecords.find(br => br.newHolder.id === swimmer.id && br.newTime === result.time && br.record.style === event.style && br.record.distance === event.distance && br.record.gender === event.gender && (br.record.category ?? null) === (event.category ?? null));
                        allMedals.push({ club: swimmer.club, event: formatEventName(event), athleteName: swimmer.name, time: result.time, rank: index + 1, recordBreakType: recordBreakInfo ? recordBreakInfo.record.type : null });
                    }
                });
            }
        });
        const groupedByClub = allMedals.reduce((acc, medal) => { if (!acc[medal.club]) acc[medal.club] = []; acc[medal.club].push(medal); return acc; }, {} as Record<string, MedalInfo[]>);
        const clubData = Object.entries(groupedByClub).map(([clubName, medals]) => {
            const counts = medals.reduce((acc, medal) => { if (medal.rank === 1) acc.gold++; else if (medal.rank === 2) acc.silver++; else if (medal.rank === 3) acc.bronze++; return acc; }, { gold: 0, silver: 0, bronze: 0 });
            return { clubName, medals: medals.sort((a,b) => a.event.localeCompare(b.event)), counts };
        }).sort((a,b) => b.counts.gold - a.counts.gold || b.counts.silver - a.counts.silver || b.counts.bronze - a.counts.bronze || a.clubName.localeCompare(b.clubName));

        const NUM_COLS = 7;
        const headerInfo = getExcelHeaderAOA("Rekapitulasi Medali Klub & Atlet", NUM_COLS);
        const aoa: any[][] = headerInfo.aoa;
        const merges: any[] = headerInfo.merges;
        let currentRow = headerInfo.currentRow;

        clubData.forEach(({ clubName, medals, counts }) => {
            const summaryText = `Emas: ${counts.gold}, Perak: ${counts.silver}, Perunggu: ${counts.bronze}`;
            aoa.push([`${clubName}`]); merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } }); currentRow++;
            aoa.push([summaryText]); merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: NUM_COLS - 1 } }); currentRow++;
            aoa.push(['No', 'Medali', 'Nomor Lomba', 'Nama Atlet', 'Klub/Tim', 'Catatan Waktu', 'Keterangan']); currentRow++;
            medals.forEach((medal, index) => {
                const medalText = medal.rank === 1 ? 'Emas' : medal.rank === 2 ? 'Perak' : 'Perunggu';
                const note = medal.recordBreakType ? `REKOR BARU ${medal.recordBreakType}` : '';
                aoa.push([index + 1, medalText, medal.event, medal.athleteName, medal.club, formatTime(medal.time), note]); currentRow++;
            });
            aoa.push([]); currentRow++;
        });
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = merges;
        worksheet['!cols'] = [ { wch: 5 }, { wch: 10 }, { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 25 } ];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Medali per Klub");
        XLSX.writeFile(workbook, "Rekap_Medali_per_Klub.xlsx");
    };

    const handleDownloadExcel = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
            return;
        }
        setIsDownloading(true);
        try {
            switch (activeTab) {
                case 'scheduleOfEvents': downloadScheduleOfEventsExcel(); break;
                case 'programBook': downloadProgramBookExcel(); break;
                case 'eventResults': downloadEventResultsExcel(); break;
                case 'clubStandings': downloadClubStandingsExcel(); break;
                case 'individualStandings': downloadIndividualStandingsExcel(); break;
                case 'brokenRecords': downloadBrokenRecordsExcel(); break;
                case 'rekapJuaraKategori': downloadRekapJuaraKategoriExcel(); break;
                case 'clubAthleteRecap': downloadClubAthleteRecapExcel(); break;
            }
        } catch (error) {
            console.error("Failed to generate Excel file:", error);
            alert("Terjadi kesalahan saat membuat file Excel.");
        } finally {
            setIsDownloading(false);
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="flex justify-center items-center py-20"><Spinner /></div>;
        if (!competitionInfo) return <p>Informasi kompetisi belum diatur.</p>;

        switch (activeTab) {
            case 'scheduleOfEvents': return <ScheduleOfEvents events={events} />;
            case 'programBook': return <ProgramBook events={events} swimmers={swimmers} info={competitionInfo} records={records} />;
            case 'eventResults': {
                const filteredEvents = selectedEventIdForPrint === 'all'
                    ? eventsWithResults
                    : eventsWithResults.filter(e => e.id === selectedEventIdForPrint);
                const filteredBrokenRecords = brokenRecords.filter(br => 
                    filteredEvents.some(fe => formatEventName(fe) === br.newEventName)
                );
                return <EventResults events={filteredEvents} swimmers={swimmers} info={competitionInfo} records={records} brokenRecords={filteredBrokenRecords} />;
            }
            case 'clubStandings': return <ClubMedalStandings events={events} swimmers={swimmers} info={competitionInfo} />;
            case 'individualStandings': return <IndividualStandings events={events} swimmers={swimmers} info={competitionInfo} records={records} />;
            case 'brokenRecords': return <BrokenRecordsReport brokenRecords={brokenRecords} info={competitionInfo} />;
            case 'rekapJuaraKategori': return <RekapJuaraPerKategori events={events} swimmers={swimmers} info={competitionInfo} />;
            case 'clubAthleteRecap': return <ClubAthleteMedalRecap events={events} swimmers={swimmers} info={competitionInfo} brokenRecords={brokenRecords} selectedClub={selectedClubForRecap} />;
            case 'cover': return null; // Cover is handled outside the print preview area
            default: return null;
        }
    };

    const TabButton: React.FC<{ tab: PrintTab, label: string }> = ({ tab, label }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'bg-surface text-primary border-b-2 border-primary' : 'text-text-secondary hover:bg-background'}`}
        >{label}</button>
    );

    const printTitle = PRINT_TITLES[activeTab] || 'Laporan Kompetisi';

    return (
        <div>
            <div className="no-print">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">Unduh Laporan</h1>
                    <div className="flex space-x-2">
                         <Button onClick={handleDownloadExcel} disabled={isLoading || isDownloading || activeTab === 'cover'} variant="secondary">
                            {isDownloading ? <Spinner /> : 'Unduh Excel'}
                        </Button>
                        <Button onClick={() => window.print()} disabled={isLoading || activeTab === 'cover'}>
                            Unduh PDF
                        </Button>
                    </div>
                </div>

                <Card>
                    <div className="border-b border-border flex flex-wrap">
                        <TabButton tab="scheduleOfEvents" label="Susunan Acara" />
                        <TabButton tab="programBook" label="Buku Acara" />
                        <TabButton tab="eventResults" label="Hasil per Nomor" />
                        <TabButton tab="rekapJuaraKategori" label="Rekap Juara (Kategori)" />
                        <TabButton tab="clubStandings" label="Rekap Medali Klub" />
                        <TabButton tab="clubAthleteRecap" label="Rekap Medali Klub & Atlet" />
                        <TabButton tab="individualStandings" label="Klasemen Perorangan" />
                        <TabButton tab="brokenRecords" label="Rekor Terpecahkan" />
                        <TabButton tab="cover" label="Buat Sampul AI" />
                    </div>
                    {activeTab === 'eventResults' && eventsWithResults.length > 0 && (
                        <div className="p-4 border-b border-border">
                            <label htmlFor="event-print-select" className="block text-sm font-medium text-text-secondary mb-1">
                                Pilih Nomor Lomba untuk Dicetak
                            </label>
                            <select
                                id="event-print-select"
                                value={selectedEventIdForPrint}
                                onChange={(e) => setSelectedEventIdForPrint(e.target.value)}
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="all">Semua Nomor Lomba</option>
                                {eventsWithResults.map(event => (
                                    <option key={event.id} value={event.id}>
                                        {formatEventName(event)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {activeTab === 'clubAthleteRecap' && (
                        <div className="p-4 border-b border-border">
                            <label htmlFor="club-recap-select" className="block text-sm font-medium text-text-secondary mb-1">
                                Pilih Klub
                            </label>
                            <select
                                id="club-recap-select"
                                value={selectedClubForRecap}
                                onChange={(e) => setSelectedClubForRecap(e.target.value)}
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="all">Semua Klub</option>
                                {uniqueClubs.map(club => (
                                    <option key={club} value={club}>{club}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </Card>
            </div>
            
            {/* AI Cover Generation UI */}
            {activeTab === 'cover' && (
                <Card className="mt-4 no-print">
                    <h2 className="text-xl font-bold mb-2">Buat Sampul dengan AI</h2>
                    <p className="text-text-secondary mb-6">Gunakan AI untuk membuat sampul acara atau sampul laporan hasil secara otomatis berdasarkan informasi kompetisi Anda.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <Card className="bg-background">
                            <h3 className="font-semibold text-lg">Sampul Acara</h3>
                            <p className="text-sm text-text-secondary mt-1 mb-4">Membuat gambar sampul depan yang cocok untuk buku acara atau promosi.</p>
                            <Button onClick={() => handleGenerateCover('event')} disabled={isGeneratingCover}>
                            {isGeneratingCover && coverType === 'event' ? <Spinner /> : 'Buat Sampul Acara'}
                            </Button>
                        </Card>
                        <Card className="bg-background">
                            <h3 className="font-semibold text-lg">Sampul Hasil Lomba</h3>
                            <p className="text-sm text-text-secondary mt-1 mb-4">Membuat gambar sampul untuk laporan hasil akhir kompetisi.</p>
                            <Button onClick={() => handleGenerateCover('results')} disabled={isGeneratingCover}>
                            {isGeneratingCover && coverType === 'results' ? <Spinner /> : 'Buat Sampul Hasil'}
                            </Button>
                        </Card>
                    </div>

                    <div className="mt-6 pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold text-center mb-4">Hasil Sampul</h3>
                        {isGeneratingCover && (
                            <div className="flex flex-col items-center justify-center p-10 bg-background rounded-lg">
                            <Spinner />
                            <p className="mt-4 text-text-secondary">AI sedang menggambar, mohon tunggu...</p>
                            </div>
                        )}
                        {coverError && (
                            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-center">
                            <p className="font-bold">Gagal Membuat Sampul</p>
                            <p className="text-sm">{coverError}</p>
                            </div>
                        )}
                        {generatedCover && (
                            <div className="text-center">
                            <img src={generatedCover} alt="AI Generated Cover" className="max-w-full mx-auto rounded-lg shadow-lg border border-border" />
                            <Button onClick={handlePrintCover} className="mt-6">
                                Cetak Sampul
                            </Button>
                            </div>
                        )}
                        {!isGeneratingCover && !generatedCover && !coverError && (
                            <p className="text-center text-text-secondary p-10 bg-background rounded-lg">Pilih salah satu tipe sampul di atas untuk memulai.</p>
                        )}
                    </div>
                </Card>
            )}
            
            {/* The on-screen preview and printable content */}
            <div className={`print-preview-content-wrapper ${activeTab === 'cover' ? 'hidden' : ''}`}>
                <div className="print-preview-content">
                    {competitionInfo && <ReportHeader info={competitionInfo} title={printTitle} />}
                    {renderContent()}
                    {competitionInfo && <ReportFooter info={competitionInfo} />}
                </div>
            </div>
        </div>
    );
};