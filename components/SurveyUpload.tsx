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
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const surveys: SurveyResult[] = [];

        if (lines.length < 2) return surveys;

        // --- NEW: Robust Header Detection ---
        // Find the actual header row by looking for keywords
        let headerRowIndex = 0;
        let rawHeaders: string[] = [];

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const currentHeaders = lines[i].split('\t').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            if (currentHeaders.some(h => h.includes('date') || h.includes('ticket') || h.includes('tech'))) {
                headerRowIndex = i;
                rawHeaders = currentHeaders;
                break;
            }
        }

        if (rawHeaders.length === 0) {
            return [];
        }

        const col = (name: string): number => {
            const exact = rawHeaders.indexOf(name.toLowerCase());
            if (exact !== -1) return exact;
            return rawHeaders.findIndex(h => h.includes(name.toLowerCase()));
        };

        const dateCol = col('date');
        const clientCol = col('client');
        const locationCol = col('location');
        const ticketCol = col('ticket no') !== -1 ? col('ticket no') : col('ticket');

        const techCol = (() => {
            const candidates = ['tech', 'technician', 'engineer', 'agent', 'staff', 'resolved by', 'handled by', 'assigned to', 'assignee'];
            // First pass: look for exact matches that aren't the ticket column
            for (const candidate of candidates) {
                const idx = rawHeaders.findIndex(h => h === candidate);
                if (idx !== -1 && idx !== ticketCol) return idx;
            }
            // Second pass: look for partial matches
            for (const candidate of candidates) {
                const idx = rawHeaders.findIndex(h => h.includes(candidate));
                if (idx !== -1 && idx !== ticketCol) return idx;
            }
            return -1;
        })();

        const problemCol = col('problem type') !== -1 ? col('problem type') : col('problem');
        const responsesCol = col('responses');

        // Improved Q-column detection: also look for "(1)", "(2)", "(3)" or "question 1" patterns
        const q1Col = (() => {
            if (col('q1') !== -1) return col('q1');
            if (responsesCol !== -1) return responsesCol;
            // Search for headers containing "(1)" or "question 1" or "#1"
            const idx = rawHeaders.findIndex(h => /\(1\)/.test(h) || /question\s*1/i.test(h) || /#1/i.test(h));
            return idx !== -1 ? idx : -1;
        })();
        const q2Col = (() => {
            if (col('q2') !== -1) return col('q2');
            if (q1Col !== -1) return q1Col + 1;
            const idx = rawHeaders.findIndex(h => /\(2\)/.test(h) || /question\s*2/i.test(h) || /#2/i.test(h));
            return idx !== -1 ? idx : -1;
        })();
        const q3Col = (() => {
            if (col('q3') !== -1) return col('q3');
            if (q1Col !== -1) return q1Col + 2;
            const idx = rawHeaders.findIndex(h => /\(3\)/.test(h) || /question\s*3/i.test(h) || /#3/i.test(h));
            return idx !== -1 ? idx : -1;
        })();


        // if (techCol === -1) { // Removed old log
        //     console.warn('⚠️ No tech/agent column found in TSV headers. Falling back to column index 4. Headers found:', rawHeaders);
        // }

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim(); // Keep trim for safety, though lines are already trimmed
            if (!line) continue;

            const parts = line.split('\t').map(p => p.replace(/^"|"$/g, '').trim());
            if (parts.length < 2) continue; // Added check for minimal parts

            // Extract Date (DD/MM/YYYY HH:mm or DD/MM/YY)
            const dateStr = dateCol !== -1 ? parts[dateCol] : parts[0];
            let timestamp = Date.now();
            try {
                // Handle DD/MM/YYYY HH:mm or DD/MM/YYYY or YYYY-MM-DD
                if (dateStr.includes('/')) {
                    const [day, month, yearPart] = dateStr.split('/');
                    let [year, time] = yearPart.includes(' ') ? yearPart.split(' ') : [yearPart, '00:00:00']; // Changed to 00:00:00
                    // Handle 2-digit years (e.g., 26 -> 2026)
                    if (year.length === 2) {
                        year = `20${year}`;
                    }

                    timestamp = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time || '00:00:00'}`).getTime(); // Changed to 00:00:00
                } else {
                    timestamp = new Date(dateStr).getTime();
                }
            } catch (e) {
            }

            if (isNaN(timestamp)) timestamp = Date.now();

            // Extract Scores format: "10: Extremely Satisfied" -> 10 OR raw "10"
            const extractScore = (str: string) => {
                if (!str) return 0;
                // Match "10: ..."
                const matchLong = str.match(/^(\d+):/);
                if (matchLong) return parseInt(matchLong[1]);

                // Match raw number "10" or "8.5"
                const matchRaw = str.match(/^(\d+(\.\d+)?)$/);
                if (matchRaw) return parseFloat(matchRaw[1]);

                return 0;
            };

            // Actual layout: Date(0) Survey(1) Client(2) Location(3) TicketNo(4) Tech(5) ProblemType(6) Responses(7,8,9...)
            const q1 = extractScore(q1Col !== -1 ? parts[q1Col] : '');
            const q2 = extractScore(q2Col !== -1 ? parts[q2Col] : '');
            const q3 = extractScore(q3Col !== -1 ? parts[q3Col] : '');
            const avg = (q1 + q2 + q3) / 3;

            const ticketNo = (ticketCol !== -1 ? parts[ticketCol] : undefined)?.trim(); // Fallback to undefined
            const tech = (techCol !== -1 ? parts[techCol] : undefined)?.trim(); // Fallback to undefined

            if (!ticketNo && !tech) continue;

            // Filter out rows where tech is empty or looks like a ticket number (purely numeric)
            if (tech && /^\d+$/.test(tech)) {
                continue;
            }

            const result = {
                id: ticketNo || `row-${i}-${Date.now()}`,
                ticketNo: ticketNo || '',
                date: timestamp,
                weekId: getWeekId(new Date(timestamp)),
                client: (clientCol !== -1 ? parts[clientCol] : '')?.trim() || '',
                location: (locationCol !== -1 ? parts[locationCol] : '')?.trim() || '',
                tech: tech || '',
                problemType: (problemCol !== -1 ? parts[problemCol] : '')?.trim() || '',
                q1,
                q2,
                q3,
                average: avg
            };

            if (surveys.length < 3) { // Log first 3 parsed rows
            }
            surveys.push(result);
        }

        return surveys;
    };

    /**
     * Detects file encoding by reading the BOM (Byte Order Mark).
     * UTF-16LE files start with 0xFF 0xFE.
     */
    const detectEncoding = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const buffer = e.target?.result as ArrayBuffer;
                if (buffer.byteLength >= 2) {
                    const bytes = new Uint8Array(buffer);
                    // UTF-16LE BOM: FF FE
                    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
                        resolve('UTF-16LE');
                        return;
                    }
                    // UTF-8 BOM: EF BB BF
                    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                        resolve('UTF-8');
                        return;
                    }
                }
                resolve('UTF-8'); // Default
            };
            reader.onerror = () => resolve('UTF-8');
            // Read only first 4 bytes for BOM detection
            reader.readAsArrayBuffer(file.slice(0, 4));
        });
    };

    const processFile = (file: File) => {
        setIsUploading(true);
        setError(null);
        setUploadStats(null);

        // Detect encoding first, then read with correct encoding
        detectEncoding(file).then(encoding => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const text = event.target?.result as string;
                    const parsedSurveys = parseTSV(text);

                    if (parsedSurveys.length === 0) {
                        setError("No valid survey data found. Please check headers.");
                        setIsUploading(false);
                        return;
                    }

                    await StorageService.saveSurveys(parsedSurveys);

                    setUploadStats({ total: parsedSurveys.length, new: parsedSurveys.length });
                    setIsUploading(false);
                    onUploadComplete();

                    alert(`Successfully processed ${parsedSurveys.length} surveys! Check the Dashboard/Firebase console.`);

                    if (fileInputRef.current) fileInputRef.current.value = '';
                } catch (err: any) {
                    setError(`Upload failed: ${err.message}`);
                    setIsUploading(false);
                }
            };
            reader.readAsText(file, encoding);
        });
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
        <div className="ui-card">
            <div className="flex justify-between items-center mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Upload surveys</h3>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">TSV format required</p>
                </div>
                <button
                    onClick={async () => {
                        if (window.confirm("Are you sure you want to delete ALL survey data? This cannot be undone.")) {
                            try {
                                setIsUploading(true);
                                await StorageService.clearAllSurveys();
                                onUploadComplete();
                                alert("All surveys cleared successfully.");
                            } catch (e: any) {
                                alert("Failed to clear: " + e.message);
                            } finally {
                                setIsUploading(false);
                            }
                        }
                    }}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand-red transition-colors"
                >
                    Clear all surveys
                </button>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border border-dashed rounded-xl p-4 text-center transition-colors ${isDragging
                    ? 'border-brand-navy bg-blue-50/50'
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
                    <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${isDragging ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy border border-slate-200'}`}>
                        {isUploading ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                        {isUploading ? 'Processing...' : (
                            <>
                                <span className="font-semibold text-brand-navy underline underline-offset-2">Click to upload</span> or drag and drop
                            </>
                        )}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-1">TSV files only</p>
                </div>
            </div>

            {error && (
                <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 text-brand-red text-xs font-medium rounded-lg animate-fade-in">
                    {error}
                </div>
            )}

            {uploadStats && (
                <div className="mt-3 px-4 py-3 bg-green-50 border border-emerald-200 text-brand-green text-xs font-medium rounded-lg flex items-center gap-2 animate-fade-in">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    Success! Processed <span className="ui-metric">{uploadStats.total}</span> surveys.
                </div>
            )}

            <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-3 text-[10px] text-slate-500 font-mono">
                <p className="font-semibold mb-1.5">Expected columns (any order):</p>
                <p>Date | Client | Location | Ticket No | <strong>Tech</strong> | Problem Type | Q1 | Q2 | Q3</p>
                <p className="mt-1 text-slate-400">Columns are matched by name — order doesn't matter.</p>
            </div>
        </div>
    );
};

export default SurveyUpload;
