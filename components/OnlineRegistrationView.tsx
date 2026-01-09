
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
    
    useEffect(() => {
        if (!competitionInfo?.registrationDeadline) return;
        const deadline = new Date(competitionInfo.registrationDeadline);
        const updateCountdown = () => {
            const now = new Date();
            const difference = deadline.getTime() - now.getTime();
            if (difference <= 0) {
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

    // Calculate how many events the user is allowed to pick based on payment
    const maxAllowedEvents = useMemo(() => {
        if (competitionInfo?.isFree) return 999;
        const amount = parseInt(formData.paymentAmount) || 0;
        const fee = competitionInfo?.feePerEvent || 1;
        return Math.floor(amount / fee);
    }, [formData.paymentAmount, competitionInfo]);

    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: any) => e.selected).length;
    }, [selectedEvents]);

    const isPaymentStepValid = useMemo(() => {
        if (competitionInfo?.isFree) return true;
        return formData.paymentProof !== null && parseInt(formData.paymentAmount) >= (competitionInfo?.feePerEvent || 0);
    }, [formData.paymentProof, formData.paymentAmount, competitionInfo]);

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '' && formData.ageGroup !== '';
        const hasSelectedEvent = selectedEventCount > 0 && selectedEventCount <= maxAllowedEvents;
        return hasPersonalInfo && isPaymentStepValid && hasSelectedEvent;
    }, [formData, selectedEventCount, maxAllowedEvents, isPaymentStepValid]);

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

    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const handleEventSelectionChange = (eventId: string) => {
        const isCurrentlySelected = !!selectedEvents[eventId]?.selected;
        
        // Prevent selecting more if quota is full
        if (!isCurrentlySelected && selectedEventCount >= maxAllowedEvents && !competitionInfo?.isFree) {
            alert(`Kuota pemilihan nomor sudah penuh (Maksimal ${maxAllowedEvents} nomor berdasarkan nominal transfer Anda).`);
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
                    <h1 className="text-3xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h3 className="text-xl font-bold mt-2 opacity-80 uppercase tracking-widest">Pendaftaran Online</h3>
                </header>

                {timeLeft && <Card className="text-center mb-4 border-primary/20"><p className="font-bold text-primary">Sisa Waktu Pendaftaran: {timeLeft}</p></Card>}

                {regType === 'CHOICE' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group" onClick={() => setRegType('INDIVIDUAL')}>
                            <UserIcon /><h3 className="text-2xl font-bold mt-4 group-hover:text-primary transition-colors">Pendaftaran Mandiri</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Daftarkan atlet satu per satu</p>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group" onClick={() => setRegType('TEAM')}>
                            <UserGroupIcon /><h3 className="text-2xl font-bold mt-4 group-hover:text-primary transition-colors">Pendaftaran Kolektif</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Gunakan Excel untuk mendaftarkan banyak atlet sekaligus</p>
                        </Card>
                    </div>
                )}

                {regType === 'INDIVIDUAL' && !successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
                        <div className="flex justify-start">
                            <Button variant="secondary" onClick={() => setRegType('CHOICE')}>&larr; Kembali ke Pilihan</Button>
                        </div>
                        
                        {/* LANGKAH 1: PROFIL */}
                        <Card className="shadow-xl">
                            <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                Profil Atlet
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} placeholder="Masukkan nama sesuai akta" required />
                                <Input label="Nama Tim / Klub" id="club" name="club" value={formData.club} onChange={handleFormChange} placeholder="Masukkan nama klub" required />
                                <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                    <option value="Male">Laki-laki</option>
                                    <option value="Female">Perempuan</option>
                                </Select>
                                <Select label="Kelompok Umur (KU)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                    <option value="">-- Pilih KU --</option>
                                    {ageOptions.map(ku => <option key={ku} value={ku}>{ku}</option>)}
                                </Select>
                            </div>
                        </Card>

                        {/* LANGKAH 2: PEMBAYARAN & BUKTI */}
                        <Card className="shadow-xl border-l-4 border-l-primary">
                            <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                Pembayaran & Bukti Transfer
                            </h2>
                            
                            {competitionInfo?.isFree ? (
                                <div className="bg-green-100 p-4 rounded-md text-green-800 font-bold border border-green-200">
                                    ✓ Kompetisi ini Gratis. Tidak diperlukan bukti pembayaran.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-surface p-4 rounded-lg border border-primary/20 shadow-inner">
                                        <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">Tujuan Transfer</p>
                                        <p className="text-2xl font-black text-text-primary tracking-tighter">{competitionInfo?.accountNumber || '-'}</p>
                                        <p className="text-sm font-bold uppercase text-primary">{competitionInfo?.recipientName || '-'}</p>
                                        
                                        <div className="mt-4 pt-4 border-t border-border flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] text-text-secondary font-bold uppercase">Biaya Pendaftaran</p>
                                                <p className="text-xl font-black text-text-primary">Rp {(competitionInfo?.feePerEvent || 0).toLocaleString('id-ID')}<span className="text-xs font-normal text-text-secondary"> / nomor</span></p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-text-secondary uppercase">Unggah Bukti Bayar</label>
                                            <div className="relative border-2 border-dashed border-border rounded-xl p-4 bg-background/50 hover:bg-primary/5 transition-all">
                                                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" required />
                                                <div className="text-center">
                                                    {formData.paymentProof ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-green-500 text-4xl mb-2">✓</span>
                                                            <p className="text-xs font-black text-green-600">Bukti Terpilih</p>
                                                            <p className="text-[10px] text-text-secondary mt-1">Klik untuk mengganti file</p>
                                                        </div>
                                                    ) : (
                                                        <div className="py-2">
                                                            <svg className="mx-auto h-10 w-10 text-text-secondary opacity-50" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                            <p className="mt-2 text-xs font-bold text-text-secondary">Klik / Seret Gambar Disini</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <Input 
                                                label="Jumlah Transfer (Rp)" 
                                                id="paymentAmount" 
                                                name="paymentAmount" 
                                                type="number" 
                                                value={formData.paymentAmount} 
                                                onChange={handleFormChange} 
                                                placeholder="Contoh: 150000"
                                                required 
                                            />
                                            {maxAllowedEvents > 0 && maxAllowedEvents < 999 && (
                                                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg animate-in fade-in zoom-in">
                                                    <p className="text-[10px] text-primary font-black uppercase">Hasil Verifikasi Nominal:</p>
                                                    <p className="text-lg font-black text-primary">Kuota {maxAllowedEvents} Nomor Lomba</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* LANGKAH 3: PILIH NOMOR LOMBA */}
                        <Card className="shadow-xl">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-black flex items-center gap-2">
                                    <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
                                    Pilih Nomor Lomba
                                </h2>
                                {!competitionInfo?.isFree && formData.paymentAmount && (
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-text-secondary uppercase">Sisa Kuota Pilihan</p>
                                        <p className={`text-xl font-black ${maxAllowedEvents - selectedEventCount === 0 ? 'text-red-500' : 'text-primary'}`}>
                                            {maxAllowedEvents - selectedEventCount} <span className="text-xs font-normal">nomor lagi</span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!formData.ageGroup ? (
                                <div className="text-center py-10 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-700 font-bold">Harap selesaikan Langkah 1 (Pilih KU) terlebih dahulu.</p>
                                </div>
                            ) : !isPaymentStepValid ? (
                                <div className="text-center py-10 bg-red-50 rounded-lg border border-red-200">
                                    <p className="text-red-700 font-bold">Harap selesaikan Langkah 2 (Unggah Bukti & Input Nominal) terlebih dahulu.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]: any) => (
                                        <div key={style} className="border border-border rounded-xl overflow-hidden shadow-sm">
                                            <button type="button" onClick={() => handleAccordionToggle(style)} className="w-full flex justify-between p-4 bg-surface hover:bg-primary/5 transition-colors">
                                                <h3 className="font-black text-text-primary uppercase text-sm tracking-widest">{translateSwimStyle(style as SwimStyle)}</h3>
                                                <ChevronDownIcon isOpen={openAccordion === style} />
                                            </button>
                                            {openAccordion === style && (
                                                <div className="p-4 space-y-4 bg-background/30 border-t border-border">
                                                    {eventsInStyle.map((event: SwimEvent) => (
                                                        <div key={event.id} className="flex flex-col border-b border-border last:border-0 pb-4 last:pb-0">
                                                            <div className="flex items-center">
                                                                <input 
                                                                    type="checkbox" 
                                                                    id={`check-${event.id}`}
                                                                    checked={selectedEvents[event.id]?.selected || false} 
                                                                    onChange={() => handleEventSelectionChange(event.id)} 
                                                                    className="h-6 w-6 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-20" 
                                                                />
                                                                <label htmlFor={`check-${event.id}`} className={`ml-3 font-bold text-text-primary cursor-pointer flex-grow ${selectedEvents[event.id]?.selected ? 'text-primary' : ''}`}>
                                                                    {formatEventName(event)}
                                                                </label>
                                                            </div>
                                                            {selectedEvents[event.id]?.selected && (
                                                                <div className="mt-4 ml-9 bg-surface p-3 rounded-lg border border-primary/20 grid grid-cols-3 gap-3 animate-in slide-in-from-left-2">
                                                                    <div className="col-span-3 mb-1"><p className="text-[10px] font-black uppercase text-text-secondary">Waktu Unggulan (Seed Time)</p></div>
                                                                    <Input label="Menit" type="number" min="0" value={selectedEvents[event.id].time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                    <Input label="Detik" type="number" min="0" max="59" value={selectedEvents[event.id].time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                    <Input label="ss/100" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {Object.keys(groupedAvailableEvents).length === 0 && (
                                        <p className="text-center py-10 text-text-secondary italic">Tidak ada nomor lomba yang tersedia untuk kategori dan jenis kelamin ini.</p>
                                    )}
                                </div>
                            )}
                        </Card>

                        {error && <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded-xl font-black text-center animate-bounce">{error}</div>}
                        
                        <div className="pt-4">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting || !isFormValid} 
                                className="w-full py-6 text-2xl font-black shadow-2xl rounded-2xl tracking-tighter"
                            >
                                {isSubmitting ? <div className="flex items-center justify-center gap-3"><Spinner /> <span>Mendaftarkan...</span></div> : 'KIRIM DATA PENDAFTARAN'}
                            </Button>
                            <div className="mt-4 flex flex-col items-center gap-1 text-text-secondary">
                                <p className="text-[10px] uppercase font-bold">Ringkasan Pendaftaran:</p>
                                <p className="text-xs font-medium">Atlet: <span className="font-bold text-text-primary">{formData.name || '-'}</span> | Nomor Dipilih: <span className="font-bold text-text-primary">{selectedEventCount}</span></p>
                            </div>
                        </div>
                    </form>
                )}

                {successMessage && (
                    <Card className="text-center p-12 shadow-2xl border-2 border-green-500 rounded-3xl animate-in zoom-in duration-500">
                        <div className="bg-green-100 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-green-500 shadow-xl">
                            <span className="text-green-500 text-6xl font-bold">✓</span>
                        </div>
                        <h2 className="text-3xl font-black text-text-primary mb-2 italic tracking-tighter">PENDAFTARAN BERHASIL!</h2>
                        <p className="text-lg text-text-secondary font-medium leading-relaxed">{successMessage}</p>
                        <p className="mt-4 text-sm bg-background p-3 rounded-xl border border-border text-text-secondary italic">Panitia akan melakukan verifikasi bukti transfer Anda. Harap simpan bukti pembayaran fisik jika sewaktu-waktu diperlukan.</p>
                        <div className="mt-10 flex flex-col gap-4">
                            <Button onClick={() => { setSuccessMessage(''); setSelectedEvents({}); }} className="py-4 font-black text-lg">DAFTARKAN ATLET LAIN</Button>
                            <Button variant="secondary" onClick={onBackToLogin}>KEMBALI KE BERANDA</Button>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};
