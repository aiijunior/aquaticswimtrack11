import React, { useState, useMemo } from 'react';
import type { Swimmer, SwimEvent } from '../types';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { updateSwimmer, deleteSwimmer, deleteAllSwimmers, unregisterSwimmerFromEvent, updateSwimmerSeedTime, registerSwimmerToEvent, addSwimmer } from '../services/databaseService';
import { formatEventName, formatTime, toTitleCase, AGE_GROUP_OPTIONS } from '../constants';
import { useNotification } from './ui/NotificationManager';

// --- ICONS ---
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
const UsersGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);
const MaleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
         <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9.5a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
    </svg>
);
const FemaleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
);
const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286zm0 13.036h.008v.008h-.008v-.008z" />
    </svg>
);
const ClipboardCheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

// --- Component Props & Local Components ---
interface SwimmersViewProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  isLoading: boolean;
  onDataUpdate: () => void;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number | string; onClick?: () => void; isActive?: boolean; }> = ({ icon, label, value, onClick, isActive }) => (
    <Card
        className={`flex items-center space-x-4 transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-xl hover:border-primary' : ''} ${isActive ? 'border-primary ring-2 ring-primary' : ''}`}
        onClick={onClick}
    >
        {icon}
        <div>
            <p className="text-text-secondary text-sm">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    </Card>
);


