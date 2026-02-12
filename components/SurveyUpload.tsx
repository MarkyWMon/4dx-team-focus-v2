import React, { useState, useRef } from 'react';
import { StorageService } from '../services/storage';
import { SurveyResult } from '../types';
import { getWeekId } from '../utils';

interface SurveyUploadProps {
    onUploadComplete: () => void;
}

const SurveyUpload: React.FC<SurveyUploadProps> = ({ onUploadComplete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStats, setUploadStats] = useState<{ total: number; new: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const parseTSV = (text: string): SurveyResult[] => {
        const lines = text.split('\n');
        const surveys: SurveyResult[] = [];

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split('\t').map(p => p.replace(/^"|"$/g, '')); // Remove quotes

            if (parts.length < 8) continue;

            // Extract Date (DD/MM/YYYY HH:mm)
            const dateStr = parts[0];
            const [day, month, yearTime] = dateStr.split('/');
            const [year, time] = yearTime.split(' ');
            const timestamp = new Date(`${year}-${month}-${day}T${time}`).getTime();

            // Extract Scores format: "10: Extremely Satisfied" -> 10
            const extractScore = (str: string) => {
                if (!str) return 0;
                const match = str.match(/^(\d+):/);
                return match ? parseInt(match[1]) : 0;
            };

            const q1 = extractScore(parts[6]);
            const q2 = extractScore(parts[7]);
            const q3 = extractScore(parts[8]);

            // Calculate Average (Percentage based on 10-point scale is just avg * 10)
            const avg = (q1 + q2 + q3) / 3;

            // Ticket No is unique ID
            const ticketNo = parts[3];

            surveys.push({
                id: ticketNo,
                ticketNo: ticketNo,
                date: timestamp,
                weekId: getWeekId(new Date(timestamp)),
                client: parts[1],
                location: parts[2],
                tech: parts[4],
                problemType: parts[5],
                q1,
                q2,
                q3,
                average: avg
            });
        }
        return surveys;
    };

    const processFile = (file: File) => {
        setIsUploading(true);
        setError(null);
        setUploadStats(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                const parsedSurveys = parseTSV(text);

                if (parsedSurveys.length === 0) {
                    setError("No valid survey data found in file.");
                    setIsUploading(false);
                    return;
                }

                console.log(`Parsed ${parsedSurveys.length} surveys. Uploading...`);
                await StorageService.saveSurveys(parsedSurveys);

                setUploadStats({ total: parsedSurveys.length, new: parsedSurveys.length });
                setIsUploading(false);
                onUploadComplete();

                if (fileInputRef.current) fileInputRef.current.value = '';
            } catch (err) {
                console.error("Upload failed", err);
                setError("Failed to parse or upload file. Please check format.");
                setIsUploading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    return (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-black text-brand-navy uppercase tracking-tight">Upload Surveys</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TSV Format required</p>
                </div>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all group ${isDragging
                    ? 'border-brand-navy bg-blue-50/50 scale-[1.02]'
                    : 'border-slate-200 bg-slate-50 hover:border-brand-navy/30'
                    }`}
            >
                {/* The Input covers the entire area */}
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".tsv,.txt"
                    onChange={handleFileChange}
                    className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    disabled={isUploading}
                    title={isUploading ? "Uploading..." : "Click or drag file here"}
                />

                <div className="pointer-events-none relative z-0">
                    <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${isDragging ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy shadow-sm group-hover:scale-110 duration-300'}`}>
                        {isUploading ? (
                            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        )}
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                        {isUploading ? 'Processing...' : (
                            <>
                                <span className="underline text-brand-navy decoration-2 underline-offset-2">Click to upload</span> or drag and drop
                            </>
                        )}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">TSV files only</p>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 text-brand-red text-xs font-bold rounded-xl animate-fade-in">
                    {error}
                </div>
            )}

            {uploadStats && (
                <div className="mt-4 p-3 bg-green-50 text-brand-green text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    Success! Processed {uploadStats.total} surveys.
                </div>
            )}

            <div className="mt-4 bg-slate-50 rounded-xl p-4 text-[10px] text-slate-400 font-mono">
                <p className="font-bold mb-2">Expected Columns:</p>
                <p>Date | Client | Location | Ticket No | Tech | Problem Type | Q1 | Q2 | Q3</p>
            </div>
        </div>
    );
};

export default SurveyUpload;
