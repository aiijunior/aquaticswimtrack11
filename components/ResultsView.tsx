import React, { useMemo, useState, useEffect, useRef, FC } from 'react';
import type { SwimEvent, Swimmer, BrokenRecord, SwimRecord } from '../types';
import { RecordType, Gender } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { getRecords } from '../services/databaseService';
import { formatEventName, formatTime } from '../constants';

declare var XLSX: any;

interface ResultsViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  isLoading: boolean;
}

const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v3a3 3 0 01-3 3z" /></svg>;
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
};

type MedalCounts = { gold: number, silver: number, bronze: number };

export const ResultsView: React.FC<ResultsViewProps> = ({ events, swimmers, isLoading }) => {
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        const fetchRecords = async () => {
            const recordsData = await getRecords();
            setRecords(recordsData);
        };
        fetchRecords();
    }, []);

    const { clubMedals, maleIndividualMedals, femaleIndividualMedals, brokenRecords, eventsWithResults } = useMemo(() => {
        const clubMedals: Record<string, MedalCounts> = {};
        const individualMedals: Record<string, MedalCounts & { swimmer: Swimmer }> = {};
        const brokenRecordsList: BrokenRecord[] = [];
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        // First, calculate all broken records across all events
        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time)[0];
                const winnerSwimmer = winner ? swimmersMap.get(winner.swimmerId) : undefined;
                if (winner && winnerSwimmer) {
                    const checkRecord = (type: string) => {
                        const record = records.find(r => 
                            r.type.toUpperCase() === type.toUpperCase() &&
                            r.gender === event.gender &&
                            r.distance === event.distance &&
                            r.style === event.style &&
                            (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
                            (r.category ?? null) === (event.category ?? null)
                        );
                        if (record && winner.time < record.time) {
                            brokenRecordsList.push({
                               record: record,
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

        const eventsWithResults = events
            .filter(event => event.results && event.results.length > 0)
            .map(event => {
                const validResultsForMedals = [...event.results]
                    .filter(r => r.time > 0)
                    .sort((a, b) => a.time - b.time);

                validResultsForMedals.forEach((result, index) => {
                        const rank = index + 1;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        
                        if (swimmer) {
                            // Tally medals for clubs
                            if (!clubMedals[swimmer.club]) clubMedals[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                            if (rank === 1) clubMedals[swimmer.club].gold++;
                            else if (rank === 2) clubMedals[swimmer.club].silver++;
                            else if (rank === 3) clubMedals[swimmer.club].bronze++;

                            // Tally medals for individuals (non-mixed events)
                            if (event.gender !== Gender.MIXED && rank <= 3) {
                                if (!individualMedals[swimmer.id]) {
                                    individualMedals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                                }
                                if (rank === 1) individualMedals[swimmer.id].gold++;
                                else if (rank === 2) individualMedals[swimmer.id].silver++;
                                else if (rank === 3) individualMedals[swimmer.id].bronze++;
                            }
                        }
                    });

                const getPenalty = (time: number) => {
                    if (time > 0) return 0; // Valid time
                    if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                    if (time === -2) return 2; // NS
                    return 3; // Not yet recorded (NT) or 0
                };

                const allSortedResults = [...event.results]
                    .sort((a, b) => {
                        if (a.time > 0 && b.time > 0) return a.time - b.time;
                        return getPenalty(a.time) - getPenalty(b.time);
                    })
                    .map((result) => {
                        const rank = result.time > 0 ? validResultsForMedals.findIndex(r => r.swimmerId === result.swimmerId) + 1 : 0;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        
                        const brokenRecordDetails = brokenRecordsList.filter(br => 
                            br.newHolder.id === swimmer?.id && 
                            br.newTime === result.time &&
                            br.record.style === event.style &&
                            br.record.distance === event.distance &&
                            br.record.gender === event.gender &&
                            (br.record.category ?? null) === (event.category ?? null)
                        );

                        return { ...result, rank, swimmer, brokenRecordDetails };
                    });

                return { ...event, sortedResults: allSortedResults };
            });

        const sortedClubMedals = Object.entries(clubMedals)
            .sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
            
        const sortedIndividualMedals = Object.values(individualMedals)
            .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);

        const uniqueBrokenRecords = [...new Map(brokenRecordsList.map(item => [item.record.id, item])).values()];
        
        const maleIndividualMedals = sortedIndividualMedals.filter(data => data.swimmer.gender === 'Male');
        const femaleIndividualMedals = sortedIndividualMedals.filter(data => data.swimmer.gender === 'Female');

        return { 
            clubMedals: sortedClubMedals, 
            maleIndividualMedals,
            femaleIndividualMedals,
            brokenRecords: uniqueBrokenRecords, 
            eventsWithResults 
        };
    }, [events, swimmers, records]);
    

    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    
    const handleToggleEvent = (eventId: string) => setExpandedEventId(prevId => (prevId === eventId ? null : eventId));
    
    const handleDownloadWinners = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
            return;
        }
        if (eventsWithResults.length === 0) {
            alert('Tidak ada juara untuk diunduh.');
            return;
        }

        setIsDownloading(true);

        try {
            const dataToExport: {
                "Nomor Lomba": string;
                "Peringkat": number;
                "Nama Atlet": string;
                "Nama Tim": string;
                "Waktu": string;
            }[] = [];

            const sortedEventsForExport = [...eventsWithResults].sort((a,b) => formatEventName(a).localeCompare(formatEventName(b)));

            sortedEventsForExport.forEach(event => {
                const eventName = formatEventName(event);
                const winners = event.sortedResults.slice(0, 3);

                if (winners.length > 0) {
                    winners.forEach(result => {
                        dataToExport.push({
                            "Nomor Lomba": eventName,
                            "Peringkat": result.rank,
                            "Nama Atlet": result.swimmer?.name || 'N/A',
                            "Nama Tim": result.swimmer?.club || 'N/A',
                            "Waktu": formatTime(result.time),
                        });
                    });
                }
            });
            
            const finalData = dataToExport.map(d => ({
                'Juara': d.Peringkat,
                'Nama Atlet': d['Nama Atlet'],
                'Nama Tim': d['Nama Tim'],
                'Nomor Lomba yang Dimenangkan': d['Nomor Lomba'],
                'Waktu': d.Waktu
            }));


            const worksheet = XLSX.utils.json_to_sheet(finalData);
            worksheet['!cols'] = [
                { wch: 10 }, // Juara
                { wch: 30 }, // Nama Atlet
                { wch: 30 }, // Nama Tim
                { wch: 40 }, // Nomor Lomba
                { wch: 15 }, // Waktu
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook