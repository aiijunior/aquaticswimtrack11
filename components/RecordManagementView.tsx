import React, { useState, useEffect, useMemo } from 'react';
import { getRecords, processRecordUpload, addOrUpdateRecord, deleteRecord, deleteAllRecords } from '../services/databaseService';
import { RecordType, SwimStyle, Gender, SwimRecord } from '../types';
import { SWIM_STYLE_OPTIONS, GENDER_OPTIONS, translateGender, translateSwimStyle, formatTime, toTitleCase } from '../constants';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any;

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

export const RecordManagementView: React.FC = () => {
    const { addNotification } = useNotification();
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

    const fetchRecords = async () => {
        setIsRecordsLoading(true);
        try {
            const data = await getRecords();
            setCurrentRecords(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsRecordsLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, []);

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
                    fetchRecords();
                    setRecordFile(null);
                    addNotification(`${result.success} data rekor berhasil diperbarui!`, 'info');
                } else if (result.errors.length > 0) {
                    addNotification('Impor selesai dengan galat.', 'error');
                }
            } catch (error: any) {
                const errorMessage = error.message || 'Gagal memproses unggahan';
                setUploadResult({ success: 0, errors: [errorMessage] });
                addNotification(`Gagal memproses unggahan: ${errorMessage}`, 'error');
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsArrayBuffer(recordFile);
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
        const milliseconds = Math.floor((totalMs % 1000) / 10);

        setRecordForm({
            type: record.type,
            distance: record.distance,
            style: record.style,
            gender: record.gender,
            min: String(minutes),
            sec: String(seconds),
            ms: String(milliseconds).padStart(2, '0'),
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
            addNotification('Rekor berhasil dihapus.', 'info');
        } catch (error: any) {
             addNotification(`Gagal menghapus rekor: ${error.message}`, 'error');
        }
    };

    const handleConfirmDeleteAllRecords = async () => {
        try {
            await deleteAllRecords();
            setIsDeleteAllRecordsModalOpen(false);
            fetchRecords();
            addNotification('Semua rekor berhasil dihapus.', 'info');
        } catch (error: any) {
            addNotification(`Gagal menghapus semua rekor: ${error.message}`, 'error');
        }
    };

    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();

        const instructions = [
            ["PANDUAN PENGISIAN TEMPLATE REKOR"],
            ["1. Isi data pada sheet 'Template Rekor' mulai dari baris ke-2."],
            ["2. Kolom yang Wajib Diisi: Tipe, Jarak (m), Gaya, Jenis Kelamin, Pemegang Rekor, Tahun, Waktu."],
            ["3. Tipe: 'PORPROV' atau 'NASIONAL'."],
            ["4. Gaya: 'Bebas', 'Dada', 'Kupu-Kupu', 'Punggung', 'Ganti'."],
            ["5. Jenis Kelamin: 'Putra' atau 'Putri'."],
            ["6. Waktu: Format mm:ss.SS (contoh: 01:23.45)."]
        ];
        const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
        wsInstructions['!cols'] = [{ wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsInstructions, "Panduan");

        const templateData = [
            ["Tipe", "Jarak (m)", "Gaya", "Jenis Kelamin", "Kategori", "Pemegang Rekor", "Tahun", "Waktu"],
            ["PORPROV", 50, "Bebas", "Putra", "Senior", "Budi Santoso", 2022, "00:24.50"],
            ["NASIONAL", 100, "Dada", "Putri", "", "Susi Susanti", 2019, "01:10.25"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(templateData);
        ws['!cols'] = [
            { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 15 }
        ];

        if (!ws['!dataValidation']) ws['!dataValidation'] = [];
        const maxRows = 1000;
        ws['!dataValidation'].push({ sqref: `A2:A${maxRows}`, opts: { type: 'list', formula1: '"PORPROV,NASIONAL"' } });
        ws['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: '"Bebas,Dada,Kupu-Kupu,Punggung,Ganti"' } });
        ws['!dataValidation'].push({ sqref: `D2:D${maxRows}`, opts: { type: 'list', formula1: '"Putra,Putri"' } });

        XLSX.utils.book_append_sheet(wb, ws, "Template Rekor");
        XLSX.writeFile(wb, "Template_Manajemen_Rekor.xlsx");
    };

    const handleRecordFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const time = ((parseInt(recordForm.min, 10) || 0) * 60000) + 
                         ((parseInt(recordForm.sec, 10) || 0) * 1000) + 
                         ((parseInt(recordForm.ms, 10) || 0) * 10);
            
            const recordId = editingRecord?.id || 
                `${recordForm.type.toUpperCase()}_${recordForm.gender}_${recordForm.distance}_${recordForm.style}` + (recordForm.category ? `_${recordForm.category}` : '') + (recordForm.isRelay ? `_R${recordForm.relayLegs}` : '') + `_${new Date().getTime()}`;
    
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
            addNotification(`Rekor berhasil ${editingRecord ? 'diperbarui' : 'ditambahkan'}.`, editingRecord ? 'info' : 'success');
        } catch (error: any) {
            addNotification(`Gagal menyimpan rekor: ${error.message}`, 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Manajemen Rekor</h1>
                <div className="flex gap-2">
                    <Button variant="danger" onClick={() => setIsDeleteAllRecordsModalOpen(true)}>Hapus Semua Rekor</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-4 space-y-6">
                    <Card>
                        <h2 className="text-xl font-bold mb-4">{editingRecord ? 'Edit Rekor' : 'Tambah Rekor Baru'}</h2>
                        <form onSubmit={handleRecordFormSubmit} className="space-y-4">
                            <Select label="Tipe Rekor" id="record-type" name="type" value={recordForm.type} onChange={handleRecordFormChange}>
                                <option value={RecordType.PORPROV}>PORPROV</option>
                                <option value={RecordType.NASIONAL}>Nasional</option>
                            </Select>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Jarak (m)" id="distance" name="distance" type="number" value={recordForm.distance} onChange={handleRecordFormChange} required />
                                <Select label="Gaya" id="style" name="style" value={recordForm.style} onChange={handleRecordFormChange}>
                                    {SWIM_STYLE_OPTIONS.map(s => <option key={s} value={s}>{translateSwimStyle(s)}</option>)}
                                </Select>
                            </div>

                            <Select label="Jenis Kelamin" id="gender" name="gender" value={recordForm.gender} onChange={handleRecordFormChange}>
                                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{translateGender(g)}</option>)}
                            </Select>

                            <Input label="Kategori (KU/Kelompok)" id="category" name="category" type="text" value={recordForm.category} onChange={handleRecordFormChange} placeholder="Contoh: KU 1, Senior, dsb" />

                            <div className="space-y-1">
                                <label className="block text-sm font-medium text-text-secondary">Waktu Rekor</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <Input label="Min" id="min" name="min" type="number" value={recordForm.min} onChange={handleRecordFormChange} placeholder="0" />
                                    <Input label="Detik" id="sec" name="sec" type="number" value={recordForm.sec} onChange={handleRecordFormChange} placeholder="0" />
                                    <Input label="ms/100" id="ms" name="ms" type="number" value={recordForm.ms} onChange={handleRecordFormChange} placeholder="00" />
                                </div>
                            </div>

                            <Input label="Pemegang Rekor" id="holderName" name="holderName" value={recordForm.holderName} onChange={handleRecordFormChange} required placeholder="Nama Lengkap" />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Tahun Set" id="yearSet" name="yearSet" type="number" value={recordForm.yearSet} onChange={handleRecordFormChange} required />
                                <Input label="Lokasi" id="locationSet" name="locationSet" value={recordForm.locationSet} onChange={handleRecordFormChange} placeholder="Kota/Negara" />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button type="submit" className="flex-1">{editingRecord ? 'Perbarui' : 'Simpan'}</Button>
                                {editingRecord && <Button variant="secondary" type="button" onClick={handleCancelEdit}>Batal</Button>}
                            </div>
                        </form>
                    </Card>

                    <Card>
                        <h2 className="text-xl font-bold mb-4">Impor Massal</h2>
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <p className="text-sm text-text-secondary">Unggah file Excel untuk memperbarui banyak rekor.</p>
                                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>Unduh Template</Button>
                            </div>
                            <input type="file" id="record-upload-dedicated" accept=".xlsx, .xls" className="hidden" onChange={handleRecordFileChange} />
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => document.getElementById('record-upload-dedicated')?.click()} className="flex-1">Pilih File</Button>
                                <Button onClick={handleRecordUpload} disabled={!recordFile || isProcessing} className="flex-1">
                                    {isProcessing ? <Spinner /> : 'Unggah'}
                                </Button>
                            </div>
                            {recordFile && <p className="text-xs text-primary italic font-medium">File: {recordFile.name}</p>}
                            {uploadResult && (
                                <div className={`p-3 rounded-lg border text-sm ${uploadResult.errors.length > 0 ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-green-500/10 border-green-500/30 text-green-600'}`}>
                                    <p className="font-bold">Hasil: {uploadResult.success} berhasil</p>
                                    {uploadResult.errors.length > 0 && (
                                        <div className="mt-2 max-h-32 overflow-y-auto">
                                            <p className="font-bold border-b border-red-500/20 mb-1">Galat:</p>
                                            <ul className="list-disc pl-4 space-y-1">
                                                {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* List Section */}
                <div className="lg:col-span-8 space-y-4">
                    <Card>
                        <div className="flex flex-col md:flex-row gap-4 mb-6">
                            <div className="flex-1">
                                <Input label="Pencarian Nama" name="holderName" value={recordFilters.holderName} onChange={handleFilterChange} placeholder="Cari pemegang rekor..." />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-[2]">
                                <Select label="Tipe Rekor" name="type" value={recordFilters.type} onChange={handleFilterChange}>
                                    <option value="all">Semua Tipe</option>
                                    <option value={RecordType.PORPROV}>PORPROV</option>
                                    <option value={RecordType.NASIONAL}>Nasional</option>
                                </Select>
                                <Select label="Gaya" name="style" value={recordFilters.style} onChange={handleFilterChange}>
                                    <option value="all">Semua Gaya</option>
                                    {SWIM_STYLE_OPTIONS.map(s => <option key={s} value={s}>{translateSwimStyle(s)}</option>)}
                                </Select>
                                <Select label="Gender" name="gender" value={recordFilters.gender} onChange={handleFilterChange}>
                                    <option value="all">Semua</option>
                                    <option value={Gender.MALE}>Putra (L)</option>
                                    <option value={Gender.FEMALE}>Putri (P)</option>
                                </Select>
                                <div className="flex items-end">
                                    <Button variant="secondary" onClick={handleResetFilters} className="w-full">Reset</Button>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-hidden border border-border rounded-lg">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-surface border-b border-border text-text-secondary uppercase text-[11px] font-bold">
                                        <tr>
                                            <th className="px-4 py-3">Tipe</th>
                                            <th className="px-4 py-3">Nomor Lomba</th>
                                            <th className="px-4 py-3">Pemegang Rekor</th>
                                            <th className="px-4 py-3 text-right">Waktu</th>
                                            <th className="px-4 py-3 text-center">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {isRecordsLoading ? (
                                            <tr><td colSpan={5} className="p-8 text-center"><Spinner /><p className="mt-2">Memuat rekor...</p></td></tr>
                                        ) : filteredRecords.length > 0 ? (
                                            filteredRecords.map(record => (
                                                <tr key={record.id} className="hover:bg-background/80 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${record.type === RecordType.PORPROV ? 'bg-primary/20 text-primary' : 'bg-orange-500/20 text-orange-600'}`}>{record.type}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-bold">{record.distance}m {translateSwimStyle(record.style)}</p>
                                                        <p className="text-[10px] text-text-secondary uppercase">{translateGender(record.gender)} {record.category ? `| ${record.category}` : ''}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium">{record.holderName}</p>
                                                        <p className="text-[10px] text-text-secondary">{record.locationSet ? `${record.locationSet}, ` : ''}{record.yearSet}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                                                        {formatTime(record.time)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => handleEditRecord(record)} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Edit"><EditIcon /></button>
                                                            <button onClick={() => handleDeleteRecord(record)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors" title="Hapus"><TrashIcon /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan={5} className="p-12 text-center text-text-secondary">Tidak ada rekor yang ditemukan.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isDeleteRecordModalOpen} onClose={() => setIsDeleteRecordModalOpen(false)} title="Konfirmasi Hapus">
                <div className="space-y-4">
                    <p className="text-sm">Apakah Anda yakin ingin menghapus rekor <span className="font-bold">{recordToDelete?.holderName}</span>?</p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setIsDeleteRecordModalOpen(false)} className="flex-1">Batal</Button>
                        <Button variant="danger" onClick={confirmDeleteRecord} className="flex-1">Hapus</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteAllRecordsModalOpen} onClose={() => setIsDeleteAllRecordsModalOpen(false)} title="Hapus Semua Data Rekor">
                <div className="space-y-4">
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-sm">
                        <p className="font-bold uppercase mb-1">Peringatan Keras!</p>
                        <p>Anda akan menghapus SELURUH daftar rekor ({currentRecords.length} data). Tindakan ini tidak dapat dibatalkan.</p>
                    </div>
                    <p className="font-medium text-center">Lanjutkan penghapusan permanen?</p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setIsDeleteAllRecordsModalOpen(false)} className="flex-1">Batal</Button>
                        <Button variant="danger" onClick={handleConfirmDeleteAllRecords} className="flex-1">Ya, Hapus Semua</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
