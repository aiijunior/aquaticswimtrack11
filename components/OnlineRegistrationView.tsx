
import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration, findSwimmerByName, processParticipantUpload } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, formatTime, translateSwimStyle, AGE_GROUP_OPTIONS } from '../constants';
import { SwimStyle, Gender } from '../types';

declare var XLSX: any;

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

interface OnlineRegistrationResponse {
    success: boolean;
    message: string;
    swimmer: Swimmer | null;
    previouslyRegisteredEvents?: FormattableEvent[];
}

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
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const UserGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    const [formData, setFormData] = useState({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male' as 'Male' | 'Female',
        club: '',
        ageGroup: '',
    });
    const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState<React.ReactNode | string>('');
    
    // Team Registration States
    const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
    const [teamFile, setTeamFile] = useState<File | null>(null);
    const [isProcessingTeamFile, setIsProcessingTeamFile] = useState(false);
    const [teamUploadResult, setTeamUploadResult] = useState<{ newSwimmers: number; updatedSwimmers: number; errors: string[] } | null>(null);

    // State for auto-fill feature
    const [isCheckingName, setIsCheckingName] = useState(false);
    const [existingSwimmer, setExistingSwimmer] = useState<Swimmer | null>(null);

    // State for deadline countdown
    const [timeLeft, setTimeLeft] = useState('');
    const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
    
    // State for accordion
    const [openAccordion, setOpenAccordion] = useState<SwimStyle | null>(null);

    // Dynamic Age Groups Logic
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
    
    useEffect(() => {
        if (!competitionInfo?.registrationDeadline) {
            setIsDeadlinePassed(false);
            setTimeLeft('');
            return;
        }

        const deadline = new Date(competitionInfo.registrationDeadline);

        const updateCountdown = () => {
            const now = new Date();
            const difference = deadline.getTime() - now.getTime();

            if (difference <= 0) {
                setIsDeadlinePassed(true);
                setTimeLeft('Batas waktu pendaftaran telah berakhir.');
                return;
            }

            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);

            setTimeLeft(`${days} hari ${hours} jam ${minutes} menit ${seconds} detik`);
        };

        updateCountdown();
        const intervalId = setInterval(updateCountdown, 1000);

        return () => clearInterval(intervalId);
    }, [competitionInfo?.registrationDeadline]);
    
    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '' && formData.ageGroup !== '';
        const hasSelectedEvent = Object.values(selectedEvents).some((e: any) => (e as { selected: boolean }).selected);
        return hasPersonalInfo && hasSelectedEvent;
    }, [formData, selectedEvents]);
    
    const availableEvents = useMemo(() => {
        const registeredEventIds = new Set<string>();
        if (existingSwimmer) {
            localEvents.forEach(event => {
                if (event.entries.some(entry => entry.swimmerId === existingSwimmer.id)) {
                    registeredEventIds.add(event.id);
                }
            });
        }

        return localEvents
            .filter((event: SwimEvent) => {
                if (registeredEventIds.has(event.id)) return false;

                const genderMatch = event.gender === "Mixed" || 
                                   (formData.gender === "Male" && event.gender === "Men's") || 
                                   (formData.gender === "Female" && event.gender === "Women's");
                
                if (!genderMatch) return false;

                if (formData.ageGroup) {
                    return !event.category || event.category === formData.ageGroup;
                }

                return false;
            })
            .sort((a,b) => a.distance - b.distance || a.style.localeCompare(b.style));
    }, [localEvents, formData.gender, formData.ageGroup, existingSwimmer]);

    const groupedAvailableEvents = useMemo(() => {
        return availableEvents.reduce((acc: Record<SwimStyle, SwimEvent[]>, event: SwimEvent) => {
            const style = event.style;
            if (!acc[style]) {
                acc[style] = [];
            }
            acc[style].push(event);
            return acc;
        }, {} as Record<SwimStyle, SwimEvent[]>);
    }, [availableEvents]);
    
    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: any) => (e as { selected: boolean }).selected).length;
    }, [selectedEvents]);

    const selectedEventsSummary = useMemo(() => {
        return (Object.entries(selectedEvents) as [string, any][])
            .filter(([_, val]) => (val as { selected: boolean }).selected)
            .map(([eventId, val]) => {
                const event = localEvents.find(e => e.id === eventId);
                if (!event) return null;
                
                const typedVal = val as { time: RegistrationTime };
                let timeStr = 'NT';
                const min = typedVal.time.min || '0';
                const sec = typedVal.time.sec || '0';
                const ms = typedVal.time.ms || '0';
                
                if (min === '99' && sec === '99' && ms === '99') {
                    timeStr = 'NT';
                } else {
                    timeStr = `${min.padStart(2, '0')}:${sec.padStart(2, '0')}.${ms.padStart(2, '0')}`;
                }

                return { event, timeStr };
            })
            .filter((item): item is { event: SwimEvent, timeStr: string } => item !== null)
            .sort((a, b) => {
                const styleCompare = a.event.style.localeCompare(b.event.style);
                if (styleCompare !== 0) return styleCompare;
                return a.event.distance - b.event.distance;
            });
    }, [selectedEvents, localEvents]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let finalValue: string | number = value;

        if (name === 'birthYear') {
            finalValue = parseInt(value);
        } else if (name === 'name' || name === 'club') {
            finalValue = toTitleCase(value);
        }

        setFormData(prev => ({ ...prev, [name]: finalValue }));
        setError('');
        setSuccessMessage('');
    };

    const handleEventSelectionChange = (eventId: string) => {
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                selected: !prev[eventId]?.selected,
                time: prev[eventId]?.time || { min: '99', sec: '99', ms: '99' },
            },
        }));
    };

    const handleTimeChange = (eventId: string, part: keyof RegistrationTime, value: string) => {
        setSelectedEvents(prev => {
            const currentEvent = prev[eventId] || { selected: true, time: { min: '99', sec: '99', ms: '99' } };
            return {
                ...prev,
                [eventId]: {
                    ...currentEvent,
                    time: { ...currentEvent.time, [part]: value },
                },
            };
        });
    };

    const handleSetNoTime = (eventId: string) => {
        handleTimeChange(eventId, 'min', '99');
        handleTimeChange(eventId, 'sec', '99');
        handleTimeChange(eventId, 'ms', '99');
    };

    const handleNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const swimmerName = e.target.value.trim();
        if (swimmerName.length < 3) {
            if (existingSwimmer) {
                setExistingSwimmer(null);
                setFormData(prev => ({ ...prev, club: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', ageGroup: '' }));
            }
            return;
        }
        setIsCheckingName(true);
        const foundSwimmer = await findSwimmerByName(swimmerName);
        setIsCheckingName(false);
        if (foundSwimmer) {
            setFormData({
                name: foundSwimmer.name,
                club: foundSwimmer.club,
                birthYear: foundSwimmer.birthYear,
                gender: foundSwimmer.gender,
                ageGroup: foundSwimmer.ageGroup || '',
            });
            setExistingSwimmer(foundSwimmer);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsSubmitting(true);

        if (!formData.name.trim() || !formData.club.trim() || !formData.ageGroup) {
            setError('Data atlet (Nama, Tim, and KU) wajib diisi lengkap.');
            setIsSubmitting(false);
            return;
        }

        const registrationsToSubmit = [];
        for (const [eventId, val] of Object.entries(selectedEvents)) {
            const eventValue = val as { selected: boolean; time: RegistrationTime };
            if (eventValue.selected) {
                const min = parseInt(eventValue.time.min, 10) || 0;
                const sec = parseInt(eventValue.time.sec, 10) || 0;
                const ms = parseInt(eventValue.time.ms, 10) || 0;

                if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
                    setError(`Input detik harus di bawah 60.`);
                    setIsSubmitting(false);
                    return;
                }

                registrationsToSubmit.push({
                    eventId,
                    seedTime: parseTimeToMs(eventValue.time),
                });
            }
        }

        if (registrationsToSubmit.length === 0) {
            setError('Anda harus memilih setidaknya satu nomor lomba.');
            setIsSubmitting(false);
            return;
        }

        const result: OnlineRegistrationResponse = await processOnlineRegistration(formData, registrationsToSubmit);
        setIsSubmitting(false);

        if (result.success && result.swimmer) {
            const successText = (
                <div className="text-left">
                    <p className="font-bold text-lg mb-2">Pendaftaran untuk {result.swimmer.name} berhasil!</p>
                    <p className="mb-2">Anda sekarang terdaftar di nomor lomba yang dipilih.</p>
                </div>
            );
            setSuccessMessage(successText);
            onRegistrationSuccess();
            setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '', ageGroup: '' });
            setSelectedEvents({});
        } else {
            setError(result.message || 'Terjadi kesalahan.');
        }
    };

    // --- Team Registration Logic ---
    const handleDownloadTemplate = () => {
        if (typeof XLSX === 'undefined') return;
        setIsDownloadingTemplate(true);
        
        try {
            const workbook = XLSX.utils.book_new();
            
            // --- DATA PREPARATION ---
            const allKUs = [...ageOptions];
            const eventsByKU: Record<string, string[]> = {};
            allKUs.forEach(ku => {
                eventsByKU[ku] = localEvents
                    .filter(e => e.category === ku)
                    .map(e => formatEventName(e));
            });
            // Open Category (no specific KU)
            const openEvents = localEvents
                .filter(e => !e.category)
                .map(e => formatEventName(e));
            if (openEvents.length > 0) {
                eventsByKU["Open"] = openEvents;
                if (!allKUs.includes("Open")) allKUs.push("Open");
            }

            // --- Sheet 1: Form Pendaftaran ---
            const templateData = [
                {
                    "Nama Atlet": "CONTOH NAMA ATLET",
                    "Tahun Lahir": 2010,
                    "Jenis Kelamin (L/P)": "L",
                    "Nama Tim": "NAMA KLUB ANDA",
                    "KU": allKUs[0] || "Open",
                    "Nomor Lomba": eventsByKU[allKUs[0] || "Open"]?.[0] || "",
                    "Waktu Unggulan (mm:ss.SS)": "01:25.50"
                }
            ];
            const wsTemplate = XLSX.utils.json_to_sheet(templateData);
            wsTemplate['!cols'] = [ { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 50 }, { wch: 25 } ];

            // --- Sheet 2: Data Master (Source for Dropdowns) ---
            const masterAOA: any[][] = [
                ["DAFTAR KU", "", "DAFTAR NOMOR LOMBA PER KATEGORI"],
                ...allKUs.map(ku => [ku])
            ];
            
            const maxEvents = Math.max(...Object.values(eventsByKU).map(list => list.length), 1);
            for (let i = 0; i < maxEvents; i++) {
                if (!masterAOA[i + 1]) masterAOA[i + 1] = Array(allKUs.length + 2).fill("");
                allKUs.forEach((ku, kuIdx) => {
                    const eventName = eventsByKU[ku][i] || "";
                    masterAOA[i + 1][kuIdx + 2] = eventName;
                });
            }
            
            const wsMaster = XLSX.utils.aoa_to_sheet(masterAOA);
            XLSX.utils.book_append_sheet(workbook, wsMaster, "DataMaster");

            // --- NAMED RANGES (Excel logic for dependent dropdowns) ---
            const sanitize = (name: string) => 'VAL_' + name.replace(/[^a-zA-Z0-9]/g, '_');
            
            if (!workbook.Workbook) workbook.Workbook = {};
            if (!workbook.Workbook.Names) workbook.Workbook.Names = [];

            // 1. Range for KU List
            workbook.Workbook.Names.push({
                name: "LIST_KU",
                formula: `DataMaster!$A$2:$A$${allKUs.length + 1}`
            });

            // 2. Range for each category's events
            allKUs.forEach((ku, idx) => {
                const colLetter = String.fromCharCode(67 + idx); // Column C, D, E...
                const eventCount = eventsByKU[ku].length;
                if (eventCount > 0) {
                    workbook.Workbook.Names.push({
                        name: sanitize(ku),
                        formula: `DataMaster!$${colLetter}$2:$${colLetter}$${eventCount + 1}`
                    });
                }
            });

            // --- DATA VALIDATION ---
            const maxRows = 500;
            if (!wsTemplate['!dataValidation']) wsTemplate['!dataValidation'] = [];

            // Gender
            wsTemplate['!dataValidation'].push({
                sqref: `C2:C${maxRows}`,
                opts: { type: 'list', formula1: '"L,P"', showDropDown: true }
            });

            // KU (Primary Dropdown)
            wsTemplate['!dataValidation'].push({
                sqref: `E2:E${maxRows}`,
                opts: { 
                    type: 'list', 
                    formula1: "LIST_KU", 
                    showDropDown: true,
                    error: 'Silakan pilih kategori yang terdaftar.',
                    errorTitle: 'Kategori Tidak Valid'
                }
            });

            // Event Number (Dependent Dropdown using INDIRECT)
            wsTemplate['!dataValidation'].push({
                sqref: `F2:F${maxRows}`,
                opts: { 
                    type: 'list', 
                    // Excel formula to sanitize cell E value and look up the named range
                    formula1: 'INDIRECT("VAL_"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(E2," ","_"),"-","_"),"/","_"),".","_"),"(","_"))',
                    showDropDown: true,
                    error: 'Silakan pilih Nomor Lomba yang sesuai dengan KU.',
                    errorTitle: 'Pilihan Tidak Sesuai'
                }
            });

            XLSX.utils.book_append_sheet(workbook, wsTemplate, "Form Pendaftaran");
            workbook.SheetNames.reverse();

            XLSX.writeFile(workbook, `Template_Reg_${competitionInfo?.eventName.split('\n')[0].replace(/\s+/g, '_')}.xlsx`);
        } catch (err) {
            console.error("Gagal membuat template:", err);
            alert("Terjadi kesalahan saat membuat file template.");
        } finally {
            setIsDownloadingTemplate(false);
        }
    };

    const handleTeamFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setTeamFile(e.target.files[0]);
            setTeamUploadResult(null);
        }
    };

    const handleProcessTeamFile = () => {
        if (!teamFile || typeof XLSX === 'undefined') return;
        setIsProcessingTeamFile(true);
        setTeamUploadResult(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);
                
                const result = await processParticipantUpload(json);
                setTeamUploadResult(result);
                if (result.newSwimmers > 0 || result.updatedSwimmers > 0) {
                    onRegistrationSuccess();
                }
            } catch (err: any) {
                setTeamUploadResult({ newSwimmers: 0, updatedSwimmers: 0, errors: ["Gagal memproses file: " + err.message] });
            } finally {
                setIsProcessingTeamFile(false);
            }
        };
        reader.readAsArrayBuffer(teamFile);
    };

    const isRegistrationDisabled = isDeadlinePassed || !competitionInfo?.isRegistrationOpen;

    if (isDataLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Spinner />
                <p className="text-text-secondary mt-4">Memuat data kompetisi...</p>
            </div>
        );
    }
    
     if (isRegistrationDisabled && !isDataLoading) {
        return (
             <div className="min-h-screen bg-gradient-to-br from-gray-100 to-slate-200 dark:from-slate-800 dark:to-gray-900 flex flex-col items-center justify-center p-4 text-center">
                <Card className="max-w-xl">
                    <h1 className="text-2xl font-bold text-primary mb-4">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <p className="text-lg text-red-500 font-semibold mb-2">Pendaftaran Online Saat Ini Ditutup</p>
                    <p className="text-text-secondary mb-6">
                        {timeLeft || 'Pendaftaran untuk kompetisi ini belum dibuka atau sudah berakhir.'}
                    </p>
                    <Button onClick={onBackToLogin}>Kembali ke Halaman Utama</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="mx-auto h-20 md:h-24 object-contain mb-4" />}
                    <h1 className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h2 className="text-xl md:text-2xl font-semibold text-text-secondary tracking-wide mt-1">{competitionInfo?.eventName.split('\n')[1]}</h2>
                    <h3 className="text-2xl font-bold text-text-primary mt-4">Pendaftaran Online</h3>
                </header>

                {timeLeft && (
                    <Card className="text-center mb-4 border-primary/50 bg-primary/5">
                        <p className="font-semibold text-text-secondary">Sisa Waktu Pendaftaran:</p>
                        <p className="text-2xl font-bold text-primary">{timeLeft}</p>
                    </Card>
                )}

                {regType === 'CHOICE' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Card 
                            className="cursor-pointer hover:border-primary hover:shadow-2xl transition-all group flex flex-col items-center text-center p-8"
                            onClick={() => setRegType('INDIVIDUAL')}
                        >
                            <div className="text-primary group-hover:scale-110 transition-transform mb-4">
                                <UserIcon />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Pendaftaran Mandiri</h3>
                            <p className="text-text-secondary">Pendaftaran atlet satu-per-satu melalui formulir online.</p>
                        </Card>
                        <Card 
                            className="cursor-pointer hover:border-primary hover:shadow-2xl transition-all group flex flex-col items-center text-center p-8"
                            onClick={() => setRegType('TEAM')}
                        >
                            <div className="text-primary group-hover:scale-110 transition-transform mb-4">
                                <UserGroupIcon />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Pendaftaran Kolektif</h3>
                            <p className="text-text-secondary">Pendaftaran banyak atlet sekaligus menggunakan file Excel (untuk Tim/Klub).</p>
                        </Card>
                    </div>
                )}

                {regType === 'INDIVIDUAL' && (
                    !successMessage ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                             <div className="flex justify-between items-center no-print">
                                <Button variant="secondary" onClick={() => setRegType('CHOICE')}>&larr; Ganti Tipe Pendaftaran</Button>
                            </div>
                            <Card>
                                <h2 className="text-xl font-bold mb-4">Data Atlet</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Nama Lengkap Atlet" id="name" name="name" value={formData.name} onChange={handleFormChange} onBlur={handleNameBlur} required />
                                    <Input label="Nama Tim" id="club" name="club" value={formData.club} onChange={handleFormChange} required />
                                    <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                    <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                        <option value="Male">Laki-laki (Male)</option>
                                        <option value="Female">Perempuan (Female)</option>
                                    </Select>
                                    <Select label="Kelompok Umur (KU)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                        <option value="">-- Pilih KU --</option>
                                        {ageOptions.map((ku: string) => <option key={ku} value={ku}>{ku}</option>)}
                                    </Select>
                                </div>
                            </Card>
                            
                            <Card>
                                <h2 className="text-xl font-bold mb-4">Pilih Nomor Lomba</h2>
                                {!formData.ageGroup ? (
                                    <p className="text-text-secondary text-center py-4 italic">Pilih KU terlebih dahulu untuk melihat nomor lomba.</p>
                                ) : Object.entries(groupedAvailableEvents).length > 0 ? (
                                    <div className="space-y-2">
                                        {(Object.entries(groupedAvailableEvents) as [SwimStyle, SwimEvent[]][]).map(([style, eventsInStyle]) => {
                                            const selectedCountInStyle = eventsInStyle.filter(e => (selectedEvents[e.id] as any)?.selected).length;
                                            return (
                                                <div key={style} className="border border-border rounded-lg">
                                                    <button type="button" onClick={() => handleAccordionToggle(style as SwimStyle)} className={`w-full flex justify-between items-center p-4 bg-background hover:bg-surface/50 transition-colors ${selectedCountInStyle > 0 ? 'bg-primary/5' : ''}`}>
                                                        <h3 className={`text-lg font-semibold flex items-center ${selectedCountInStyle > 0 ? 'text-primary' : ''}`}>
                                                            {translateSwimStyle(style as SwimStyle)}
                                                            {selectedCountInStyle > 0 && <span className="ml-3 text-xs bg-primary text-white px-2 py-0.5 rounded-full">{selectedCountInStyle} Dipilih</span>}
                                                        </h3>
                                                        <ChevronDownIcon isOpen={openAccordion === style} />
                                                    </button>
                                                    {openAccordion === style && (
                                                        <div className="p-4 space-y-4">
                                                            {eventsInStyle.map(event => (
                                                                <div key={event.id} className="border-b border-border last:border-b-0 pb-4 last:pb-0">
                                                                    <div className="flex items-start">
                                                                        <input type="checkbox" id={`event-${event.id}`} checked={(selectedEvents[event.id] as any)?.selected || false} onChange={() => handleEventSelectionChange(event.id)} className="h-5 w-5 rounded border-gray-300 text-primary mt-1" />
                                                                        <label htmlFor={`event-${event.id}`} className="ml-3 flex-grow cursor-pointer"><span className="font-semibold text-text-primary">{formatEventName(event)}</span></label>
                                                                    </div>
                                                                    {(selectedEvents[event.id] as any)?.selected && (
                                                                        <div className="mt-2 ml-8 grid grid-cols-3 md:grid-cols-4 gap-2 items-end">
                                                                            <Input label="Menit" id={`min-${event.id}`} type="number" min="0" value={(selectedEvents[event.id] as any).time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                            <Input label="Detik" id={`sec-${event.id}`} type="number" min="0" max="99" value={(selectedEvents[event.id] as any).time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                            <Input label="ss/100" id={`ms-${event.id}`} type="number" min="0" max="99" value={(selectedEvents[event.id] as any).time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                            <Button type="button" variant="secondary" onClick={() => handleSetNoTime(event.id)}>No Time</Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-text-secondary text-center py-4">Tidak ada nomor lomba tersedia.</p>
                                )}
                            </Card>
                            
                            {selectedEventsSummary.length > 0 && (
                                <Card className="border-l-4 border-primary bg-primary/5">
                                    <h3 className="font-bold text-lg mb-2">Ringkasan Pilihan</h3>
                                    <ul className="space-y-1">
                                        {selectedEventsSummary.map(({ event, timeStr }) => (
                                            <li key={event.id} className="flex justify-between text-sm py-1 border-b border-border/50">
                                                <span>{formatEventName(event)}</span>
                                                <span className="font-mono font-bold">{timeStr}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </Card>
                            )}

                            {error && <p className="text-red-500 text-center mb-4 font-semibold">{error}</p>}
                            <div className="sticky bottom-4 z-10 pt-4">
                                <Button type="submit" disabled={isSubmitting || !isFormValid} className="w-full py-4 text-xl shadow-2xl">
                                    {isSubmitting ? <Spinner /> : 'Kirim Pendaftaran'}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <Card className="text-center p-12">
                            <div className="text-green-500 mx-auto h-16 w-16 mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            {successMessage}
                            <div className="flex flex-col gap-3 mt-8">
                                <Button onClick={() => setSuccessMessage('')}>Daftarkan Atlet Lain</Button>
                                <Button variant="secondary" onClick={onBackToLogin}>Selesai & Keluar</Button>
                            </div>
                        </Card>
                    )
                )}

                {regType === 'TEAM' && (
                    <div className="space-y-6 mt-4">
                         <div className="flex justify-between items-center no-print">
                            <Button variant="secondary" onClick={() => setRegType('CHOICE')}>&larr; Ganti Tipe Pendaftaran</Button>
                        </div>
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">Pendaftaran Kolektif (Tim/Klub)</h2>
                            <p className="text-text-secondary mb-6">Gunakan fitur ini jika Anda mendaftarkan banyak atlet sekaligus untuk menghindari penginputan berulang kali.</p>
                            
                            <div className="space-y-8">
                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="bg-primary text-white h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md">1</span>
                                        <h3 className="text-lg font-bold">Unduh Template Excel Khusus</h3>
                                    </div>
                                    <Card className="bg-primary/5 border-dashed border-primary/30">
                                        <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                                            Klik tombol di bawah untuk mendapatkan file Excel yang sudah dikonfigurasi dengan:
                                            <ul className="list-disc list-inside mt-2 font-medium">
                                                <li>Dropdown Jenis Kelamin (L/P)</li>
                                                <li>Dropdown KU sesuai pengaturan acara</li>
                                                <li><strong>Kunci Otomatis:</strong> Kolom Nomor Lomba akan dikunci dan hanya menampilkan lomba yang sesuai dengan KU yang Anda pilih.</li>
                                            </ul>
                                        </p>
                                        <Button onClick={handleDownloadTemplate} disabled={isDownloadingTemplate} variant="secondary" className="flex items-center gap-2">
                                            {isDownloadingTemplate ? <Spinner /> : <><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Unduh Template Excel</>}
                                        </Button>
                                    </Card>
                                </section>

                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="bg-primary text-white h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shadow-md">2</span>
                                        <h3 className="text-lg font-bold">Isi Data & Unggah Kembali</h3>
                                    </div>
                                    <div className="p-4 border border-border rounded-lg bg-background">
                                        <p className="text-sm text-text-secondary mb-4">Pastikan data nama atlet, tim, <strong>Jenis Kelamin (L/P)</strong>, <strong>KU</strong>, dan <strong>Nomor Lomba</strong> sudah sesuai dengan pilihan di template.</p>
                                        <div className="flex flex-col md:flex-row items-center gap-4">
                                            <input type="file" id="team-upload" accept=".xlsx, .xls" className="hidden" onChange={handleTeamFileChange} />
                                            <Button type="button" onClick={() => document.getElementById('team-upload')?.click()} variant="secondary">Pilih File Selesai</Button>
                                            {teamFile && <div className="flex items-center gap-2 text-primary font-bold bg-primary/10 px-3 py-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>{teamFile.name}</div>}
                                        </div>
                                    </div>
                                    <div className="mt-6">
                                        <Button 
                                            onClick={handleProcessTeamFile} 
                                            disabled={!teamFile || isProcessingTeamFile}
                                            className="w-full py-4 text-xl shadow-xl hover:shadow-2xl"
                                        >
                                            {isProcessingTeamFile ? <Spinner /> : 'Kirim Pendaftaran Kolektif'}
                                        </Button>
                                    </div>
                                </section>
                            </div>

                            {teamUploadResult && (
                                <div className="mt-8 p-6 bg-surface rounded-lg border-2 border-primary/30 animate-in fade-in zoom-in shadow-inner">
                                    <h3 className="font-bold text-xl mb-4 border-b pb-2">Laporan Pendaftaran Kolektif:</h3>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="p-4 bg-green-500/10 rounded-lg">
                                                <p className="text-green-600 font-bold text-2xl">{teamUploadResult.updatedSwimmers}</p>
                                                <p className="text-green-800 text-sm font-medium uppercase tracking-tight">Pendaftaran Berhasil</p>
                                            </div>
                                            <div className="p-4 bg-blue-500/10 rounded-lg">
                                                <p className="text-blue-600 font-bold text-2xl">{teamUploadResult.newSwimmers}</p>
                                                <p className="text-blue-800 text-sm font-medium uppercase tracking-tight">Atlet Baru Dibuat</p>
                                            </div>
                                        </div>
                                        
                                        {teamUploadResult.errors.length > 0 && (
                                            <div className="mt-4 p-4 bg-red-500/5 rounded-lg border border-red-200">
                                                <p className="text-red-500 font-bold mb-2">Daftar Kesalahan ({teamUploadResult.errors.length}):</p>
                                                <ul className="list-disc list-inside text-red-400 text-sm max-h-40 overflow-y-auto space-y-1">
                                                    {teamUploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-8 text-center">
                                        <Button onClick={onBackToLogin} className="px-10">Selesai & Kembali</Button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                )}
                
                <footer className="text-center p-4 mt-8 no-print">
                    <Button variant="secondary" onClick={onBackToLogin}>
                        &larr; Batal & Kembali ke Utama
                    </Button>
                </footer>
            </div>
        </div>
    );
};
