import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { classify, getCategories } from '../engine/classifier.js';
import dxMap from '../data/dx_map.json';
import pxMap from '../data/px_map.json';

const DX_COLUMN_PATTERNS = ['dx', 'diagnosis', 'dx_code', 'dx_codes', 'icd_dx', 'icd10_dx', 'tani', 'tani_kodu'];
const PX_COLUMN_PATTERNS = ['px', 'procedure', 'px_code', 'px_codes', 'icd_px', 'icd10_px', 'islem', 'islem_kodu'];

function findColumn(headers, patterns) {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    for (const pattern of patterns) {
        const idx = lowerHeaders.indexOf(pattern);
        if (idx !== -1) return headers[idx];
    }
    return null;
}

function classifyRows(rows, headers) {
    const categories = getCategories();
    const dxCol = findColumn(headers, DX_COLUMN_PATTERNS);
    const pxCol = findColumn(headers, PX_COLUMN_PATTERNS);

    if (!dxCol) {
        return { error: 'Dosyada tanı kodu sütunu bulunamadı. Beklenen sütun adları: dx, diagnosis, dx_code, tani, tani_kodu' };
    }

    const outHeaders = [...headers, ...categories, ...categories.map(c => `${c}_tech`), 'ccc_flag', 'num_categories'];
    const outputRows = [outHeaders];
    let totalRows = 0;
    let skippedRows = 0;

    for (const row of rows) {
        totalRows++;
        try {
            const dxRaw = String(row[dxCol] || '');
            const dxCodes = dxRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
            const pxCodes = pxCol ? String(row[pxCol] || '').split(/[;,]/).map(s => s.trim()).filter(Boolean) : [];

            const result = classify(dxCodes, pxCodes, dxMap, pxMap);

            const outRowValues = [];
            for (const h of headers) outRowValues.push(row[h] !== undefined ? row[h] : '');
            for (const cat of categories) outRowValues.push(result[cat]);
            for (const cat of categories) outRowValues.push(result[`${cat}_tech`]);
            outRowValues.push(result.ccc_flag);
            outRowValues.push(result.num_categories);

            outputRows.push(outRowValues);
        } catch (e) {
            skippedRows++;
        }
    }

    if (totalRows === 0) {
        return { error: 'Dosyada işlenecek veri bulunamadı.' };
    }

    const csvOutput = Papa.unparse(outputRows);
    return { csvOutput, totalRows, skippedRows, error: null };
}

function triggerCsvDownload(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default function BatchUploader() {
    const { t } = useTranslation();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

    const handleFile = useCallback((selectedFile) => {
        setError('');
        setSuccess(null);

        if (!selectedFile) return;

        const fileName = selectedFile.name.toLowerCase();
        const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));
        if (!hasValidExtension) {
            setError(t('batch.error.format'));
            return;
        }

        if (selectedFile.size > 50 * 1024 * 1024) {
            setError(t('batch.error.size'));
            return;
        }

        setFile(selectedFile);
    }, [t]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        handleFile(droppedFile);
    }, [handleFile]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const handleProcess = useCallback(async () => {
        if (!file) return;

        setLoading(true);
        setError('');
        setSuccess(null);

        try {
            const fileName = file.name.toLowerCase();
            let rows, headers;

            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (jsonData.length === 0) {
                    setError('Dosyada işlenecek veri bulunamadı.');
                    return;
                }
                headers = Object.keys(jsonData[0]);
                rows = jsonData;
            } else {
                const text = await file.text();
                const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
                headers = parsed.meta.fields || [];
                rows = parsed.data;
            }

            const result = classifyRows(rows, headers);

            if (result.error) {
                setError(result.error);
                return;
            }

            triggerCsvDownload(result.csvOutput, 'ccc_v3_sonuclar.csv');
            setSuccess({ totalRows: result.totalRows, skippedRows: result.skippedRows });
        } catch (err) {
            setError(t('batch.error'));
        } finally {
            setLoading(false);
        }
    }, [file, t]);

    const handleClear = useCallback(() => {
        setFile(null);
        setError('');
        setSuccess(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    return (
        <div className="ccc-batch">
            <div className="ccc-batch-description">
                <h2>{t('batch.title')}</h2>
                <p>{t('batch.description.1')}<br />{t('batch.description.2')}</p>
            </div>

            {/* Upload Zone */}
            <div
                className={`ccc-upload-zone ${dragOver ? 'ccc-upload-zone--dragover' : ''} ${file ? 'ccc-upload-zone--has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                aria-label={t('batch.dropzone.ariaLabel')}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={e => handleFile(e.target.files[0])}
                    className="ccc-file-input"
                    aria-label={t('batch.dropzone.ariaLabel')}
                />

                {file ? (
                    <div className="ccc-file-info">
                        <span className="ccc-file-icon">📄</span>
                        <div>
                            <p className="ccc-file-name">{file.name}</p>
                            <p className="ccc-file-size">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                    </div>
                ) : (
                    <div className="ccc-upload-prompt">
                        <span className="ccc-upload-icon">⬆️</span>
                        <p className="ccc-upload-text">{t('batch.dropzone.select')}</p>
                        <p className="ccc-upload-hint">{t('batch.dropzone.drag')}</p>
                    </div>
                )}
            </div>

            <p className="ccc-column-hint">{t('batch.requirements.title')} {t('batch.req.id')}, {t('batch.req.dx')}</p>

            {/* Action Buttons */}
            <div className="ccc-actions">
                <button
                    className="ccc-btn ccc-btn--primary"
                    onClick={handleProcess}
                    disabled={!file || loading}
                >
                    {loading ? t('batch.processing') : t('batch.button.download')}
                </button>
                <button
                    className="ccc-btn ccc-btn--secondary"
                    onClick={handleClear}
                    disabled={loading}
                >
                    {t('batch.button.new')}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="ccc-error" role="alert">
                    <strong>{error}</strong>
                </div>
            )}

            {/* Success */}
            {success && (
                <div className="ccc-success" role="status">
                    <strong>{t('batch.success', { count: success.totalRows })}</strong>
                    {Number(success.skippedRows) > 0 && (
                        <p className="ccc-warning-text">{success.skippedRows} satır atlandı (hatalı veri).</p>
                    )}
                </div>
            )}
        </div>
    );
}
