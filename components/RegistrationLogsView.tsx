import React, { useEffect, useState } from 'react';
import { getRegistrationLogs } from '../services/databaseService';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export const RegistrationLogsView: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProof, setSelectedProof] = useState<string | null>(null);

    const fetchLogs = async () => {
        try {
            setIsLoading(true);
            const data = await getRegistrationLogs();
            setLogs(data);
        } catch (error) {
            console.error("Error fetching logs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-text-primary uppercase tracking-tight">Log Pendaftaran & Pembayaran</h1>
                <Button onClick={fetchLogs} variant="outline">Refresh</Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-20"><Spinner /></div>
            ) : logs.length === 0 ? (
                <Card className="text-center p-20">
                    <p className="text-text-secondary text-xl font-bold">Belum ada data pendaftaran yang tercatat.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {logs.map((log) => (
                        <Card key={log.id} className="hover:border-primary transition-all duration-300">
                            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${log.registration_type === 'COLLECTIVE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {log.registration_type}
                                        </span>
                                        <span className="text-xs text-text-secondary font-bold">
                                            {new Date(log.created_at).toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-black text-text-primary">{log.registrant_name}</h3>
                                    <p className="text-sm font-bold text-text-secondary">
                                        Total: <span className="text-primary">{formatCurrency(log.amount)}</span>
                                    </p>
                                    <div className="text-xs text-text-secondary">
                                        {log.details?.events_count && <span>{log.details.events_count} Nomor Lomba</span>}
                                        {log.details?.swimmers_count && <span> • {log.details.swimmers_count} Atlet</span>}
                                        {log.details?.pic && <span> • PIC: {log.details.pic} ({log.details.phone})</span>}
                                    </div>
                                </div>
                                
                                {log.proof && (
                                    <Button 
                                        onClick={() => setSelectedProof(log.proof)}
                                        variant="outline"
                                        className="shrink-0"
                                    >
                                        Lihat Bukti Bayar
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {selectedProof && (
                <Modal isOpen={true} onClose={() => setSelectedProof(null)} title="Bukti Transaksi">
                    <div className="flex justify-center p-4">
                        <img 
                            src={selectedProof} 
                            alt="Bukti Bayar" 
                            className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" 
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};
