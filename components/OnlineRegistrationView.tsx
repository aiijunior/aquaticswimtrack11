import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration, processCollectiveRegistration, searchExternalSwimmer } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, translateSwimStyle, AGE_GROUP_OPTIONS, formatTime } from '../constants';
import { SwimStyle } from '../types';

declare var XLSX: any;

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

const parseTimeToMs = (time: RegistrationTime): number => {
    const minutes = parseInt(time.min, 10) || 0;
    const seconds = parseInt(time.sec, 10) || 0;
    const hundredths = parseInt(time.ms, 10) || 0;
    if (minutes === 99 && seconds === 99 && hundredths === 99) {
        return 0; // Treat as No Time
    }
    return (minutes * 60 * 1000) + (seconds * 1000) + (hundredths * 10);
};

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const UserGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
    competitionInfo,
    onBackToLogin,
    onRegistrationSuccess,
}) => {
    const [regType, setRegType] = useState<'CHOICE' | 'INDIVIDUAL' | 'TEAM'>('CHOICE');
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    
    // Individual form states
    const [formData, setFormData] = useState({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male' as 'Male' | 'Female',
        club: '',
        ageGroup: '',
        picPhone: '',
        paymentProof: null as string | null,
        paymentAmount: '' as string
    });
    const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
    
    // Team form states
    const [teamFormData, setTeamFormData] = useState({
        clubName: '',
        picName: '',
        picPhone: '',
        paymentProof: null as string | null,
        paymentAmount: '' as string
    });
    const [teamParticipants, setTeamParticipants] = useState<any[]>([]);
    const [isParsingExcel, setIsParsingExcel] = useState(false);

    const [isSearchingExternal, setIsSearchingExternal] = useState(false);
    const [externalResults, setExternalResults] = useState<any[]>([]);
    const [showExternalModal, setShowExternalModal] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState<React.ReactNode | string>('');
    const [openAccordion, setOpenAccordion] = useState<SwimStyle | null>(null);

    const ageOptions = useMemo(() => {
        if (competitionInfo?.ageGroups) {
            return competitionInfo.ageGroups.split('\n').map(s => s.trim()).filter(Boolean);
        }
        return AGE_GROUP_OPTIONS;
    }, [competitionInfo]);

    useEffect(() => {
        const fetchEvents = async () => {
            setIsDataLoading(true);
            const onlineEvents = await getEventsForRegistration();
            setLocalEvents(onlineEvents);
            setIsDataLoading(false);
        };
        fetchEvents();
    }, []);

    const maxAllowedEvents = useMemo(() => {
        if (competitionInfo?.isFree) return 999;
        const amount = parseInt(formData.paymentAmount) || 0;
        const fee = competitionInfo?.feePerEvent || 0;
        if (fee <= 0) return 0;
        return Math.floor(amount / fee);
    }, [formData.paymentAmount, competitionInfo]);

    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: any) => e.selected).length;
    }, [selectedEvents]);

    const isPaymentStepValid = useMemo(() => {
        if (competitionInfo?.isFree) return true;
        const proof = regType === 'INDIVIDUAL' ? formData.paymentProof : teamFormData.paymentProof;
        const amount = regType === 'INDIVIDUAL' ? formData.paymentAmount : teamFormData.paymentAmount;
        const feePerNo = competitionInfo?.feePerEvent || 0;
        return proof !== null && parseInt(amount) >= feePerNo;
    }, [formData, teamFormData, regType, competitionInfo]);

    const isTeamInfoFilled = useMemo(() => {
        return teamFormData.clubName.trim() !== '' && 
               teamFormData.picName.trim() !== '' && 
               teamFormData.picPhone.trim() !== '';
    }, [teamFormData.clubName, teamFormData.picName, teamFormData.picPhone]);

    const isFormValid = useMemo(() => {
        if (regType === 'INDIVIDUAL') {
            const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '' && formData.ageGroup !== '' && formData.picPhone.trim() !== '';
            const hasSelectedEvent = selectedEventCount > 0 && (competitionInfo?.isFree || selectedEventCount <= maxAllowedEvents);
            return hasPersonalInfo && isPaymentStepValid && hasSelectedEvent;
        } else {
            return teamFormData.clubName.trim() !== '' && teamFormData.picName.trim() !== '' && teamFormData.picPhone.trim() !== '' && isPaymentStepValid && teamParticipants.length > 0;
        }
    }, [formData, teamFormData, regType, selectedEventCount, maxAllowedEvents, isPaymentStepValid, teamParticipants, competitionInfo]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        // Reset selected events when ageGroup or gender changes to prevent mismatch
        if (name === 'ageGroup' || name === 'gender') {
            setSelectedEvents({});
        }

        setFormData(prev => ({ ...prev, [name]: (name === 'name' || name === 'club') ? toTitleCase(value) : value }));
    };

    const handleTeamFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setTeamFormData(prev => ({ ...prev, [name]: (name === 'clubName' || name === 'picName') ? toTitleCase(value) : value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (regType === 'INDIVIDUAL') {
                    setFormData(prev => ({ ...prev, paymentProof: reader.result as string }));
                } else {
                    setTeamFormData(prev => ({ ...prev, paymentProof: reader.result as string }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSearchExternal = async () => {
        if (!formData.name.trim() || formData.name.length < 3) {
            alert('Masukkan minimal 3 karakter nama untuk mencari.');
            return;
        }

        setIsSearchingExternal(true);
        try {
            const data = await searchExternalSwimmer(formData.name);
            setExternalResults(data.swimmers || []);
            setShowExternalModal(true);
        } catch (err) {
            alert('Gagal mencari data di database Sulawesi Selatan.');
        } finally {
            setIsSearchingExternal(false);
        }
    };

    const applyExternalSwimmer = (extSwimmer: any) => {
        setFormData(prev => ({
            ...prev,
            name: extSwimmer.name,
            birthYear: extSwimmer.birthYear,
            gender: extSwimmer.gender,
            club: extSwimmer.club,
            ageGroup: extSwimmer.ageGroup || prev.ageGroup
        }));

        // Auto-fill times for events
        const newSelectedEvents: SelectedEvents = {};
        
        extSwimmer.bestTimes.forEach((bt: any) => {
            // Find current competition event that matches external event distance/style/gender
            const matchingEvent = localEvents.find(le => 
                le.distance === bt.distance && 
                le.style === bt.style && 
                (le.gender === 'Mixed' || 
                 (extSwimmer.gender === 'Male' && le.gender === "Men's") || 
                 (extSwimmer.gender === 'Female' && le.gender === "Women's"))
                && (!le.category || le.category === extSwimmer.ageGroup || formData.ageGroup === le.category)
            );

            if (matchingEvent) {
                const totalSecs = Math.floor(bt.time / 1000);
                const min = Math.floor(totalSecs / 60);
                const sec = totalSecs % 60;
                const ms = Math.floor((bt.time % 1000) / 10);

                newSelectedEvents[matchingEvent.id] = {
                    selected: true,
                    time: {
                        min: min.toString(),
                        sec: sec.toString().padStart(2, '0'),
                        ms: ms.toString().padStart(2, '0')
                    }
                };
            }
        });

        setSelectedEvents(newSelectedEvents);
        setShowExternalModal(false);
        setSuccessMessage(`Berhasil memuat data ${extSwimmer.name}.`);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    // Collective Registration Helpers
    const downloadTeamTemplate = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka Excel belum termuat.');
            return;
        }

        const workbook = XLSX.utils.book_new();
        
        // 1. Prepare DataMaster Sheet
        const allKUs = [...ageOptions];
        const eventsByCategory: { [key: string]: string[] } = {};
        allKUs.forEach(ku => {
            eventsByCategory[ku] = localEvents
                .filter(e => !e.category || e.category === ku)
                .map(e => formatEventName(e));
        });

        const masterAOA: any[][] = [];
        const maxLen = Math.max(allKUs.length, ...Object.values(eventsByCategory).map(arr => arr.length));
        
        // Header for DataMaster
        // Column A: Daftar KU
        // Columns B+: Events per KU
        const masterHeaders = ["DAFTAR_KU", ...allKUs];
        masterAOA.push(masterHeaders);

        for (let i = 0; i < maxLen; i++) {
            const row = [allKUs[i] || ""];
            allKUs.forEach(ku => {
                row.push(eventsByCategory[ku][i] || "");
            });
            masterAOA.push(row);
        }

        const wsMaster = XLSX.utils.aoa_to_sheet(masterAOA);
        XLSX.utils.book_append_sheet(workbook, wsMaster, "DataMaster");

        // Define Names for dependent dropdowns
        const names: any[] = [
            { Name: "DAFTAR_KU_LIST", Ref: `DataMaster!$A$2:$A$${allKUs.length + 1}` }
        ];

        allKUs.forEach((ku, idx) => {
            const safeName = "KU_" + ku.replace(/[^a-zA-Z0-9]/g, "_");
            const colLetter = XLSX.utils.encode_col(idx + 1);
            const eventCount = eventsByCategory[ku].length;
            if (eventCount > 0) {
                names.push({
                    Name: safeName,
                    Ref: `DataMaster!$${colLetter}$2:$${colLetter}$${eventCount + 1}`
                });
            }
        });

        workbook.Workbook = { Names: names };

        // 2. Prepare Form Pendaftaran Sheet
        const headers = [
            "* Nama Atlet", 
            "* Tahun Lahir", 
            "* Jenis Kelamin (L/P)", 
            "* KU (Kelompok Umur)", 
            "* Nomor Lomba", 
            "* Waktu Unggulan (MM:SS.ss)"
        ];

        const templateAOA = [
            headers,
            ["AISYAH WIJAYANTI AQRAM", 2012, "P", allKUs[0] || "", eventsByCategory[allKUs[0]]?.[0] || "", "00:35.50"],
            ["CONTOH ATLET 2", 2013, "L", allKUs[0] || "", eventsByCategory[allKUs[0]]?.[1] || "", "00:45.00"]
        ];

        const wsTemplate = XLSX.utils.aoa_to_sheet(templateAOA);
        
        // Column widths
        wsTemplate["!cols"] = [
            { wch: 35 }, // Nama
            { wch: 15 }, // Tahun
            { wch: 20 }, // Gender
            { wch: 25 }, // KU
            { wch: 55 }, // Nomor Lomba
            { wch: 30 }  // Waktu
        ];

        // Data Validation (Dropdowns)
        const maxRows = 500;
        if (!wsTemplate["!dataValidation"]) wsTemplate["!dataValidation"] = [];
        
        // Gender Dropdown
        wsTemplate["!dataValidation"].push({ 
            sqref: `C2:C${maxRows}`, 
            opts: { type: "list", formula1: "\"L,P\"" } 
        });
        
        // KU Dropdown
        wsTemplate["!dataValidation"].push({ 
            sqref: `D2:D${maxRows}`, 
            opts: { type: "list", formula1: "DAFTAR_KU_LIST" } 
        });
        
        // Dependent Dropdown for Nomor Lomba
        // Formula: =INDIRECT("KU_" & SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($D2," ","_"),"-","_"),"(","_"))
        // We'll use a slightly safer version for Excel naming compatibility
        wsTemplate["!dataValidation"].push({ 
            sqref: `E2:E${maxRows}`, 
            opts: { 
                type: "list", 
                formula1: "INDIRECT(\"KU_\"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($D2,\" \",\"_\"),\"-\",\"_\"),\"(\",\"_\"),\")\",\"_\"))" 
            } 
        });

        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Form Pendaftaran");
        XLSX.writeFile(workbook, `Template_Kolektif_${teamFormData.clubName || "Klub"}.xlsx`);
    };

    const handleTeamExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingExcel(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames.find(n => n.includes("Form")) || workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);

                const processed = json.map((row: any) => {
                    // Support both new and old header names
                    const name = row["* Nama Atlet"] || row["Nama Atlet"];
                    const birthYear = row["* Tahun Lahir"] || row["Tahun Lahir"];
                    const gender = row["* Jenis Kelamin (L/P)"] || row["Jenis Kelamin (L/P)"];
                    const ku = row["* KU (Kelompok Umur)"] || row["KU (Kelompok Umur)"] || row["KU"];
                    const eventName = row["* Nomor Lomba"] || row["Nomor Lomba"];
                    const timeHeader = row["* Waktu Unggulan (MM:SS.ss)"] || row["Waktu Unggulan (MM:SS.ss)"] || row["Waktu Unggulan (mm:ss.SS)"];

                    const event = localEvents.find(e => formatEventName(e) === eventName);
                    
                    // Parse time string "MM:SS.ss"
                    let ms = 0;
                    const timeStr = String(timeHeader || "99:99.99");
                    if (timeStr.includes(":")) {
                        const [min, rest] = timeStr.split(":");
                        const [sec, centi] = rest.split(".");
                        ms = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
                    }

                    return {
                        name: toTitleCase(String(name || "")),
                        birthYear: parseInt(birthYear),
                        gender: String(gender || "").toUpperCase() === "L" ? "L" : "P",
                        ageGroup: ku,
                        eventName: eventName,
                        eventId: event?.id,
                        seedTimeMs: ms,
                        displayTime: timeStr
                    };
                }).filter((p: any) => p.name && p.eventId);

                setTeamParticipants(processed);
                
                // Auto calculate amount
                const totalEvents = processed.length;
                const totalCost = competitionInfo?.isFree ? 0 : totalEvents * (competitionInfo?.feePerEvent || 0);
                setTeamFormData(prev => ({ ...prev, paymentAmount: String(totalCost) }));

            } catch (err) {
                alert("Gagal memproses file Excel. Pastikan format kolom sesuai template.");
            } finally {
                setIsParsingExcel(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            if (regType === 'INDIVIDUAL') {
                const registrationsToSubmit = (Object.entries(selectedEvents) as [string, any][])
                    .filter(([_, val]) => val.selected)
                    .map(([eventId, val]) => ({
                        eventId,
                        seedTime: parseTimeToMs(val.time),
                    }));

                const result = await processOnlineRegistration({
                    name: formData.name,
                    birthYear: formData.birthYear,
                    gender: formData.gender,
                    club: formData.club,
                    ageGroup: formData.ageGroup,
                    paymentProof: competitionInfo?.isFree ? null : formData.paymentProof,
                    paymentAmount: competitionInfo?.isFree ? 0 : parseInt(formData.paymentAmount) || 0,
                    picName: formData.name, // Self PIC
                    picPhone: formData.picPhone
                }, registrationsToSubmit);

                if (result.success) {
                    setSuccessMessage(`Pendaftaran atlet ${formData.name} berhasil!`);
                    onRegistrationSuccess();
                } else {
                    setError(result.message);
                }
            } else {
                // TEAM SUBMISSION
                if (teamParticipants.length === 0) throw new Error("Belum ada data atlet yang diunggah.");
                
                const result = await processCollectiveRegistration({
                    clubName: teamFormData.clubName,
                    picName: teamFormData.picName,
                    picPhone: teamFormData.picPhone,
                    paymentProof: competitionInfo?.isFree ? null : teamFormData.paymentProof,
                    paymentAmount: competitionInfo?.isFree ? 0 : parseInt(teamFormData.paymentAmount) || 0
                }, teamParticipants);

                if (result.success) {
                    setSuccessMessage(`Berhasil mendaftarkan tim ${teamFormData.clubName}!`);
                    onRegistrationSuccess();
                } else {
                    setError(result.message);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const handleEventSelectionChange = (eventId: string) => {
        const isCurrentlySelected = !!selectedEvents[eventId]?.selected;
        if (!isCurrentlySelected && selectedEventCount >= maxAllowedEvents && !competitionInfo?.isFree) {
            alert(`Kuota pemilihan nomor sudah habis sesuai nominal transfer Rp ${parseInt(formData.paymentAmount).toLocaleString('id-ID')}.`);
            return;
        }

        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                selected: !isCurrentlySelected,
                time: prev[eventId]?.time || { min: '99', sec: '99', ms: '99' },
            },
        }));
    };

    const handleTimeChange = (eventId: string, part: keyof RegistrationTime, value: string) => {
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                ...prev[eventId],
                time: { ...prev[eventId].time, [part]: value },
            },
        }));
    };

    const groupedAvailableEvents = useMemo(() => {
        return localEvents
            .filter(e => {
                const genderMatch = e.gender === "Mixed" || 
                                   (formData.gender === "Male" && e.gender === "Men's") || 
                                   (formData.gender === "Female" && e.gender === "Women's");
                return genderMatch && (!e.category || e.category === formData.ageGroup);
            })
            .reduce((acc, event) => {
                if (!acc[event.style]) acc[event.style] = [];
                acc[event.style].push(event);
                return acc;
            }, {} as Record<string, SwimEvent[]>);
    }, [localEvents, formData.gender, formData.ageGroup]);

    const summaryList = useMemo(() => {
        return (Object.entries(selectedEvents) as [string, any][])
            .filter(([_, val]) => val.selected)
            .map(([eventId, val]) => {
                const event = localEvents.find(e => e.id === eventId);
                return {
                    name: event ? formatEventName(event) : 'Unknown Event',
                    time: `${val.time.min.padStart(2, '0')}:${val.time.sec.padStart(2, '0')}.${val.time.ms.padEnd(2, '0').slice(0, 2)}`
                };
            });
    }, [selectedEvents, localEvents]);

    if (isDataLoading) return <div className="flex justify-center p-20"><Spinner /></div>;

    const isFree = competitionInfo?.isFree ?? false;

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="mx-auto h-20 mb-4" />}
                    <h1 className="text-3xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h3 className="text-xl font-bold mt-2 opacity-80 uppercase tracking-widest">Pendaftaran Online</h3>
                    {isFree && <span className="inline-block mt-2 bg-green-500 text-white px-4 py-1 rounded-full text-xs font-black animate-pulse">PENDAFTARAN GRATIS</span>}
                </header>

                {regType === 'CHOICE' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group shadow-xl" onClick={() => setRegType('INDIVIDUAL')}>
                            <UserIcon /><h3 className="text-2xl font-black mt-4 group-hover:text-primary transition-colors">PENDAFTARAN MANDIRI</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Daftarkan atlet satu per satu secara langsung</p>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group shadow-xl" onClick={() => setRegType('TEAM')}>
                            <UserGroupIcon /><h3 className="text-2xl font-black mt-4 group-hover:text-primary transition-colors">PENDAFTARAN KOLEKTIF</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Gunakan Excel untuk mendaftarkan tim besar / klub</p>
                        </Card>
                    </div>
                )}

                {regType !== 'CHOICE' && !successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
                        <div className="flex justify-start">
                            <Button variant="secondary" onClick={() => { setRegType('CHOICE'); setTeamParticipants([]); setSelectedEvents({}); }}>&larr; Kembali ke Pilihan</Button>
                        </div>

                        {regType === 'INDIVIDUAL' ? (
                            <>
                                {/* INDIVIDUAL STEPS */}
                                <Card className="shadow-xl">
                                    <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                        <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                        Profil Atlet & Kontak
                                    </h2>
                                    <div className="mb-4 bg-primary/5 p-4 rounded-xl border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-4">
                                        <div className="text-center md:text-left">
                                            <p className="text-xs font-bold text-primary uppercase tracking-wider">Cari Data di Database Sulawesi Selatan</p>
                                            <p className="text-[10px] text-text-secondary italic">Ambil otomatis data & waktu terbaik dari kompetisi regional sebelumnya.</p>
                                        </div>
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            onClick={handleSearchExternal}
                                            disabled={isSearchingExternal || formData.name.length < 3}
                                            className="whitespace-nowrap flex items-center gap-2"
                                        >
                                            {isSearchingExternal ? <Spinner size="sm" /> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                                            {isSearchingExternal ? 'MENCARI...' : 'CARI DATA ATLET'}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} placeholder="Sesuai Akta Kelahiran" required />
                                        <Input label="Nama Tim / Klub" id="club" name="club" value={formData.club} onChange={handleFormChange} placeholder="Contoh: Sidoarjo Swim Club" required />
                                        <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                        <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                            <option value="Male">Laki-laki</option>
                                            <option value="Female">Perempuan</option>
                                        </Select>
                                        <Select label="Kelompok Umur (KU)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                            <option value="">-- Pilih KU --</option>
                                            {ageOptions.map(ku => <option key={ku} value={ku}>{ku}</option>)}
                                        </Select>
                                        <Input label="Nomor HP/WA Aktif" id="picPhone" name="picPhone" type="tel" value={formData.picPhone} onChange={handleFormChange} placeholder="Contoh: 08123456789" required />
                                    </div>
                                    <p className="text-[10px] text-text-secondary italic mt-2">* Nomor HP diperlukan untuk konfirmasi pendaftaran oleh panitia.</p>
                                </Card>

                                {!isFree && (
                                    <Card className="shadow-xl border-l-4 border-l-primary">
                                        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                            Pembayaran & Bukti Transfer
                                        </h2>
                                        <PaymentSection 
                                            info={competitionInfo} 
                                            data={formData} 
                                            onFileChange={handleFileChange} 
                                            onAmountChange={handleFormChange} 
                                        />
                                    </Card>
                                )}

                                <Card className="shadow-xl">
                                    <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                                        <h2 className="text-xl font-black flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">{isFree ? '2' : '3'}</span>
                                            Pilih Nomor Lomba
                                        </h2>
                                        {!isFree && formData.paymentAmount && (
                                            <div className="text-right bg-primary/10 px-4 py-2 rounded-xl border border-primary/20">
                                                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Sisa Kuota Pilihan</p>
                                                <p className={`text-2xl font-black ${maxAllowedEvents - selectedEventCount === 0 ? 'text-red-500' : 'text-primary'}`}>
                                                    {maxAllowedEvents - selectedEventCount} <span className="text-xs font-normal">nomor</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {!formData.ageGroup ? (
                                        <div className="text-center py-12 bg-yellow-50 rounded-2xl border border-yellow-200">
                                            <p className="text-yellow-700 font-bold">⚠️ Harap pilih Kelompok Umur di Langkah 1</p>
                                        </div>
                                    ) : (!isPaymentStepValid && !isFree) ? (
                                        <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-200">
                                            <p className="text-red-700 font-bold">⚠️ Harap lengkapi Bukti Bayar & Nominal di Langkah 2</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]: any) => (
                                                <div key={style} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                                                    <button type="button" onClick={() => handleAccordionToggle(style)} className="w-full flex justify-between p-5 bg-surface hover:bg-primary/5 transition-colors">
                                                        <h3 className="font-black text-text-primary uppercase text-sm tracking-widest">{translateSwimStyle(style as SwimStyle)}</h3>
                                                        <ChevronDownIcon isOpen={openAccordion === style} />
                                                    </button>
                                                    {openAccordion === style && (
                                                        <div className="p-5 space-y-5 bg-background/30 border-t border-border">
                                                            {eventsInStyle.map((event: SwimEvent) => {
                                                                const isSelected = !!selectedEvents[event.id]?.selected;
                                                                const isLocked = !isSelected && selectedEventCount >= maxAllowedEvents && !isFree;
                                                                
                                                                return (
                                                                    <div key={event.id} className={`flex flex-col border-b border-border last:border-0 pb-5 last:pb-0 ${isLocked ? 'opacity-40 grayscale' : ''}`}>
                                                                        <div className="flex items-center">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                id={`check-${event.id}`}
                                                                                checked={isSelected} 
                                                                                onChange={() => handleEventSelectionChange(event.id)} 
                                                                                disabled={isLocked}
                                                                                className="h-7 w-7 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" 
                                                                            />
                                                                            <label htmlFor={`check-${event.id}`} className={`ml-4 font-bold text-text-primary cursor-pointer flex-grow text-lg ${isSelected ? 'text-primary' : ''}`}>
                                                                                {formatEventName(event)}
                                                                                {isLocked && <span className="ml-3 text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black tracking-tighter">KUOTA HABIS</span>}
                                                                            </label>
                                                                        </div>
                                                                        {isSelected && (
                                                                            <div className="mt-5 ml-11 bg-surface p-5 rounded-2xl border border-primary/20 grid grid-cols-3 gap-4 animate-in slide-in-from-left-4 duration-300">
                                                                                <div className="col-span-3 mb-1 flex items-center gap-2">
                                                                                    <span className="text-primary">⏱</span>
                                                                                    <p className="text-[10px] font-black uppercase text-text-secondary tracking-widest italic">Waktu Unggulan (Seed Time)</p>
                                                                                </div>
                                                                                <Input label="Menit" type="number" min="0" value={selectedEvents[event.id].time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                                <Input label="Detik" type="number" min="0" max="59" value={selectedEvents[event.id].time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                                <Input label="ss/100" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>

                                {selectedEventCount > 0 && (
                                    <Card className="shadow-2xl bg-gradient-to-br from-primary/10 to-transparent border-primary/30 border-2 rounded-3xl">
                                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                                            <span className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg">{isFree ? '3' : '4'}</span>
                                            Ringkasan Pendaftaran
                                        </h2>
                                        <div className="space-y-3">
                                            <p className="text-xs font-black text-text-secondary uppercase tracking-widest mb-4">Nomor Lomba Yang Diikuti:</p>
                                            <div className="space-y-2">
                                                {summaryList.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-surface/80 backdrop-blur-sm p-4 rounded-2xl border border-border shadow-sm hover:border-primary/40 transition-colors">
                                                        <span className="font-black text-sm text-text-primary tracking-tight">{item.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-text-secondary font-bold uppercase">Waktu:</span>
                                                            <span className="font-mono text-sm bg-primary/5 text-primary font-black px-3 py-1 rounded-lg border border-primary/10">{item.time}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-8 pt-6 border-t border-dashed border-primary/30 flex justify-between items-end">
                                                <div>
                                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Atlet</p>
                                                    <p className="text-xl font-black text-text-primary tracking-tighter">{formData.name || '-'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Bayar</p>
                                                    <p className="text-3xl font-black text-primary underline decoration-primary/20 underline-offset-8">
                                                        {isFree ? 'GRATIS' : `Rp ${parseInt(formData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                            </>
                        ) : (
                            <>
                                {/* TEAM STEPS */}
                                <Card className="shadow-xl">
                                    <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                        <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                        Informasi Tim & Unggah Berkas (Excel)
                                    </h2>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <Input label="Nama Klub / Tim" id="clubName" name="clubName" value={teamFormData.clubName} onChange={handleTeamFormChange} placeholder="Contoh: Millenium Aquatic" required />
                                            <Input label="Nama PIC / Penanggung Jawab" id="picName" name="picName" value={teamFormData.picName} onChange={handleTeamFormChange} placeholder="Nama Anda" required />
                                            <Input label="Nomor HP/WA Aktif PIC" id="picPhone" name="picPhone" type="tel" value={teamFormData.picPhone} onChange={handleTeamFormChange} placeholder="Contoh: 08123456789" required />
                                        </div>
                                        
                                        <div className="bg-surface p-6 rounded-2xl border-2 border-dashed border-border text-center space-y-4">
                                            <p className="text-sm text-text-secondary">Silakan unduh template Excel kami, isi data atlet Anda, lalu unggah kembali di sini.</p>
                                            <div className="flex flex-wrap justify-center gap-4">
                                                <Button variant="secondary" onClick={downloadTeamTemplate} disabled={!isTeamInfoFilled}>UNDUH TEMPLATE EXCEL</Button>
                                                <div className="relative">
                                                    <Button disabled={isParsingExcel || !isTeamInfoFilled}>
                                                        {isParsingExcel ? <Spinner /> : 'UNGGAH BERKAS TERISI'}
                                                    </Button>
                                                    <input 
                                                        type="file" 
                                                        accept=".xlsx, .xls" 
                                                        onChange={handleTeamExcelUpload} 
                                                        className={`absolute inset-0 opacity-0 ${isTeamInfoFilled ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}`}
                                                        disabled={isParsingExcel || !isTeamInfoFilled}
                                                    />
                                                </div>
                                            </div>
                                            {!isTeamInfoFilled && <p className="text-[10px] text-red-500 italic font-bold">Lengkapi Info Tim & PIC di atas untuk mengaktifkan tombol unduh & unggah template.</p>}
                                        </div>

                                        {teamParticipants.length > 0 && (
                                            <div className="mt-6 animate-in slide-in-from-top-4">
                                                <p className="text-xs font-black text-primary uppercase mb-2">Pratinjau Data Atlet ({teamParticipants.length} Entri):</p>
                                                <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-background sticky top-0">
                                                            <tr>
                                                                <th className="p-2">Nama</th>
                                                                <th className="p-2">Tahun</th>
                                                                <th className="p-2">KU</th>
                                                                <th className="p-2">Nomor</th>
                                                                <th className="p-2">Waktu</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {teamParticipants.map((p, i) => (
                                                                <tr key={i} className="border-t border-border hover:bg-primary/5">
                                                                    <td className="p-2 font-bold">{p.name}</td>
                                                                    <td className="p-2">{p.birthYear}</td>
                                                                    <td className="p-2">{p.ageGroup}</td>
                                                                    <td className="p-2 truncate max-w-[150px]">{p.eventName}</td>
                                                                    <td className="p-2 font-mono">{p.displayTime}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {!isFree && (
                                    <Card className="shadow-xl border-l-4 border-l-primary">
                                        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                            <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                            Pembayaran & Bukti Transfer
                                        </h2>
                                        <PaymentSection 
                                            info={competitionInfo} 
                                            data={teamFormData} 
                                            onFileChange={handleFileChange} 
                                            onAmountChange={handleTeamFormChange} 
                                        />
                                    </Card>
                                )}

                                {teamParticipants.length > 0 && (
                                    <Card className="shadow-2xl bg-gradient-to-br from-primary/10 to-transparent border-primary/30 border-2 rounded-3xl">
                                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                                            <span className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg">{isFree ? '2' : '3'}</span>
                                            Ringkasan Kolektif
                                        </h2>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-4 bg-surface rounded-2xl border border-border shadow-sm">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Jumlah Atlet</p>
                                                <p className="text-2xl font-black text-primary">{new Set(teamParticipants.map(p => p.name)).size}</p>
                                            </div>
                                            <div className="p-4 bg-surface rounded-2xl border border-border shadow-sm">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Total Nomor</p>
                                                <p className="text-2xl font-black text-primary">{teamParticipants.length}</p>
                                            </div>
                                            <div className="col-span-2 p-4 bg-surface rounded-2xl border border-primary/20 shadow-sm text-right">
                                                <p className="text-[10px] font-black text-text-secondary uppercase">Total Wajib Bayar</p>
                                                <p className="text-3xl font-black text-primary tracking-tighter">
                                                    {isFree ? 'GRATIS' : `Rp ${parseInt(teamFormData.paymentAmount || '0').toLocaleString('id-ID')}`}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                            </>
                        )}

                        {error && <div className="p-5 bg-red-100 border-2 border-red-300 text-red-700 rounded-2xl font-black text-center animate-bounce shadow-lg">{error}</div>}
                        
                        <div className="pt-6">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting || !isFormValid} 
                                className="w-full py-8 text-3xl font-black shadow-2xl rounded-3xl tracking-tighter transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-30"
                            >
                                {isSubmitting ? (
                                    <div className="flex items-center justify-center gap-4">
                                        <Spinner /> <span className="animate-pulse">MENGIRIM DATA...</span>
                                    </div>
                                ) : 'KIRIM PENDAFTARAN SEKARANG'}
                            </Button>
                        </div>
                    </form>
                )}

                {successMessage && (
                    <Card className="text-center p-16 shadow-2xl border-4 border-green-500 rounded-[3rem] animate-in zoom-in duration-700 bg-white">
                        <div className="bg-green-100 h-32 w-32 rounded-full flex items-center justify-center mx-auto mb-8 border-8 border-green-500 shadow-2xl animate-bounce">
                            <span className="text-green-500 text-7xl font-bold">✓</span>
                        </div>
                        <h2 className="text-4xl font-black text-text-primary mb-4 italic tracking-tighter uppercase">BERHASIL!</h2>
                        <p className="text-xl text-text-secondary font-medium leading-relaxed max-w-md mx-auto">{successMessage}</p>
                        <div className="mt-12 flex flex-col gap-5">
                            <Button onClick={() => { setSuccessMessage(''); setRegType('CHOICE'); setTeamParticipants([]); }} className="py-6 font-black text-xl rounded-2xl shadow-xl">PENDAFTARAN BARU</Button>
                            <Button variant="secondary" onClick={onBackToLogin} className="py-4 rounded-xl opacity-70 hover:opacity-100 transition-opacity">KEMBALI KE BERANDA</Button>
                        </div>
                    </Card>
                )}

                {showExternalModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-surface w-full max-w-2xl rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-6 border-b border-border bg-primary/5 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-black text-primary uppercase tracking-tight">Hasil Pencarian Database Sulsel</h3>
                                    <p className="text-xs text-text-secondary italic">Ketemu {externalResults.length} atlet yang mirip.</p>
                                </div>
                                <button onClick={() => setShowExternalModal(false)} className="p-2 hover:bg-red-100 text-text-secondary hover:text-red-600 rounded-full transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                                {externalResults.length === 0 ? (
                                    <div className="text-center py-10 opacity-50 italic">Tidak menemukan atlet dengan nama "{formData.name}" di database Sulawesi Selatan.</div>
                                ) : (
                                    externalResults.map((ext: any, idx) => (
                                        <div key={idx} className="p-5 border border-border rounded-2xl hover:border-primary/50 transition-all bg-background group cursor-pointer" onClick={() => applyExternalSwimmer(ext)}>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div>
                                                    <h4 className="text-lg font-black text-text-primary group-hover:text-primary transition-colors">{ext.name}</h4>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">{ext.club}</span>
                                                        <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-bold">{ext.birthYear}</span>
                                                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">{ext.gender === 'Male' ? 'Laki-laki' : 'Perempuan'}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <p className="text-[10px] font-bold text-text-secondary uppercase">Catatan Waktu</p>
                                                    <p className="text-lg font-black text-primary">{ext.bestTimes.length} Event</p>
                                                    <button type="button" className="text-[10px] bg-primary text-white px-4 py-1.5 rounded-full font-black mt-2 shadow-sm group-hover:shadow-md active:scale-95 transition-all">PILIH & ISI OTOMATIS &rarr;</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-6 bg-background border-t border-border text-center">
                                <Button variant="secondary" onClick={() => setShowExternalModal(false)} className="px-10">TUTUP</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const PaymentSection: React.FC<{ info: any, data: any, onFileChange: any, onAmountChange: any }> = ({ info, data, onFileChange, onAmountChange }) => {
    // Component already handles free competition with a check but we also hide the Card in the main render
    if (info?.isFree) {
        return null;
    }
    return (
        <div className="space-y-6">
            <div className="bg-surface p-4 rounded-lg border border-primary/20 shadow-inner">
                <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">Rekening Tujuan</p>
                <p className="text-2xl font-black text-text-primary tracking-tighter">{info?.accountNumber || '-'}</p>
                <p className="text-sm font-bold uppercase text-primary mb-3">{info?.recipientName || '-'}</p>
                
                <div className="pt-3 border-t border-border flex justify-between items-center">
                    <span className="text-xs font-bold text-text-secondary uppercase tracking-tight">Biaya Pendaftaran</span>
                    <span className="text-lg font-black text-text-primary">Rp {(info?.feePerEvent || 0).toLocaleString('id-ID')} <span className="text-[10px] font-normal text-text-secondary">/ nomor acara</span></span>
                </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="block text-sm font-black text-primary uppercase">1. Pratinjau Bukti Bayar (Klik gambar untuk zoom)</label>
                    <div className="w-full min-h-[400px] max-h-[600px] bg-background border-2 border-border rounded-xl flex items-center justify-center overflow-auto shadow-inner relative group">
                        {data.paymentProof ? (
                            <img 
                                src={data.paymentProof} 
                                alt="Bukti Transfer" 
                                className="max-w-full h-auto object-contain cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]" 
                                onClick={() => window.open(data.paymentProof || '', '_blank')} 
                            />
                        ) : (
                            <div className="text-center p-10">
                                <svg className="mx-auto h-16 w-16 text-text-secondary opacity-20 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <p className="text-sm text-text-secondary opacity-50 font-bold uppercase tracking-widest">Silakan Unggah Bukti Bayar Dahulu</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-text-secondary uppercase">2. Unggah / Ganti File</label>
                        <div className="relative border-2 border-dashed border-primary/40 rounded-xl p-6 bg-primary/5 hover:bg-primary/10 transition-all text-center">
                            <input type="file" accept="image/*" onChange={onFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" required />
                            <p className="text-xs font-black text-primary uppercase">{data.paymentProof ? '✓ Ganti Bukti Bayar' : 'Klik Untuk Unggah Bukti'}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-text-secondary uppercase tracking-tight">3. Masukkan Nominal Yang Ditransfer (Rp)</label>
                        <Input 
                            label="" 
                            id="paymentAmount" 
                            name="paymentAmount" 
                            type="number" 
                            value={data.paymentAmount} 
                            onChange={onAmountChange} 
                            placeholder="Ketik nominal persis sesuai bukti di atas"
                            required 
                            className="text-xl font-bold"
                        />
                        <p className="text-[10px] text-text-secondary italic">Lihat angka pada pratinjau bukti bayar di atas untuk mengisi nominal ini.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};