export const SwimmersView: React.FC<SwimmersViewProps> = ({ swimmers, events, isLoading, onDataUpdate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [selectedSwimmer, setSelectedSwimmer] = useState<Swimmer | null>(null);
  const [editFormData, setEditFormData] = useState<Omit<Swimmer, 'id'>>({
    name: '',
    birthYear: new Date().getFullYear(),
    gender: 'Male',
    club: '',
    ageGroup: ''
  });
  const { addNotification } = useNotification();

  // State for adding a new swimmer
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: '',
    birthYear: new Date().getFullYear() - 10,
    gender: 'Male' as 'Male' | 'Female',
    club: '',
    ageGroup: ''
  });

  // State for event actions in modal
  const [isUnregisterModalOpen, setIsUnregisterModalOpen] = useState(false);
  const [isEditSeedTimeModalOpen, setIsEditSeedTimeModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ event: SwimEvent; seedTime: number } | null>(null);
  const [editTime, setEditTime] = useState({ min: '0', sec: '0', ms: '00' });
  const [registrationData, setRegistrationData] = useState({ eventId: '', min: '99', sec: '99', ms: '99' });
  
  // State for filtering and view mode
  const [genderFilter, setGenderFilter] = useState<'Male' | 'Female' | 'All'>('All');
  const [viewMode, setViewMode] = useState<'swimmerList' | 'clubRecap'>('swimmerList');


  const stats = useMemo(() => {
    const totalSwimmers = swimmers.length;
    const maleSwimmers = swimmers.filter(s => s.gender === 'Male').length;
    const femaleSwimmers = swimmers.filter(s => s.gender === 'Female').length;
    const totalClubs = new Set(swimmers.map(s => s.club.trim())).size;
    return { totalSwimmers, maleSwimmers, femaleSwimmers, totalClubs };
  }, [swimmers]);

  const filteredSwimmers = useMemo(() => {
    return swimmers.filter(swimmer => {
        const searchMatch = !searchQuery ||
            swimmer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            swimmer.club.toLowerCase().includes(searchQuery.toLowerCase());

        const genderMatch = genderFilter === 'All' || swimmer.gender === genderFilter;

        return searchMatch && genderMatch;
    });
  }, [swimmers, searchQuery, genderFilter]);

  const clubRecap = useMemo(() => {
    if (viewMode !== 'clubRecap') return [];
    const clubCounts: Record<string, number> = {};
    swimmers.forEach(swimmer => {
        if (!clubCounts[swimmer.club]) {
            clubCounts[swimmer.club] = 0;
        }
        clubCounts[swimmer.club]++;
    });
    return Object.entries(clubCounts).sort((a, b) => b[1] - a[1]); // Sort by count descending
  }, [swimmers, viewMode]);
  
  const registeredEvents = useMemo(() => {
    if (!selectedSwimmer || !events) return [];

    return events
        .map(event => {
            const entry = event.entries.find(e => e.swimmerId === selectedSwimmer.id);
            if (entry) {
                return {
                    event,
                    seedTime: entry.seedTime
                };
            }
            return null;
        })
        .filter((e): e is { event: SwimEvent; seedTime: number } => e !== null);
  }, [selectedSwimmer, events]);

  const availableEventsForRegistration = useMemo(() => {
    if (!selectedSwimmer) return [];
    const registeredEventIds = new Set(registeredEvents.map(re => re.event.id));
    return events.filter(event => 
        !registeredEventIds.has(event.id) &&
        (event.gender === 'Mixed' || 
         (selectedSwimmer.gender === 'Male' && event.gender === "Men's") ||
         (selectedSwimmer.gender === 'Female' && event.gender === "Women's"))
    );
  }, [selectedSwimmer, events, registeredEvents]);


  // Modal Handlers
  const handleOpenEditModal = (swimmer: Swimmer) => {
    setSelectedSwimmer(swimmer);
    setEditFormData({
        name: swimmer.name,
        birthYear: swimmer.birthYear,
        gender: swimmer.gender,
        club: swimmer.club,
        ageGroup: swimmer.ageGroup || ''
    });
    setIsEditModalOpen(true);
  };
  
  const handleOpenEventsModal = (swimmer: Swimmer) => {
    setSelectedSwimmer(swimmer);
    setIsEventsModalOpen(true);
  };

  const handleOpenDeleteModal = (swimmer: Swimmer) => {
    setSelectedSwimmer(swimmer);
    setIsDeleteModalOpen(true);
  };
  
  const closeModal = () => {
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
    setIsEventsModalOpen(false);
    setIsUnregisterModalOpen(false);
    setIsEditSeedTimeModalOpen(false);
    setIsRegisterModalOpen(false);
    setIsAddModalOpen(false);
    setSelectedSwimmer(null);
    setActionTarget(null);
  };

  // Form Handlers
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue: string | number = value;
    if (name === 'birthYear') {
        finalValue = parseInt(value);
    } else if (name === 'name' || name === 'club') {
        finalValue = toTitleCase(value);
    }
    setEditFormData(prev => ({...prev, [name]: finalValue}));
  };
  
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSwimmer) return;
    try {
        await updateSwimmer(selectedSwimmer.id, editFormData);
        addNotification('Data perenang berhasil diperbarui.', 'info');
        closeModal();
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal memperbarui: ${error.message}`, 'error');
    }
  };
  
  const handleDelete = async () => {
    if (!selectedSwimmer) return;
    try {
        await deleteSwimmer(selectedSwimmer.id);
        addNotification(`Perenang ${selectedSwimmer.name} berhasil dihapus.`, 'error');
        closeModal();
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal menghapus: ${error.message}`, 'error');
    }
  };
  
  const handleConfirmDeleteAll = async () => {
    try {
        await deleteAllSwimmers();
        addNotification('Semua data perenang berhasil dihapus.', 'error');
        setIsDeleteAllModalOpen(false);
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal menghapus semua perenang: ${error.message}`, 'error');
    }
  };

  // --- Add Swimmer Handlers ---
  const handleOpenAddModal = () => {
    setAddFormData({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male',
        club: '',
        ageGroup: ''
    });
    setIsAddModalOpen(true);
  };

  const handleAddFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let val;
    if (name === 'birthYear') {
        val = parseInt(value) || 0;
    } else if (name === 'name' || name === 'club') {
        val = toTitleCase(value);
    } else {
        val = value;
    }
    setAddFormData(prev => ({...prev, [name]: val }));
  };
  
  const handleAddSwimmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFormData.name || !addFormData.club) return;
    try {
        await addSwimmer(addFormData);
        addNotification(`Perenang ${addFormData.name} berhasil ditambahkan.`, 'success');
        closeModal();
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal menambahkan perenang: ${error.message}`, 'error');
    }
  };

  // --- Event Action Handlers ---
  const handleOpenUnregisterModal = (event: SwimEvent, seedTime: number) => {
    setActionTarget({ event, seedTime });
    setIsUnregisterModalOpen(true);
  };

  const handleOpenEditSeedTimeModal = (event: SwimEvent, seedTime: number) => {
    setActionTarget({ event, seedTime });
    if (seedTime > 0) {
        const totalMs = seedTime;
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const hundredths = Math.round((totalMs % 1000) / 10);
        setEditTime({
            min: String(minutes),
            sec: String(seconds),
            ms: String(hundredths).padStart(2, '0'),
        });
    } else {
        setEditTime({ min: '99', sec: '99', ms: '99' });
    }
    setIsEditSeedTimeModalOpen(true);
  };
  
  const handleConfirmUnregister = async () => {
    if (!actionTarget || !selectedSwimmer) return;
    try {
        await unregisterSwimmerFromEvent(actionTarget.event.id, selectedSwimmer.id);
        addNotification('Pendaftaran berhasil dihapus.', 'error');
        setIsUnregisterModalOpen(false);
        setActionTarget(null);
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal menghapus pendaftaran: ${error.message}`, 'error');
    }
  };

  const handleConfirmEditSeedTime = async () => {
    if (!actionTarget || !selectedSwimmer) return;

    const min = parseInt(editTime.min || '0');
    const sec = parseInt(editTime.sec || '0');
    const ms = parseInt(editTime.ms || '0');

    if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
        addNotification('Input detik harus di bawah 60, kecuali untuk "No Time" (99:99.99).', 'error');
        return;
    }

    let newSeedTime = (min * 60000) + (sec * 1000) + (ms * 10);
    if (min === 99 && sec === 99 && ms === 99) {
        newSeedTime = 0;
    }

    try {
        await updateSwimmerSeedTime(actionTarget.event.id, selectedSwimmer.id, newSeedTime);
        addNotification('Waktu unggulan berhasil diperbarui.', 'info');
        setIsEditSeedTimeModalOpen(false);
        setActionTarget(null);
        onDataUpdate();
    } catch (error: any) {
        addNotification(`Gagal memperbarui waktu: ${error.message}`, 'error');
    }
  };

  const handleOpenRegisterModal = () => {
    setIsEventsModalOpen(false);
    setIsRegisterModalOpen(true);
    setRegistrationData({ eventId: '', min: '99', sec: '99', ms: '99' });
  };

  const handleConfirmRegistration = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedSwimmer || !registrationData.eventId) {
          addNotification('Silakan pilih nomor lomba.', 'error');
          return;
      }

      const min = parseInt(registrationData.min || '0');
      const sec = parseInt(registrationData.sec || '0');
      const ms = parseInt(registrationData.ms || '0');
      
      if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
        addNotification('Input detik harus di bawah 60, kecuali untuk "No Time" (99:99.99).', 'error');
        return;
      }
      
      let newSeedTime = (min * 60000) + (sec * 1000) + (ms * 10);
      if (min === 99 && sec === 99 && ms === 99) {
          newSeedTime = 0;
      }
      
      try {
        const result = await registerSwimmerToEvent(registrationData.eventId, selectedSwimmer.id, newSeedTime);
        if(result.success) {
            addNotification('Perenang berhasil didaftarkan.', 'success');
            closeModal();
            onDataUpdate();
        } else {
            addNotification(result.message, 'error');
        }
      } catch (error: any) {
          addNotification(`Gagal mendaftar: ${error.message}`, 'error');
      }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Daftar Perenang</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<UsersGroupIcon />} label="Total Peserta" value={stats.totalSwimmers} onClick={() => { setViewMode('swimmerList'); setGenderFilter('All'); }} isActive={viewMode === 'swimmerList' && genderFilter === 'All'} />
          <StatCard icon={<MaleIcon />} label="Total Putra" value={stats.maleSwimmers} onClick={() => { setViewMode('swimmerList'); setGenderFilter('Male'); }} isActive={viewMode === 'swimmerList' && genderFilter === 'Male'} />
          <StatCard icon={<FemaleIcon />} label="Total Putri" value={stats.femaleSwimmers} onClick={() => { setViewMode('swimmerList'); setGenderFilter('Female'); }} isActive={viewMode === 'swimmerList' && genderFilter === 'Female'} />
          <StatCard icon={<ShieldIcon />} label="Total Klub" value={stats.totalClubs} onClick={() => setViewMode('clubRecap')} isActive={viewMode === 'clubRecap'} />
      </div>

      <Card>
        {isLoading ? (
          <p>Memuat daftar perenang...</p>
        ) : viewMode === 'swimmerList' ? (
          <>
            <div className="flex justify-between items-end mb-4 gap-4 flex-wrap">
                <div className="flex-grow">
                    <Input 
                        label="Cari berdasarkan Nama atau Klub"
                        id="swimmer-search"
                        type="text"
                        placeholder="Ketik untuk mencari..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                 <div className="flex space-x-2 flex-shrink-0">
                    <Button onClick={handleOpenAddModal}>
                        Tambah Perenang
                    </Button>
                    <Button 
                        variant="danger" 
                        onClick={() => setIsDeleteAllModalOpen(true)}
                        disabled={swimmers.length === 0}
                        title={swimmers.length === 0 ? "Tidak ada peserta untuk dihapus" : "Hapus semua data peserta"}
                    >
                        Hapus Semua Peserta
                    </Button>
                </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3">Nama</th>
                    <th className="p-3">Tahun Lahir</th>
                    <th className="p-3">Jenis Kelamin</th>
                    <th className="p-3">KU</th>
                    <th className="p-3">Klub</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSwimmers.length > 0 ? (
                    filteredSwimmers.map((swimmer) => (
                      <tr key={swimmer.id} className="border-b border-border last:border-b-0 hover:bg-background">
                        <td className="p-3">{swimmer.name}</td>
                        <td className="p-3">{swimmer.birthYear}</td>
                        <td className="p-3">{swimmer.gender}</td>
                        <td className="p-3">{swimmer.ageGroup || '-'}</td>
                        <td className="p-3">{swimmer.club}</td>
                        <td className="p-3">
                            <div className="flex justify-center items-center space-x-2">
                              <button onClick={() => handleOpenEventsModal(swimmer)} className="p-2 text-green-500 hover:text-green-400 transition-colors" title="Lihat Nomor Lomba"><ClipboardCheckIcon /></button>
                              <button onClick={() => handleOpenEditModal(swimmer)} className="p-2 text-blue-400 hover:text-blue-300 transition-colors" title="Edit Peserta"><EditIcon /></button>
                              <button onClick={() => handleOpenDeleteModal(swimmer)} className="p-2 text-red-500 hover:text-red-400 transition-colors" title="Hapus Peserta"><TrashIcon /></button>
                            </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center p-6 text-text-secondary">
                        {searchQuery ? "Tidak ada perenang yang cocok dengan pencarian Anda." : "Tidak ada perenang yang cocok dengan filter yang dipilih."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-xl font-bold mb-4">Rekap Klub Peserta</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="p-3">Nama Klub</th>
                            <th className="p-3 text-center">Jumlah Perenang</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clubRecap.map(([clubName, count]) => (
                            <tr key={clubName} className="border-b border-border last:border-b-0 hover:bg-background">
                                <td className="p-3 font-semibold">{clubName}</td>
                                <td className="p-3 text-center">{count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}
      </Card>
      
      {/* Add Modal */}
      <Modal isOpen={isAddModalOpen} onClose={closeModal} title="Tambah Perenang Baru">
        <form onSubmit={handleAddSwimmer} className="space-y-4">
            <Input label="Nama Lengkap" id="add-name" name="name" value={addFormData.name} onChange={handleAddFormChange} required />
            <Input label="Tahun Lahir" id="add-birthYear" name="birthYear" type="number" value={addFormData.birthYear} onChange={handleAddFormChange} required />
            <Select label="Jenis Kelamin" id="add-gender" name="gender" value={addFormData.gender} onChange={handleAddFormChange}>
                <option value="Male">Laki-laki (Male)</option>
                <option value="Female">Perempuan (Female)</option>
            </Select>
            <Select label="Kelompok Umur (KU) (Opsional)" id="add-ageGroup" name="ageGroup" value={addFormData.ageGroup} onChange={handleAddFormChange}>
                <option value="">-- Tanpa KU --</option>
                {AGE_GROUP_OPTIONS.map(ku => <option key={ku} value={ku}>{ku}</option>)}
            </Select>
            <Input label="Klub/Tim" id="add-club" name="club" value={addFormData.club} onChange={handleAddFormChange} required />
            <div className="flex justify-end pt-4 space-x-2">
                <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
                <Button type="submit">Tambah</Button>
            </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={closeModal} title="Edit Data Perenang">
        <form onSubmit={handleUpdate} className="space-y-4">
            <Input label="Nama Lengkap" id="name" name="name" value={editFormData.name} onChange={handleEditFormChange} required />
            <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={editFormData.birthYear} onChange={handleEditFormChange} required />
            <Select label="Jenis Kelamin" id="gender" name="gender" value={editFormData.gender} onChange={handleEditFormChange}>
                <option value="Male">Laki-laki (Male)</option>
                <option value="Female">Perempuan (Female)</option>
            </Select>
            <Select label="Kelompok Umur (KU) (Opsional)" id="edit-ageGroup" name="ageGroup" value={editFormData.ageGroup || ''} onChange={handleEditFormChange}>
                <option value="">-- Tanpa KU --</option>
                {AGE_GROUP_OPTIONS.map(ku => <option key={ku} value={ku}>{ku}</option>)}
            </Select>
            <Input label="Klub/Tim" id="club" name="club" value={editFormData.club} onChange={handleEditFormChange} required />
            <div className="flex justify-end pt-4 space-x-2">
                <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
                <Button type="submit">Simpan Perubahan</Button>
            </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={closeModal} title="Konfirmasi Hapus Perenang">
        {selectedSwimmer && (
            <div className="space-y-6">
                <p className="text-text-secondary">
                    Anda yakin ingin menghapus perenang <strong className="text-text-primary">{selectedSwimmer.name}</strong> dari klub <strong className="text-text-primary">{selectedSwimmer.club}</strong>?
                    <br/>
                    Semua data pendaftaran dan hasil lomba yang terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
                </p>
                <div className="flex justify-end space-x-4">
                    <Button variant="secondary" onClick={closeModal}>Batal</Button>
                    <Button variant="danger" onClick={handleDelete}>Ya, Hapus</Button>
                </div>
            </div>
        )}
      </Modal>

      {/* Delete All Modal */}
        <Modal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} title="Konfirmasi Hapus Semua Peserta">
            <div className="space-y-6">
                <p className="text-text-secondary">
                    Anda benar-benar yakin ingin menghapus <strong className="text-text-primary">SEMUA</strong> data peserta?
                    <br/><br/>
                    Tindakan ini akan <strong className="text-red-500">menghapus permanen</strong>:
                    <ul className="list-disc list-inside mt-2 text-red-400">
                        <li>Semua profil perenang</li>
                        <li>Semua pendaftaran mereka di setiap nomor lomba</li>
                        <li>Semua hasil lomba yang tercatat</li>
                    </ul>
                    <br />
                    Tindakan ini <strong className="font-bold">TIDAK DAPAT DIBATALKAN</strong>.
                </p>
                <div className="flex justify-end space-x-4">
                    <Button variant="secondary" onClick={() => setIsDeleteAllModalOpen(false)}>Batal</Button>
                    <Button variant="danger" onClick={handleConfirmDeleteAll}>Ya, Saya Mengerti, Hapus Semua</Button>
                </div>
            </div>
        </Modal>

      {/* View Events Modal */}
      <Modal isOpen={isEventsModalOpen} onClose={closeModal} title={`Nomor Lomba: ${selectedSwimmer?.name}`}>
        {selectedSwimmer && (
            <div className="space-y-4">
                {registeredEvents.length > 0 ? (
                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {registeredEvents.map(({ event, seedTime }) => (
                        <li key={event.id} className="flex justify-between items-center p-3 bg-background rounded-md">
                            <div>
                                <span className="font-semibold text-text-primary">{formatEventName(event)}</span>
                                <span className="block font-mono text-sm text-text-secondary">Waktu Unggulan: {formatTime(seedTime)}</span>
                            </div>
                            <div className="flex space-x-1 flex-shrink-0 ml-2">
                                <button onClick={() => handleOpenEditSeedTimeModal(event, seedTime)} className="p-2 text-blue-400 hover:text-blue-300 transition-colors" title="Edit Waktu Unggulan"><EditIcon /></button>
                                <button onClick={() => handleOpenUnregisterModal(event, seedTime)} className="p-2 text-red-500 hover:text-red-400 transition-colors" title="Hapus Pendaftaran"><TrashIcon /></button>
                            </div>
                        </li>
                    ))}
                    </ul>
                ) : (
                    <p className="text-text-secondary text-center py-4">
                    Peserta ini belum terdaftar di nomor lomba manapun.
                    </p>
                )}
                <div className="flex justify-between pt-2 border-t border-border">
                    <Button variant="primary" onClick={handleOpenRegisterModal}>Tambah Nomor Lomba</Button>
                    <Button variant="secondary" onClick={closeModal}>Tutup</Button>
                </div>
            </div>
        )}
      </Modal>
      
      {/* Register for new Event Modal */}
      <Modal isOpen={isRegisterModalOpen} onClose={closeModal} title={`Daftarkan: ${selectedSwimmer?.name}`}>
        <form onSubmit={handleConfirmRegistration} className="space-y-4">
            <Select
              label="Pilih Nomor Lomba"
              id="event-register"
              value={registrationData.eventId}
              onChange={e => setRegistrationData(p => ({...p, eventId: e.target.value}))}
            >
              <option value="">-- Pilih Nomor Lomba --</option>
              {availableEventsForRegistration.map(event => (
                <option key={event.id} value={event.id}>
                  {formatEventName(event)}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-2 pt-2">
                <Input label="Menit" id="reg-min" type="number" min="0" value={registrationData.min} onChange={e => setRegistrationData(p => ({...p, min: e.target.value}))} />
                <Input label="Detik" id="reg-sec" type="number" min="0" max="99" value={registrationData.sec} onChange={e => setRegistrationData(p => ({...p, sec: e.target.value}))} />
                <Input label="ss/100" id="reg-ms" type="number" min="0" max="99" value={registrationData.ms} onChange={e => setRegistrationData(p => ({...p, ms: e.target.value}))} />
            </div>

            <div className="flex justify-end pt-4 space-x-2 border-t border-border">
                <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
                <Button type="submit">Daftarkan</Button>
            </div>
        </form>
      </Modal>

       {/* Unregister from Event Modal */}
      <Modal isOpen={isUnregisterModalOpen} onClose={closeModal} title="Konfirmasi Hapus Pendaftaran">
          {selectedSwimmer && actionTarget && (
              <div className="space-y-6">
                  <p className="text-text-secondary">
                      Anda yakin ingin menghapus pendaftaran perenang <strong className="text-text-primary">{selectedSwimmer.name}</strong> dari nomor lomba <strong className="text-text-primary">{formatEventName(actionTarget.event)}</strong>?
                  </p>
                  <div className="flex justify-end space-x-4">
                      <Button variant="secondary" onClick={closeModal}>Batal</Button>
                      <Button variant="danger" onClick={handleConfirmUnregister}>Ya, Hapus Pendaftaran</Button>
                  </div>
              </div>
          )}
      </Modal>

      {/* Edit Seed Time Modal */}
      <Modal isOpen={isEditSeedTimeModalOpen} onClose={closeModal} title="Edit Waktu Unggulan">
          {selectedSwimmer && actionTarget && (
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmEditSeedTime(); }} className="space-y-4">
                  <p className="text-text-secondary">
                      Edit waktu unggulan untuk <strong className="text-text-primary">{selectedSwimmer.name}</strong> di nomor lomba <strong className="text-text-primary">{formatEventName(actionTarget.event)}</strong>.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                      <Input label="Menit" id="edit-min" type="number" min="0" value={editTime.min} onChange={e => setEditTime(p => ({...p, min: e.target.value}))} />
                      <Input label="Detik" id="edit-sec" type="number" min="0" max="99" value={editTime.sec} onChange={e => setEditTime(p => ({...p, sec: e.target.value}))} />
                      <Input label="ss/100" id="edit-ms" type="number" min="0" max="99" value={editTime.ms} onChange={e => setEditTime(p => ({...p, ms: e.target.value}))} />
                  </div>
                  <div className="flex justify-end pt-4 space-x-2 border-t border-border">
                      <Button type="button" variant="secondary" onClick={closeModal}>Batal</Button>
                      <Button type="submit">Simpan Waktu</Button>
                  </div>
              </form>
          )}
      </Modal>

    </div>
  );
};