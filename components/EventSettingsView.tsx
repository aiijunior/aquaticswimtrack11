import React, { useState, useEffect, useMemo } from 'react';
import { getRecords, processRecordUpload, updateCompetitionInfo, updateEventSchedule, addOrUpdateRecord, deleteRecord, backupDatabase, clearAllData, restoreDatabase, deleteAllRecords } from '../services/databaseService';
import { login } from '../services/authService';
import type { CompetitionInfo, SwimEvent, SwimRecord } from '../types';
import { RecordType, SwimStyle, Gender } from '../types';
import { SWIM_STYLE_OPTIONS, GENDER_OPTIONS } from '../constants';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { ToggleSwitch } from './ui/ToggleSwitch';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { translateGender, translateSwimStyle, GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, formatTime, toTitleCase } from '../constants';

declare var XLSX: any;

interface EventSettingsViewProps {
    competitionInfo: CompetitionInfo | null;
    events: SwimEvent[];
    onDataUpdate: () => void;
}

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" />
    </svg>
);
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const ArrowUpIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>);
const ArrowDownIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);


// --- Helper Components ---
const ImageUpload: React.FC<{ label: string; image: string | null; onImageSelect: (file: File) => void; onImageClear: () => void; }> = ({ label, image, onImageSelect, onImageClear }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) onImageSelect(e.target.files[0]);
    };
    return (
        <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">{label}</label>
            <div className="mt-1 flex items-center space-x-4">
                <div className="w-24 h-24 bg-background rounded-md flex items-center justify-center overflow-hidden border border-border">
                    {image ? <img src={image} alt={`${label} preview`} className="object-contain h-full w-full" /> : <span className="text-xs text-text-secondary">Tidak ada logo</span>}
                </div>
                <div className="flex flex-col space-y-2">
                    <input type="file" id={`upload-${label}`} className="hidden" accept="image/*" onChange={handleFileChange} />
                    <Button type="button" onClick={() => document.getElementById(`upload-${label}`)?.click()}>Unggah</Button>
                    {image && <Button type="button" variant="danger" onClick={onImageClear}>Hapus</Button>}
                </div>
            </div>
        </div>
    );
};

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, id, ...props }) => (
    <div className="flex-1">
        <label htmlFor={id} className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
        <input id={id} {...props} className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary" />
    </div>
);

const initialRecordFormState = {
    type: RecordType.PORPROV,
    distance: 50,
    style: SwimStyle.FREESTYLE,
    gender: Gender.MALE,
    min: '0',
    sec: '0',
    ms: '00',
    holderName: '',
    yearSet: new Date().getFullYear(),
    isRelay: false,
    relayLegs: 4,
    locationSet: '',
    category: '',
};

