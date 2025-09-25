import React from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { config } from '../config';

const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <pre className="bg-background p-4 rounded-md text-sm text-text-primary whitespace-pre-wrap font-mono overflow-x-auto">
        <code>{children}</code>
    </pre>
);

export const SqlEditorView: React.FC = () => {
    const projectRef = config.supabase.url.replace('https://', '').split('.')[0];
    const supabaseSqlEditorUrl = `https://app.supabase.com/project/${projectRef}/sql/new`;

    const exampleQuery = `-- Contoh: Menampilkan 5 perenang teratas dari klub "Klub Cepat"
SELECT name, birth_year, club
FROM public.swimmers
WHERE club = 'Klub Cepat'
ORDER BY birth_year DESC
LIMIT 5;`;

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">SQL Editor</h1>

            <Card className="border-yellow-500/50 bg-yellow-500/5 mb-6">
                <div className="flex items-start space-x-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h2 className="text-xl font-bold text-yellow-600 dark:text-yellow-400">Peringatan Keamanan dan Fungsionalitas</h2>
                        <p className="text-text-secondary mt-2">
                            Menjalankan kueri SQL secara langsung dari aplikasi web (klien) memiliki risiko keamanan yang sangat tinggi dan dapat mengekspos database Anda terhadap serangan.
                            <br /><br />
                            Oleh karena itu, fitur ini mengarahkan Anda ke <strong>SQL Editor resmi di dasbor Supabase Anda</strong>. Ini adalah cara yang aman dan direkomendasikan untuk berinteraksi langsung dengan database Anda.
                        </p>
                    </div>
                </div>
            </Card>

            <Card>
                <h2 className="text-2xl font-bold mb-4">Akses SQL Editor Supabase</h2>
                <p className="text-text-secondary mb-4">
                    Gunakan tombol di bawah ini untuk membuka editor SQL di proyek Supabase Anda. Anda mungkin perlu login ke akun Supabase Anda terlebih dahulu.
                </p>
                <Button 
                    onClick={() => window.open(supabaseSqlEditorUrl, '_blank')}
                    title="Buka Editor SQL Supabase di tab baru"
                >
                    Buka Supabase SQL Editor
                </Button>

                <div className="mt-6 pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold mb-2">Contoh Kueri</h3>
                    <p className="text-text-secondary mb-4">
                        Anda dapat menyalin kueri di bawah ini dan menjalankannya di editor Supabase untuk melihat contoh cara kerjanya.
                    </p>
                    <CodeBlock>{exampleQuery}</CodeBlock>
                </div>
            </Card>
        </div>
    );
};
