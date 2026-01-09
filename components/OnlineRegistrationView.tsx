
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
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        paymentProof: null as string | null,
        paymentAmount: '' as string
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

    // Accordion state
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
    
    const [timeLeft, setTimeLeft] = useState('');
    const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
    
    useEffect(() => {
        if (!competitionInfo?.registrationDeadline) return;
        const deadline = new Date(competitionInfo.registrationDeadline);
        const updateCountdown = () => {
            const now = new Date();
            const difference = deadline.getTime() - now.getTime();
            if (difference <= 0) {
                setIsDeadlinePassed(true);
                setTimeLeft('Batas waktu berakhir.');
                return;
            }
            const days = Math.floor(difference / (86400000));
            const hours = Math.floor((difference % 86400000) / 3600000);
            const minutes = Math.floor((difference % 3600000) / 60000);
            setTimeLeft(`${days} hari ${hours} jam ${minutes} menit`);
        };
        updateCountdown();
        const id = setInterval(updateCountdown, 60000);
        return () => clearInterval(id);
    }, [competitionInfo]);

    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: any) => e.selected).length;
    }, [selectedEvents]);

    const totalFee = useMemo(() => {
        if (competitionInfo?.isFree) return 0;
        return selectedEventCount * (competitionInfo?.feePerEvent || 0);
    }, [selectedEventCount, competitionInfo]);

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '' && formData.ageGroup !== '';
        const hasSelectedEvent = selectedEventCount > 0;
        const paymentValid = (competitionInfo?.isFree) || (formData.paymentProof && formData.paymentAmount);
        return hasPersonalInfo && hasSelectedEvent && paymentValid;
    }, [formData, selectedEventCount, competitionInfo]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: (name === 'name' || name === 'club') ? toTitleCase(value) : value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, paymentProof: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
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
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                ...prev[eventId],
                time: { ...prev[eventId].time, [part]: value },
            },
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const registrationsToSubmit = Object.entries(selectedEvents)
            .filter(([_, val]: any) => val.selected)
            .map(([eventId, val]: any) => ({
                eventId,
                seedTime: parseTimeToMs(val.time),
            }));

        const swimmerPayload = {
            name: formData.name,
            birthYear: formData.birthYear,
            gender: formData.gender,
            club: formData.club,
            ageGroup: formData.ageGroup,
            paymentProof: formData.paymentProof,
            paymentAmount: parseInt(formData.paymentAmount) || 0
        };

        const result = await processOnlineRegistration(swimmerPayload, registrationsToSubmit);
        setIsSubmitting(false);

        if (result.success) {
            setSuccessMessage(`Pendaftaran untuk ${formData.name} berhasil!`);
            onRegistrationSuccess();
            setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '', ageGroup: '', paymentProof: null, paymentAmount: '' });
            setSelectedEvents({});
        } else {
            setError(result.message);
        }
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

    if (isDataLoading) return <div className="flex justify-center p-20"><Spinner /></div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="mx-auto h-20 mb-4" />}
                    <h1 className="text-3xl font-extrabold text-primary">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h3 className="text-2xl font-bold mt-4">Pendaftaran Online</h3>
                </header>

                {timeLeft && <Card className="text-center mb-4"><p className="font-bold text-primary">Sisa Waktu: {timeLeft}</p></Card>}

                {regType === 'CHOICE' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Card className="cursor-pointer hover:border-primary p-8 text-center" onClick={() => setRegType('INDIVIDUAL')}>
                            <UserIcon /><h3 className="text-2xl font-bold mt-4">Pendaftaran Mandiri</h3>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary p-8 text-center" onClick={() => setRegType('TEAM')}>
                            <UserGroupIcon /><h3 className="text-2xl font-bold mt-4">Pendaftaran Kolektif</h3>
                        </Card>
                    </div>
                )}

                {regType === 'INDIVIDUAL' && !successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Button variant="secondary" onClick={() => setRegType('CHOICE')}>&larr; Ganti Tipe</Button>
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Data Atlet</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} required />
                                <Input label="Nama Tim" id="club" name="club" value={formData.club} onChange={handleFormChange} required />
                                <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                    <option value="Male">Laki-laki</option>
                                    <option value="Female">Perempuan</option>
                                </Select>
                                <Select label="KU" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                    <option value="">-- Pilih KU --</option>
                                    {ageOptions.map(ku => <option key={ku} value={ku}>{ku}</option>)}
                                </Select>
                            </div>
                        </Card>

                        <Card>
                            <h2 className="text-xl font-bold mb-4">Pilih Nomor Lomba</h2>
                            <div className="space-y-2">
                                {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]: any) => (
                                    <div key={style} className="border border-border rounded-lg">
                                        <button type="button" onClick={() => handleAccordionToggle(style)} className="w-full flex justify-between p-4 bg-surface hover:bg-primary/5">
                                            <h3 className="font-semibold">{translateSwimStyle(style as SwimStyle)}</h3>
                                            <ChevronDownIcon isOpen={openAccordion === style} />
                                        </button>
                                        {openAccordion === style && (
                                            <div className="p-4 space-y-4">
                                                {eventsInStyle.map((event: SwimEvent) => (
                                                    <div key={event.id} className="flex flex-col border-b border-border pb-4">
                                                        <div className="flex items-center">
                                                            <input type="checkbox" checked={selectedEvents[event.id]?.selected || false} onChange={() => handleEventSelectionChange(event.id)} className="h-5 w-5 mr-3" />
                                                            <span className="font-medium">{formatEventName(event)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* SECTION PEMBAYARAN */}
                        {!(competitionInfo?.isFree) && (
                            <Card className="border-2 border-primary bg-primary/5">
                                <h2 className="text-xl font-bold mb-4 text-primary">Informasi Pembayaran</h2>
                                <div className="space-y-4">
                                    <div className="bg-surface p-4 rounded-lg border border-primary/20">
                                        <p className="text-sm text-text-secondary">Silakan transfer ke rekening berikut:</p>
                                        <p className="text-lg font-bold mt-1">{competitionInfo?.accountNumber}</p>
                                        <p className="font-semibold uppercase">{competitionInfo?.recipientName}</p>
                                        <div className="mt-4 pt-4 border-t border-primary/10">
                                            <div className="flex justify-between items-center text-lg">
                                                <span>Total Biaya:</span>
                                                <span className="font-bold text-primary">Rp {(totalFee).toLocaleString('id-ID')}</span>
                                            </div>
                                            <p className="text-xs text-text-secondary mt-1">({selectedEventCount} nomor lomba x Rp {(competitionInfo?.feePerEvent || 0).toLocaleString('id-ID')})</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">Unggah Bukti Bayar</label>
                                            <input type="file" accept="image/*" onChange={handleFileChange} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-hover" required />
                                            {formData.paymentProof && <p className="text-xs text-green-600 mt-1 font-bold">✓ Bukti terlampir</p>}
                                        </div>
                                        <Input 
                                            label="Jumlah Transfer (Nominal)" 
                                            id="paymentAmount" 
                                            name="paymentAmount" 
                                            type="number" 
                                            value={formData.paymentAmount} 
                                            onChange={handleFormChange} 
                                            placeholder="Sesuai bukti transfer"
                                            required 
                                        />
                                    </div>
                                </div>
                            </Card>
                        )}

                        {error && <p className="text-red-500 text-center font-bold">{error}</p>}
                        <Button type="submit" disabled={isSubmitting || !isFormValid} className="w-full py-4 text-xl">
                            {isSubmitting ? <Spinner /> : 'Kirim Pendaftaran'}
                        </Button>
                    </form>
                )}

                {successMessage && (
                    <Card className="text-center p-12">
                        <div className="text-green-500 text-6xl mb-4">✓</div>
                        <h2 className="text-2xl font-bold">{successMessage}</h2>
                        <Button className="mt-8" onClick={() => setSuccessMessage('')}>Daftar Lagi</Button>
                    </Card>
                )}
            </div>
        </div>
    );
};