// --- Main Component ---
export const EventSettingsView: React.FC<EventSettingsViewProps> = ({ competitionInfo, events, onDataUpdate }) => {
    // --- Helper Functions ---
    const romanize = (num: number): string => {
        if (isNaN(num) || num <= 0) return '';
        const lookup: {[key: string]: number} = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
        let roman = '';
        for (let i in lookup ) {
            while ( num >= lookup[i] ) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    }
    
    const getErrorMessage = (error: unknown): string => {
        if (error instanceof Error) return error.message;
        if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
            return (error as any).message;
        }
        return 'Terjadi kesalahan yang tidak diketahui.';
    };

    const [activeTab, setActiveTab] = useState<'settings' | 'schedule' | 'records' | 'data'>('settings');
    const [info, setInfo] = useState<CompetitionInfo | null>(null);
    const [eventNameLines, setEventNameLines] = useState<string[]>(['', '', '']);
    const [schedule, setSchedule] = useState<{ [key: string]: SwimEvent[] }>({});
    const [sessionNames, setSessionNames] = useState<{ [key: string]: string }>({});
    const [sessionDetails, setSessionDetails] = useState<{ [key: string]: { date: string; time: string } }>({});
    const [formStatus, setFormStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [unscheduledSearchQuery, setUnscheduledSearchQuery] = useState('');

    // Record states
    const [currentRecords, setCurrentRecords] = useState<SwimRecord[]>([]);
    const [isRecordsLoading, setIsRecordsLoading] = useState(false);
    const [recordFile, setRecordFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ success: number, errors: string[] } | null>(null);
    
    // Manual record form states
    const [editingRecord, setEditingRecord] = useState<SwimRecord | null>(null);
    const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
    const [isDeleteAllRecordsModalOpen, setIsDeleteAllRecordsModalOpen] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState<SwimRecord | null>(null);
    const [recordForm, setRecordForm] = useState(initialRecordFormState);

    // Record filter states
    const [recordFilters, setRecordFilters] = useState({
        holderName: '',
        type: 'all',
        gender: 'all',
        style: 'all',
    });

    // Data Management states
    const [isBackupLoading, setIsBackupLoading] = useState(false);
    const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
    const [clearDataCredentials, setClearDataCredentials] = useState({ email: '', password: '' });
    const [clearDataError, setClearDataError] = useState('');
    const [isClearingData, setIsClearingData] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    useEffect(() => {
        setInfo(competitionInfo);
        if (competitionInfo?.eventName) {
            const lines = competitionInfo.eventName.split('\n');
            setEventNameLines([
                lines[0] || '',
                lines[1] || '',
                lines[2] || '',
            ]);
        } else {
            setEventNameLines(['', '', '']);
        }
    }, [competitionInfo]);

    useEffect(() => {
        const newSchedule: { [key: string]: SwimEvent[] } = { 'unscheduled': [] };
        const newSessionNames: { [key: string]: string } = {};
        const newSessionDetails: { [key: string]: { date: string; time: string } } = {};
        
        events.forEach(event => {
            const sessionKey = `session-${event.sessionNumber}`;
            if (event.sessionNumber && event.sessionNumber > 0) {
                if (!newSchedule[sessionKey]) {
                    newSchedule[sessionKey] = [];
                }
                newSchedule[sessionKey].push(event);

                if (!newSessionNames[sessionKey]) {
                    newSessionNames[sessionKey] = `Sesi ${romanize(event.sessionNumber)}`;
                }

                if (!newSessionDetails[sessionKey] && event.sessionDateTime) {
                    try {
                        const dt = new Date(event.sessionDateTime);
                        if (!isNaN(dt.getTime())) {
                            newSessionDetails[sessionKey] = {
                                date: dt.toISOString().split('T')[0], // YYYY-MM-DD
                                time: dt.toTimeString().split(' ')[0].substring(0, 5) // HH:MM
                            };
                        }
                    } catch (e) { /* ignore invalid date */ }
                }
            } else {
                newSchedule['unscheduled'].push(event);
            }
        });

        // After populating the schedule, we sort each session's event list
        // based on its `heatOrder`. This ensures that the display order is always
        // correct and consistent with the saved data, fixing the issue where
        // the order might appear incorrect after a refresh.
        for (const sessionKey in newSchedule) {
            if (sessionKey.startsWith('session-')) {
                newSchedule[sessionKey].sort((a, b) => (a.heatOrder ?? 999) - (b.heatOrder ?? 999));
            }
        }
        
        setSchedule(newSchedule);
        setSessionNames(newSessionNames);
        setSessionDetails(newSessionDetails);
    }, [events]);
    
    const fetchRecords = async () => {
        setIsRecordsLoading(true);
        getRecords().then(data => {
            setCurrentRecords(data);
            setIsRecordsLoading(false);
        });
    }

     useEffect(() => {
        if (activeTab === 'records') {
            fetchRecords();
        }
    }, [activeTab]);


    // --- Handlers ---
    const handleEventNameChange = (index: number, value: string) => {
        const newLines = [...eventNameLines];
        newLines[index] = toTitleCase(value);
        setEventNameLines(newLines);
    };

    const handleSaveInfo = async () => {
        if (!info) return;
        setFormStatus({ message: 'Menyimpan perubahan...', type: 'success' });
        try {
            const combinedEventName = eventNameLines.map(line => line.trim()).filter(Boolean).join('\n');
            const infoToSave = { ...info, eventName: combinedEventName };

            await updateCompetitionInfo(infoToSave);
            onDataUpdate();
            setFormStatus({ message: 'Pengaturan umum berhasil disimpan!', type: 'success' });
            setTimeout(() => setFormStatus(null), 4000);
        } catch (error) {
             setFormStatus({ message: `Gagal menyimpan: ${getErrorMessage(error)}`, type: 'error' });
        }
    };
    
    const handleSaveSchedule = async () => {
        setFormStatus({ message: 'Menyimpan jadwal...', type: 'success' });
        try {
            const finalEvents: SwimEvent[] = [];
            Object.keys(schedule).forEach(key => {
                const sessionNum = key === 'unscheduled' ? 0 : parseInt(key.split('-')[1]);
                const sessionDetail = sessionDetails[key];
                let sessionDT: string | undefined = undefined;

                if (sessionNum > 0 && sessionDetail && sessionDetail.date && sessionDetail.time) {
                    const dt = new Date(`${sessionDetail.date}T${sessionDetail.time}:00`);
                    if (isNaN(dt.getTime())) {
                        throw new Error(`Format tanggal/waktu tidak valid untuk sesi '${sessionNames[key] || sessionNum}'`);
                    }
                    sessionDT = dt.toISOString();
                }

                schedule[key].forEach((event, index) => {
                    finalEvents.push({
                        ...event,
                        sessionNumber: sessionNum,
                        heatOrder: index,
                        sessionDateTime: sessionNum > 0 ? sessionDT : undefined,
                    });
                });
            });
            
            await updateEventSchedule(finalEvents);
            onDataUpdate();
            setFormStatus({ message: 'Jadwal berhasil disimpan!', type: 'success' });
            setTimeout(() => setFormStatus(null), 4000);
        } catch (error) {
            console.error("Gagal menyimpan jadwal:", error);
            setFormStatus({ message: `Gagal menyimpan jadwal: ${getErrorMessage(error)}`, type: 'error' });
        }
    };

    const handleImageSelect = (field: 'eventLogo' | 'sponsorLogo', file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => setInfo(prev => prev ? { ...prev, [field]: reader.result as string } : null);
        reader.readAsDataURL(file);
    };
    
    const handleImageClear = (field: 'eventLogo' | 'sponsorLogo') => setInfo(prev => prev ? { ...prev, [field]: null } : null);
    
    const addSession = () => {
        const nextSessionNum = (Object.keys(schedule).filter(k => k.startsWith('session')).length) + 1;
        const sessionKey = `session-${nextSessionNum}`;
        setSchedule(prev => ({ ...prev, [sessionKey]: [] }));
        setSessionNames(prev => ({...prev, [sessionKey]: `Sesi ${romanize(nextSessionNum)}`}));
        setSessionDetails(prev => ({ ...prev, [sessionKey]: { date: '', time: '' } }));
    };
    
    const removeSession = (sessionKey: string) => {
        const eventsToMove = schedule[sessionKey] || [];
        const newSchedule = { ...schedule };
        delete newSchedule[sessionKey];
        newSchedule['unscheduled'] = [...(newSchedule['unscheduled'] || []), ...eventsToMove];
        setSchedule(newSchedule);

        const newDetails = { ...sessionDetails };
        delete newDetails[sessionKey];
        setSessionDetails(newDetails);
    };
    
    const handleSessionDetailChange = (sessionKey: string, field: 'date' | 'time', value: string) => {
        setSessionDetails(prev => ({
            ...prev,
            [sessionKey]: {
                ...(prev[sessionKey] || { date: '', time: '' }),
                [field]: value
            }
        }));
    };

    // --- Record Management Handlers ---
    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setRecordFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleResetFilters = () => {
        setRecordFilters({ holderName: '', type: 'all', gender: 'all', style: 'all' });
    };
    
    const filteredRecords = useMemo(() => {
        return currentRecords
            .filter(record => {
                const { holderName, type, gender, style } = recordFilters;
                if (holderName && !record.holderName.toLowerCase().includes(holderName.toLowerCase().trim())) {
                    return false;
                }
                if (type !== 'all' && record.type.toUpperCase() !== type.toUpperCase()) {
                    return false;
                }
                if (gender !== 'all' && record.gender !== gender) {
                    return false;
                }
                if (style !== 'all' && record.style !== style) {
                    return false;
                }
                return true;
            })
            .sort((a,b) => a.type.localeCompare(b.type) || a.distance - b.distance);
    }, [currentRecords, recordFilters]);

    const handleRecordFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setRecordFile(e.target.files[0]);
            setUploadResult(null);
        }
    };
    
    const handleRecordUpload = () => {
        if (!recordFile) return;

        setIsProcessing(true);
        setUploadResult(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                const result = await processRecordUpload(json);
                setUploadResult(result);

                if (result.errors.length === 0 && result.success > 0) {
                    onDataUpdate(); 
                    fetchRecords();
                    setRecordFile(null);
                    setFormStatus({ message: 'Data rekor berhasil diperbarui via unggahan!', type: 'success' });
                    setTimeout(() => setFormStatus(null), 4000);
                }
            } catch (error) {
                setUploadResult({ success: 0, errors: ['Gagal membaca atau memproses file.', getErrorMessage(error)] });
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsArrayBuffer(recordFile);
    };

    const downloadRecordTemplate = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
            return;
        }
    
        const wb = XLSX.utils.book_new();
    
        // --- Sheet 2: Petunjuk & Daftar Pilihan ---
        const listsSheetData: any[][] = [
            ["PETUNJUK PENGISIAN"],
            ["1. Isi data rekor pada sheet 'Template Rekor'."],
            ["2. Kolom 'Tipe Rekor', 'Jarak (m)', 'Gaya', 'Jenis Kelamin', 'Waktu (mm:ss.SS)', 'Nama Pemegang Rekor', dan 'Tahun' wajib diisi."],
            ["3. Untuk Tipe Rekor, Gaya, dan Jenis Kelamin, mohon gunakan pilihan yang tersedia di dropdown."],
            ["4. Kolom 'Kategori' bersifat opsional. Kosongkan jika tidak ada (cth: untuk event senior/open)."],
            ["5. Kolom 'Jumlah Perenang (Estafet)' HANYA diisi untuk nomor estafet (relay), contoh: 4."],
            [], // Spacer
            ["DAFTAR PILIHAN VALID"],
            [],
            ["Gaya", "Jenis Kelamin"],
        ];
    
        const styles = Object.values(SWIM_STYLE_TRANSLATIONS);
        const genders = Object.values(GENDER_TRANSLATIONS);
        const maxLength = Math.max(styles.length, genders.length);
    
        for (let i = 0; i < maxLength; i++) {
            listsSheetData.push([
                styles[i] || "",
                genders[i] || ""
            ]);
        }
        const ws_lists = XLSX.utils.aoa_to_sheet(listsSheetData);
        ws_lists['!cols'] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws_lists, "Petunjuk & Pilihan");
    
    
        // --- Sheet 1: Template Rekor ---
        const templateData = [
            {
                "Tipe Rekor": "PORPROV",
                "Jarak (m)": 50,
                "Gaya": "Gaya Kupu-kupu",
                "Jenis Kelamin": "Putri",
                "Kategori": "KU 1-2",
                "Waktu (mm:ss.SS)": "00:28.50",
                "Nama Pemegang Rekor": "Contoh Atlet Putri",
                "Tahun": 2024,
                "Jumlah Perenang (Estafet)": "",
                "Lokasi": "Bandung"
            },
            {
                "Tipe Rekor": "Nasional",
                "Jarak (m)": 200,
                "Gaya": "Gaya Bebas",
                "Jenis Kelamin": "Putra",
                "Kategori": "", // Example for Open/Senior
                "Waktu (mm:ss.SS)": "01:50.12",
                "Nama Pemegang Rekor": "Contoh Atlet Putra",
                "Tahun": 2023,
                "Jumlah Perenang (Estafet)": "",
                "Lokasi": "Jakarta"
            },
            {
                "Tipe Rekor": "PORPROV",
                "Jarak (m)": 100,
                "Gaya": "Gaya Ganti",
                "Jenis Kelamin": "Campuran",
                "Kategori": "KU-3",
                "Waktu (mm:ss.SS)": "04:01.88",
                "Nama Pemegang Rekor": "Tim Contoh Campuran",
                "Tahun": 2022,
                "Jumlah Perenang (Estafet)": 4,
                "Lokasi": "Surabaya"
            },
            {
                "Tipe Rekor": "PORPROV",
                "Jarak (m)": 25,
                "Gaya": "Papan Luncur",
                "Jenis Kelamin": "Putri",
                "Kategori": "KU-4",
                "Waktu (mm:ss.SS)": "00:20.15",
                "Nama Pemegang Rekor": "Atlet Papan Luncur",
                "Tahun": 2024,
                "Jumlah Perenang (Estafet)": "",
                "Lokasi": "Makassar"
            }
        ];
    
        const ws = XLSX.utils.json_to_sheet(templateData);
        ws['!cols'] = [
            { wch: 15 }, // Tipe Rekor
            { wch: 10 }, // Jarak
            { wch: 20 }, // Gaya
            { wch: 15 }, // Jenis Kelamin
            { wch: 15 }, // Kategori
            { wch: 20 }, // Waktu
            { wch: 30 }, // Nama
            { wch: 10 }, // Tahun
            { wch: 25 }, // Jumlah Perenang
            { wch: 20 }  // Lokasi
        ];
    
        // Add Data Validation to Sheet 1
        const maxRows = 1000;
        if (!ws['!dataValidation']) ws['!dataValidation'] = [];
        ws['!dataValidation'].push({ sqref: `A2:A${maxRows}`, opts: { type: 'list', formula1: `"PORPROV,Nasional"` } });
        ws['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$A$11:$A$${10 + styles.length}` } });
        ws['!dataValidation'].push({ sqref: `D2:D${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$B$11:$B$${10 + genders.length}` } });
    
        XLSX.utils.book_append_sheet(wb, ws, "Template Rekor");
        
        // Reorder sheets to have Template first
        wb.SheetNames.reverse();
    
        XLSX.writeFile(wb, "Template_Unggah_Rekor.xlsx");
    };

    const handleDownloadAllRecords = () => {
        if (typeof XLSX === 'undefined') {
            alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
            return;
        }
        if (currentRecords.length === 0) {
            alert('Tidak ada rekor untuk diunduh.');
            return;
        }
    
        const dataToExport = currentRecords
            .sort((a, b) => { // Sort for better readability in the Excel file
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
                if (a.distance !== b.distance) return a.distance - b.distance;
                return a.style.localeCompare(b.style);
            })
            .map(record => ({
                "Tipe Rekor": record.type,
                "Jarak (m)": record.distance,
                "Gaya": translateSwimStyle(record.style),
                "Jenis Kelamin": translateGender(record.gender),
                "Kategori": record.category ?? "",
                "Waktu (mm:ss.SS)": formatTime(record.time),
                "Nama Pemegang Rekor": record.holderName,
                "Tahun": record.yearSet,
                "Jumlah Perenang (Estafet)": record.relayLegs ?? "",
                "Lokasi": record.locationSet ?? ""
            }));
    
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!cols'] = [
            { wch: 15 }, // Tipe Rekor
            { wch: 10 }, // Jarak (m)
            { wch: 20 }, // Gaya
            { wch: 15 }, // Jenis Kelamin
            { wch: 15 }, // Kategori
            { wch: 20 }, // Waktu
            { wch: 30 }, // Nama Pemegang Rekor
            { wch: 10 }, // Tahun
            { wch: 25 }, // Jumlah Perenang
            { wch: 20 }  // Lokasi
        ];
    
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Rekor");
        XLSX.writeFile(workbook, "Daftar_Rekor_Kompetisi_Saat_Ini.xlsx");
    };

    const handleRecordFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        // @ts-ignore
        let val: string | number | boolean = isCheckbox ? e.target.checked : value;
        if (!isCheckbox && (name === 'holderName' || name === 'locationSet' || name === 'category')) {
            val = toTitleCase(value);
        }
        setRecordForm(prev => ({...prev, [name]: val}));
    };
    
    const handleEditRecord = (record: SwimRecord) => {
        setEditingRecord(record);
        const totalMs = record.time;
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = totalMs % 1000;

        setRecordForm({
            type: record.type,
            distance: record.distance,
            style: record.style,
            gender: record.gender,
            min: String(minutes),
            sec: String(seconds),
            ms: String(milliseconds).padStart(3, '0').slice(0, 2),
            holderName: record.holderName,
            yearSet: record.yearSet,
            isRelay: !!record.relayLegs,
            relayLegs: record.relayLegs || 4,
            locationSet: record.locationSet || '',
            category: record.category || '',
        });
    };

    const handleCancelEdit = () => {
        setEditingRecord(null);
        setRecordForm(initialRecordFormState);
    };
    
    const handleDeleteRecord = (record: SwimRecord) => {
        setRecordToDelete(record);
        setIsDeleteRecordModalOpen(true);
    };

    const confirmDeleteRecord = async () => {
        if (!recordToDelete) return;
        try {
            await deleteRecord(recordToDelete.id);
            setIsDeleteRecordModalOpen(false);
            setRecordToDelete(null);
            fetchRecords();
            onDataUpdate();
            setFormStatus({ message: 'Rekor berhasil dihapus.', type: 'success' });
            setTimeout(() => setFormStatus(null), 4000);
        } catch (error) {
             setFormStatus({ message: `Gagal menghapus rekor: ${getErrorMessage(error)}`, type: 'error' });
        }
    };

    const handleConfirmDeleteAllRecords = async () => {
        try {
            await deleteAllRecords();
            setIsDeleteAllRecordsModalOpen(false);
            fetchRecords(); // Refresh the list
            onDataUpdate(); // Refresh global data
            setFormStatus({ message: 'Semua rekor berhasil dihapus.', type: 'success' });
            setTimeout(() => setFormStatus(null), 4000);
        } catch (error) {
            setFormStatus({ message: `Gagal menghapus semua rekor: ${getErrorMessage(error)}`, type: 'error' });
        }
    };

    const handleRecordFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const time = ((parseInt(recordForm.min, 10) || 0) * 60000) + 
                         ((parseInt(recordForm.sec, 10) || 0) * 1000) + 
                         ((parseInt(recordForm.ms, 10) || 0) * 10);
            
            const recordId = editingRecord?.id || 
                `${recordForm.type.toUpperCase()}_${recordForm.gender}_${recordForm.distance}_${recordForm.style}` + (recordForm.category ? `_${recordForm.category}` : '') + (recordForm.isRelay ? `_R${recordForm.relayLegs}` : '');
    
            const recordData: Partial<SwimRecord> = {
                id: recordId,
                type: recordForm.type as RecordType,
                gender: recordForm.gender,
                distance: Number(recordForm.distance),
                style: recordForm.style,
                time: time,
                holderName: recordForm.holderName,
                yearSet: Number(recordForm.yearSet),
                relayLegs: recordForm.isRelay ? Number(recordForm.relayLegs) : null,
                locationSet: recordForm.locationSet,
                category: recordForm.category || null,
            };
            await addOrUpdateRecord(recordData);
            handleCancelEdit();
            fetchRecords();
            onDataUpdate();
            setFormStatus({ message: `Rekor berhasil ${editingRecord ? 'diperbarui' : 'ditambahkan'}.`, type: 'success' });
            setTimeout(() => setFormStatus(null), 4000);
        } catch (error) {
            setFormStatus({ message: `Gagal menyimpan rekor: ${getErrorMessage(error)}`, type: 'error' });
        }
    };


    // --- Scheduling Handlers ---
    const handleMoveEvent = (eventId: string, sourceSessionKey: string, targetSessionKey: string) => {
        if (sourceSessionKey === targetSessionKey) return;

        setSchedule(currentSchedule => {
            const sourceEvents = [...(currentSchedule[sourceSessionKey] || [])];
            const targetEvents = [...(currentSchedule[targetSessionKey] || [])];
            const eventIndex = sourceEvents.findIndex(e => e.id === eventId);
            
            if (eventIndex === -1) return currentSchedule;

            const [eventToMove] = sourceEvents.splice(eventIndex, 1);
            targetEvents.push(eventToMove);

            return {
                ...currentSchedule,
                [sourceSessionKey]: sourceEvents,
                [targetSessionKey]: targetEvents,
            };
        });
    };

    const handleReorderEvent = (eventId: string, sessionKey: string, direction: 'up' | 'down') => {
        setSchedule(currentSchedule => {
            const sessionEvents = [...currentSchedule[sessionKey]];
            const currentIndex = sessionEvents.findIndex(e => e.id === eventId);
            if (currentIndex === -1) return currentSchedule;

            const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex < 0 || newIndex >= sessionEvents.length) return currentSchedule;

            // Swap elements
            [sessionEvents[currentIndex], sessionEvents[newIndex]] = [sessionEvents[newIndex], sessionEvents[currentIndex]];

            return { ...currentSchedule, [sessionKey]: sessionEvents };
        });
    };

    const sessionOptions = useMemo(() => [
        { value: 'unscheduled', label: 'Belum Terjadwal' },
        ...Object.keys(schedule)
            .filter(k => k.startsWith('session'))
            .sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]))
            .map(key => ({ value: key, label: sessionNames[key] || `Sesi ${romanize(parseInt(key.split('-')[1]))}` }))
    ], [schedule, sessionNames]);
    
    const filteredUnscheduledEvents = useMemo(() => {
        if (!unscheduledSearchQuery) {
            return schedule.unscheduled || [];
        }
        return (schedule.unscheduled || []).filter(event =>
            formatEventName(event).toLowerCase().includes(unscheduledSearchQuery.toLowerCase())
        );
    }, [schedule.unscheduled, unscheduledSearchQuery]);


    // --- Data Management Handlers ---
    const handleBackup = async () => {
        setIsBackupLoading(true);
        setFormStatus({ message: 'Membuat file backup...', type: 'success' });
        try {
            const data = await backupDatabase();
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
            const link = document.createElement('a');
            link.href = jsonString;
            link.download = `swimcomp-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            setFormStatus({ message: 'Backup berhasil diunduh.', type: 'success' });
        } catch (error) {
            setFormStatus({ message: `Gagal membuat backup: ${getErrorMessage(error)}`, type: 'error' });
        } finally {
            setIsBackupLoading(false);
            setTimeout(() => setFormStatus(null), 4000);
        }
    };

    const handleConfirmClearData = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsClearingData(true);
        setClearDataError('');
        try {
            const user = await login(clearDataCredentials.email, clearDataCredentials.password);
            if (user) {
                await clearAllData();
                setIsClearingData(false);
                setIsClearDataModalOpen(false);
                setClearDataCredentials({ email: '', password: '' });
                onDataUpdate();
                setFormStatus({ message: 'Semua data kompetisi telah berhasil dihapus.', type: 'success' });
                setTimeout(() => setFormStatus(null), 5000);
            } else {
                setClearDataError('Kredensial tidak valid.');
                setIsClearingData(false);
            }
        } catch (error) {
            setClearDataError(getErrorMessage(error));
            setIsClearingData(false);
        }
    };
    
    const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            if (e.target.files[0].type === 'application/json') {
                setRestoreFile(e.target.files[0]);
                setFormStatus(null);
            } else {
                setFormStatus({ message: 'Harap pilih file backup .json yang valid.', type: 'error' });
                setRestoreFile(null);
                (e.target as HTMLInputElement).value = '';
            }
        }
    };
    
    const handleRestore = async () => {
        if (!restoreFile) return;

        setIsRestoring(true);
        setFormStatus({ message: 'Memulihkan data dari backup...', type: 'success' });

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content);
                await restoreDatabase(data); 

                setFormStatus({ message: 'Data berhasil dipulihkan dari backup!', type: 'success' });
                onDataUpdate();
            } catch (error) {
                setFormStatus({ message: `Gagal memulihkan: ${getErrorMessage(error)}`, type: 'error' });
            } finally {
                setIsRestoring(false);
                setIsRestoreModalOpen(false);
                setRestoreFile(null);
                const fileInput = document.getElementById('restore-upload') as HTMLInputElement;
                if(fileInput) fileInput.value = '';
            }
        };
        reader.readAsText(restoreFile);
    };

    // --- Render Logic ---
    if (!info) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    
    const displayStatus = formStatus;

    const renderTabs = () => (
        <div className="flex border-b border-border mb-6 no-print">
            <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Pengaturan Umum</button>
            <button onClick={() => setActiveTab('schedule')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'schedule' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Pengaturan Jadwal</button>
            <button onClick={() => setActiveTab('records')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'records' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Manajemen Rekor</button>
            <button onClick={() => setActiveTab('data')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Manajemen Data</button>
        </div>
    );

    return (
        <div>
            <h1 className="text-3xl font-bold mb-2">Pengaturan Acara & Jadwal</h1>
            {displayStatus && <p className={`${displayStatus.type === 'success' ? 'text-green-500' : 'text-red-500'} text-sm mb-4 font-semibold`}>{displayStatus.message}</p>}
            {renderTabs()}

            {activeTab === 'settings' && (
                <Card>
                    <div className="space-y-6">
                        <div className="p-4 border border-border rounded-lg bg-background/50 space-y-4">
                             <ToggleSwitch
                                label="Status Pendaftaran Online"
                                enabled={info.isRegistrationOpen ?? false}
                                onChange={(enabled) => setInfo({ ...info, isRegistrationOpen: enabled })}
                                enabledText="DIBUKA"
                                disabledText="DITUTUP"
                            />
                             <ToggleSwitch
                                label="Tampilkan Hasil Langsung Publik"
                                enabled={info.isPublicResultsVisible ?? false}
                                onChange={(enabled) => setInfo({ ...info, isPublicResultsVisible: enabled })}
                                enabledText="DITAMPILKAN"
                                disabledText="DISEMBUNYIKAN"
                            />
                            <div>
                                <Input
                                    label="Batas Waktu Pendaftaran Online"
                                    id="registration-deadline"
                                    type="datetime-local"
                                    value={info.registrationDeadline ? info.registrationDeadline.slice(0, 16) : ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        const isoValue = value ? new Date(value).toISOString() : null;
                                        setInfo({ ...info, registrationDeadline: isoValue });
                                    }}
                                />
                                <p className="text-xs text-text-secondary mt-1">Kosongkan jika tidak ada batas waktu.</p>
                            </div>
                        </div>
                        <div>
                            <Input label="Nama Event (Baris 1)" id="event-name-1" type="text" value={eventNameLines[0]} onChange={(e) => handleEventNameChange(0, e.target.value)} />
                            <Input label="Nama Event (Baris 2)" id="event-name-2" type="text" value={eventNameLines[1]} onChange={(e) => handleEventNameChange(1, e.target.value)} className="mt-4"/>
                            <Input label="Nama Event (Baris 3)" id="event-name-3" type="text" value={eventNameLines[2]} onChange={(e) => handleEventNameChange(2, e.target.value)} className="mt-4"/>
                        </div>
                        <Input label="Hari dan Tanggal Event" id="event-date" type="date" value={info.eventDate} onChange={(e) => setInfo({ ...info, eventDate: e.target.value })}/>
                        <Select
                            label="Jumlah Lintasan per Seri"
                            id="number-of-lanes"
                            value={info.numberOfLanes || 8}
                            onChange={(e) => setInfo({ ...info, numberOfLanes: parseInt(e.target.value, 10) })}
                        >
                            <option value="6">6 Lintasan</option>
                            <option value="8">8 Lintasan</option>
                            <option value="10">10 Lintasan</option>
                        </Select>
                        <ImageUpload label="Logo Event" image={info.eventLogo} onImageSelect={(file) => handleImageSelect('eventLogo', file)} onImageClear={() => handleImageClear('eventLogo')}/>
                        <ImageUpload label="Logo Sponsor" image={info.sponsorLogo} onImageSelect={(file) => handleImageSelect('sponsorLogo', file)} onImageClear={() => handleImageClear('sponsorLogo')}/>
                        <div className="flex justify-end pt-4 border-t border-border"><Button onClick={handleSaveInfo}>Simpan Pengaturan</Button></div>
                    </div>
                </Card>
            )}

            {activeTab === 'schedule' && (
                 <Card>
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                        <p className="text-text-secondary">Atur nomor lomba ke dalam sesi dan tentukan urutannya.</p>
                        <div className="flex items-center space-x-4">
                            <Button variant="secondary" onClick={addSession}>Tambah Sesi</Button>
                            <Button onClick={handleSaveSchedule}>Simpan Jadwal</Button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Scheduled Events column */}
                        <div className="space-y-6">
                            {Object.keys(schedule).filter(k => k.startsWith('session')).sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])).map(key => (
                                <div key={key} className="bg-background p-4 rounded-lg border border-border">
                                    {/* Session header */}
                                    <div className="flex justify-between items-center mb-2 border-b border-border pb-2 flex-wrap gap-2">
                                        <input type="text" value={sessionNames[key] || ''} onChange={(e) => setSessionNames(prev => ({...prev, [key]: toTitleCase(e.target.value)}))} className="font-bold text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 flex-grow" />
                                        <button onClick={() => removeSession(key)} className="text-red-500 hover:text-red-400 text-xs ml-2 flex-shrink-0">Hapus Sesi</button>
                                    </div>
                                    <div className="flex space-x-2 mb-4">
                                        <SmallInput label="Tanggal" type="date" id={`date-${key}`} value={sessionDetails[key]?.date || ''} onChange={(e) => handleSessionDetailChange(key, 'date', e.target.value)} />
                                        <SmallInput label="Waktu Mulai" type="time" id={`time-${key}`} value={sessionDetails[key]?.time || ''} onChange={(e) => handleSessionDetailChange(key, 'time', e.target.value)} />
                                    </div>
                                    
                                    {/* Events list in this session */}
                                    <div className="space-y-2">
                                        {schedule[key]?.length > 0 ? schedule[key].map((event, index) => (
                                            <div key={event.id} className="flex items-center justify-between bg-surface p-2 rounded-md shadow-sm">
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex flex-col">
                                                        <button onClick={() => handleReorderEvent(event.id, key, 'up')} disabled={index === 0} className="disabled:opacity-20 text-text-secondary hover:text-text-primary"><ArrowUpIcon /></button>
                                                        <button onClick={() => handleReorderEvent(event.id, key, 'down')} disabled={index === schedule[key].length - 1} className="disabled:opacity-20 text-text-secondary hover:text-text-primary"><ArrowDownIcon /></button>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-text-primary text-sm">{formatEventName(event)}</p>
                                                        <p className="text-xs text-text-secondary">{event.entries.length} peserta</p>
                                                    </div>
                                                </div>
                                                <div className="w-40">
                                                    <select
                                                        value={key}
                                                        onChange={(e) => handleMoveEvent(event.id, key, e.target.value)}
                                                        className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                                    >
                                                        {sessionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        )) : <p className="text-sm text-text-secondary text-center py-4">Belum ada nomor lomba di sesi ini.</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Unscheduled Events column */}
                        <div className="bg-surface p-4 rounded-lg">
                            <h3 className="font-bold text-lg mb-4 border-b border-border pb-2">Lomba Belum Terjadwal</h3>
                            <div className="mb-4">
                                <Input label="Cari nomor lomba" id="unscheduled-search" type="text" placeholder="Ketik untuk mencari..." value={unscheduledSearchQuery} onChange={(e) => setUnscheduledSearchQuery(e.target.value)} />
                            </div>
                            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                                {filteredUnscheduledEvents.length > 0 ? filteredUnscheduledEvents.map(event => (
                                    <div key={event.id} className="flex items-center justify-between bg-background p-2 rounded-md">
                                        <div>
                                            <p className="font-semibold text-text-primary text-sm">{formatEventName(event)}</p>
                                            <p className="text-xs text-text-secondary">{event.entries.length} peserta</p>
                                        </div>
                                        <div className="w-40">
                                            <select
                                                value="unscheduled"
                                                onChange={(e) => handleMoveEvent(event.id, 'unscheduled', e.target.value)}
                                                className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                            >
                                                {sessionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )) : <p className="text-sm text-text-secondary text-center py-4">Semua nomor lomba sudah terjadwal.</p>}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'records' && (
                <Card>
                    <h2 className="text-xl font-bold mb-2">Manajemen Rekor Kompetisi</h2>
                    <p className="text-text-secondary mb-4">
                        Kelola rekor secara manual atau unggah file Excel untuk memperbarui daftar rekor secara massal.
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Manual Management */}
                        <div>
                            <form onSubmit={handleRecordFormSubmit} className="bg-background/50 p-4 rounded-lg border border-border space-y-3 mb-4">
                                <h3 className="text-lg font-semibold mb-2">{editingRecord ? 'Edit Rekor' : 'Tambah Rekor Manual'}</h3>
                                <Select label="Tipe Rekor" id="record-type" name="type" value={recordForm.type} onChange={handleRecordFormChange}>
                                    <option value={RecordType.PORPROV}>PORPROV</option>
                                    <option value={RecordType.NASIONAL}>Nasional</option>
                                </Select>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="isRelay" name="isRelay" checked={recordForm.isRelay} onChange={handleRecordFormChange} className="h-4 w-4 rounded" />
                                    <label htmlFor="isRelay" className="text-sm font-medium text-text-primary">Estafet</label>
                                </div>
                                {recordForm.isRelay && <Input label="Jumlah Perenang" id="relayLegs" name="relayLegs" type="number" value={recordForm.relayLegs} onChange={handleRecordFormChange} required />}
                                <div className="flex gap-4">
                                    <Input label="Jarak (m)" id="distance" name="distance" type="number" value={recordForm.distance} onChange={handleRecordFormChange} required />
                                    <Select label="Gaya" id="style" name="style" value={recordForm.style} onChange={handleRecordFormChange}>
                                        {SWIM_STYLE_OPTIONS.map(s => <option key={s} value={s}>{translateSwimStyle(s)}</option>)}
                                    </Select>
                                </div>
                                <Input label="Kategori (Opsional)" id="category" name="category" type="text" value={recordForm.category} onChange={handleRecordFormChange} placeholder="cth: KU 1-2" />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={recordForm.gender} onChange={handleRecordFormChange}>
                                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{translateGender(g)}</option>)}
                                </Select>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1">Waktu</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Input label="Menit" id="min" name="min" type="number" min="0" value={recordForm.min} onChange={handleRecordFormChange} />
                                        <Input label="Detik" id="sec" name="sec" type="number" min="0" max="59" value={recordForm.sec} onChange={handleRecordFormChange} />
                                        <Input label="ss/100" id="ms" name="ms" type="number" min="0" max="99" value={recordForm.ms} onChange={handleRecordFormChange} />
                                    </div>
                                </div>
                                <Input label="Nama Pemegang Rekor" id="holderName" name="holderName" value={recordForm.holderName} onChange={handleRecordFormChange} required />
                                <div className="flex gap-4">
                                    <Input label="Tahun" id="yearSet" name="yearSet" type="number" value={recordForm.yearSet} onChange={handleRecordFormChange} required className="flex-1"/>
                                    <Input label="Lokasi" id="locationSet" name="locationSet" value={recordForm.locationSet} onChange={handleRecordFormChange} className="flex-1"/>
                                </div>
                                <div className="flex justify-end space-x-2 pt-2">
                                    {editingRecord && <Button type="button" variant="secondary" onClick={handleCancelEdit}>Batal</Button>}
                                    <Button type="submit">{editingRecord ? 'Simpan Perubahan' : 'Tambah Rekor'}</Button>
                                </div>
                            </form>
                            
                            <div className="my-4 p-4 border border-border rounded-lg bg-background/50">
                                <h4 className="font-semibold mb-3 text-text-primary">Filter Rekor</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Input
                                        label="Cari Nama Pemegang"
                                        id="filter-holderName"
                                        name="holderName"
                                        value={recordFilters.holderName}
                                        onChange={handleFilterChange}
                                        placeholder="Ketik nama..."
                                    />
                                    <Select
                                        label="Tipe Rekor"
                                        id="filter-type"
                                        name="type"
                                        value={recordFilters.type}
                                        onChange={handleFilterChange}
                                    >
                                        <option value="all">Semua Tipe</option>
                                        <option value="PORPROV">PORPROV</option>
                                        <option value="Nasional">Nasional</option>
                                    </Select>
                                    <Select
                                        label="Jenis Kelamin"
                                        id="filter-gender"
                                        name="gender"
                                        value={recordFilters.gender}
                                        onChange={handleFilterChange}
                                    >
                                        <option value="all">Semua Gender</option>
                                        {GENDER_OPTIONS.map(g => <option key={g} value={g}>{translateGender(g)}</option>)}
                                    </Select>
                                    <Select
                                        label="Gaya"
                                        id="filter-style"
                                        name="style"
                                        value={recordFilters.style}
                                        onChange={handleFilterChange}
                                    >
                                        <option value="all">Semua Gaya</option>
                                        {SWIM_STYLE_OPTIONS.map(s => <option key={s} value={s}>{translateSwimStyle(s)}</option>)}
                                    </Select>
                                </div>
                                <Button type="button" variant="secondary" onClick={handleResetFilters} className="mt-4">
                                    Reset Filter
                                </Button>
                            </div>
                            
                            <div className="max-h-[50vh] overflow-y-auto border border-border rounded-lg">
                                {isRecordsLoading ? <div className="flex justify-center p-8"><Spinner /></div> : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-background sticky top-0 z-10">
                                            <tr>
                                                <th className="p-2">Nomor Lomba</th>
                                                <th className="p-2">Pemegang Rekor</th>
                                                <th className="p-2">Waktu</th>
                                                <th className="p-2 text-center">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRecords.length > 0 ? (
                                                filteredRecords.map(record => (
                                                    <tr key={record.id} className="border-t border-border">
                                                        <td className="p-2">
                                                          <span className={`font-bold ${record.type.toUpperCase() === 'NASIONAL' ? 'text-red-400' : 'text-blue-400'}`}>{record.type}</span>
                                                          <p>{formatEventName(record)}</p>
                                                        </td>
                                                        <td className="p-2">{record.holderName}</td>
                                                        <td className="p-2 font-mono">{formatTime(record.time)}</td>
                                                        <td className="p-2 text-center">
                                                            <div className="flex justify-center items-center space-x-1">
                                                                <button onClick={() => handleEditRecord(record)} className="p-1 text-blue-400 hover:text-blue-300"><EditIcon /></button>
                                                                <button onClick={() => handleDeleteRecord(record)} className="p-1 text-red-500 hover:text-red-400"><TrashIcon /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan={4} className="p-4 text-center text-text-secondary">Tidak ada data rekor yang cocok dengan filter.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* Bulk Upload & Danger Zone */}
                        <div>
                            <div className="bg-background p-4 rounded-md border border-border space-y-4">
                                <h3 className="text-lg font-semibold">Unggah File Rekor (Massal)</h3>
                                <p className="text-text-secondary text-sm">Mengunggah file akan <strong className="font-bold">menimpa semua data rekor</strong> yang ada dengan isi file.</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" onClick={downloadRecordTemplate}>
                                        Unduh Template
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        onClick={handleDownloadAllRecords}
                                        disabled={currentRecords.length === 0}
                                        title={currentRecords.length === 0 ? 'Tidak ada rekor untuk diunduh' : 'Unduh semua rekor saat ini'}
                                    >
                                        Unduh Semua Rekor
                                    </Button>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <input type="file" id="record-upload" accept=".xlsx, .xls" className="hidden" onChange={handleRecordFileChange} />
                                    <Button type="button" onClick={() => document.getElementById('record-upload')?.click()}>Pilih File</Button>
                                    {recordFile && <span className="text-text-secondary text-sm">{recordFile.name}</span>}
                                </div>
                                <div>
                                    <Button onClick={handleRecordUpload} disabled={!recordFile || isProcessing} variant="primary">
                                        {isProcessing ? <Spinner/> : 'Proses & Ganti Semua Rekor'}
                                    </Button>
                                </div>
                                {uploadResult && (
                                    <div className="mt-4 pt-4 border-t border-border text-sm">
                                        <p className={uploadResult.errors.length > 0 ? "text-red-500" : "text-green-500"}>
                                            Berhasil memproses {uploadResult.success} baris.
                                            {uploadResult.errors.length > 0 && ` Ditemukan ${uploadResult.errors.length} error.`}
                                        </p>
                                        {uploadResult.errors.length > 0 && (
                                            <ul className="list-disc list-inside h-24 overflow-y-auto bg-surface p-2 rounded-md mt-1 text-red-400">
                                                {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                             <div className="mt-6 bg-red-900/10 p-4 rounded-lg border border-red-500/30">
                                <h4 className="font-semibold text-red-500">Zona Berbahaya</h4>
                                <p className="text-sm text-text-secondary mt-1 mb-3">Tindakan ini tidak dapat dibatalkan dan akan menghapus semua rekor yang ada.</p>
                                <Button
                                    variant="danger"
                                    onClick={() => setIsDeleteAllRecordsModalOpen(true)}
                                    disabled={currentRecords.length === 0}
                                    title={currentRecords.length === 0 ? 'Tidak ada rekor untuk dihapus' : 'Hapus semua data rekor'}
                                >
                                    Hapus Semua Rekor
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'data' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <h3 className="text-xl font-bold">Backup & Restore</h3>
                        <p className="text-text-secondary mt-2 mb-4">
                            Simpan atau pulihkan semua data kompetisi dari file backup JSON.
                        </p>
                        
                        <div className="space-y-4">
                            {/* Backup */}
                            <div>
                                <h4 className="font-semibold">Backup Data</h4>
                                <p className="text-sm text-text-secondary mb-2">Unduh semua data saat ini dari database ke dalam satu file.</p>
                                <Button onClick={handleBackup} disabled={isBackupLoading}>
                                    {isBackupLoading ? <Spinner /> : 'Backup Semua Data'}
                                </Button>
                            </div>

                            {/* Restore */}
                            <div className="pt-4 border-t border-border">
                                <h4 className="font-semibold">Pulihkan dari Backup</h4>
                                <p className="text-sm text-text-secondary mb-2">
                                    Memulihkan data akan <strong className="font-bold text-yellow-500">MENGGANTI SEMUA DATA DI DATABASE</strong> dengan isi dari file backup.
                                </p>
                                <div className="flex items-center space-x-4">
                                    <input type="file" id="restore-upload" accept=".json" className="hidden" onChange={handleRestoreFileChange} />
                                    <Button type="button" variant="secondary" onClick={() => document.getElementById('restore-upload')?.click()}>Pilih File Backup</Button>
                                    {restoreFile && <span className="text-text-secondary text-sm">{restoreFile.name}</span>}
                                </div>
                                <Button 
                                    onClick={() => setIsRestoreModalOpen(true)} 
                                    disabled={!restoreFile || isRestoring}
                                    className="mt-2"
                                >
                                    {isRestoring ? <Spinner/> : 'Pulihkan Data'}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-red-500/50 bg-red-500/5">
                        <h3 className="text-xl font-bold text-red-500">Zona Berbahaya</h3>
                        <p className="text-text-secondary mt-2 mb-4">
                            Tindakan ini akan menghapus <strong className="font-bold text-red-400">SEMUA</strong> data dari kompetisi ini secara permanen dari database pusat di Supabase.
                        </p>
                        <Button variant="danger" onClick={() => setIsClearDataModalOpen(true)}>
                            Hapus Semua Data
                        </Button>
                    </Card>
                </div>
            )}
            
            <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="Konfirmasi Pemulihan Data">
                <div className="space-y-6">
                    <p className="text-text-secondary">
                        Anda yakin ingin memulihkan data dari file <strong className="text-text-primary">{restoreFile?.name}</strong>?
                        <br /><br />
                        Semua data kompetisi yang ada saat ini akan <strong className="text-red-500 font-bold">dihapus dan diganti</strong>. Tindakan ini tidak dapat dibatalkan.
                    </p>
                    <div className="flex justify-end space-x-4">
                        <Button variant="secondary" onClick={() => setIsRestoreModalOpen(false)}>Batal</Button>
                        <Button variant="danger" onClick={handleRestore} disabled={isRestoring}>
                            {isRestoring ? <Spinner/> : 'Ya, Pulihkan & Ganti'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Konfirmasi Hapus Rekor">
                {recordToDelete && (
                    <div className="space-y-6">
                        <p className="text-text-secondary">
                            Anda yakin ingin menghapus rekor <strong className="text-text-primary">{formatEventName(recordToDelete)}</strong> ({formatTime(recordToDelete.time)})?
                        </p>
                        <div className="flex justify-end space-x-4">
                            <Button variant="secondary" onClick={() => setIsDeleteRecordModalOpen(false)}>Batal</Button>
                            <Button variant="danger" onClick={confirmDeleteRecord}>Ya, Hapus</Button>
                        </div>
                    </div>
                )}
            </Modal>

             <Modal isOpen={isDeleteAllRecordsModalOpen} onClose={() => setIsDeleteAllRecordsModalOpen(false)} title="Konfirmasi Hapus Semua Rekor">
                <div className="space-y-6">
                    <p className="text-text-secondary">
                        Anda benar-benar yakin ingin menghapus <strong className="text-text-primary">SEMUA</strong> data rekor kompetisi?
                        <br/><br/>
                        Tindakan ini akan <strong className="text-red-500">menghapus permanen</strong> semua rekor yang tersimpan dan tidak dapat dibatalkan.
                    </p>
                    <div className="flex justify-end space-x-4">
                        <Button variant="secondary" onClick={() => setIsDeleteAllRecordsModalOpen(false)}>Batal</Button>
                        <Button variant="danger" onClick={handleConfirmDeleteAllRecords}>Ya, Hapus Semua Rekor</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isClearDataModalOpen} onClose={() => setIsClearDataModalOpen(false)} title="Konfirmasi Hapus Semua Data">
                <form onSubmit={handleConfirmClearData}>
                    <div className="space-y-4">
                        <p className="text-lg font-bold text-red-500">PERINGATAN KERAS!</p>
                        <p className="text-text-secondary">
                            Tindakan ini bersifat permanen dan akan menghapus semua data dari <strong className="text-red-500">database pusat (Supabase)</strong>. Ini termasuk:
                        </p>
                        <ul className="list-disc list-inside text-red-400">
                            <li>Pengaturan Acara (akan direset)</li>
                            <li>Semua Nomor Lomba</li>
                            <li>Semua Peserta Terdaftar</li>
                            <li>Semua Pendaftaran di Nomor Lomba</li>
                            <li>Semua Hasil Lomba</li>
                            <li>Semua Rekor Kompetisi</li>
                        </ul>
                        <p className="font-bold">Tindakan ini tidak dapat dibatalkan.</p>
                        <p className="text-text-secondary">Untuk melanjutkan, masukkan kembali kredensial admin Anda.</p>
                        
                        <div className="space-y-4 pt-2">
                            <Input label="Email Admin" id="confirm-email" type="email" value={clearDataCredentials.email} onChange={(e) => { setClearDataCredentials(p => ({...p, email: e.target.value})); setClearDataError(''); }} required />
                            <Input label="Password Admin" id="confirm-password" type="password" value={clearDataCredentials.password} onChange={(e) => { setClearDataCredentials(p => ({...p, password: e.target.value})); setClearDataError(''); }} required />
                            {clearDataError && <p className="text-red-500 text-sm text-center">{clearDataError}</p>}
                        </div>
                        
                        <div className="flex justify-end pt-4 border-t border-border space-x-2">
                            <Button type="button" variant="secondary" onClick={() => setIsClearDataModalOpen(false)}>Batal</Button>
                            <Button type="submit" variant="danger" disabled={isClearingData}>
                                {isClearingData ? <Spinner /> : 'Saya Mengerti, Hapus Semua Data'}
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
};