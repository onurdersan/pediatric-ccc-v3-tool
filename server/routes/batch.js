
import { Router } from 'express';
import busboy from 'busboy';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { classify, getCategories } from '../../src/engine/classifier.js';

const router = Router();

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

// Common column name patterns for detection (case-insensitive)
const DX_COLUMN_PATTERNS = ['dx', 'diagnosis', 'dx_code', 'dx_codes', 'icd_dx', 'icd10_dx', 'tani', 'tani_kodu'];
const PX_COLUMN_PATTERNS = ['px', 'procedure', 'px_code', 'px_codes', 'icd_px', 'icd10_px', 'islem', 'islem_kodu'];

/**
 * Find the first matching column name from a list of patterns.
 */
function findColumn(headers, patterns) {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    for (const pattern of patterns) {
        const idx = lowerHeaders.indexOf(pattern);
        if (idx !== -1) return headers[idx];
    }
    return null;
}

/**
 * Get file extension from filename (lowercase, with dot).
 */
function getFileExtension(filename) {
    if (!filename) return '';
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
}

/**
 * Classify an array of row objects and return CSV output string.
 * Shared logic used by both CSV and Excel processing paths.
 * 
 * @param {Object[]} rows - Array of row objects with column headers as keys
 * @param {string[]} headers - Column names from the source file
 * @param {Object} dxMap - Dx code mapping
 * @param {Object} pxMap - Px code mapping
 * @returns {{ output: string, totalRows: number, skippedRows: number, error: string|null }}
 */
function classifyRows(rows, headers, dxMap, pxMap) {
    const categories = getCategories();
    const dxCol = findColumn(headers, DX_COLUMN_PATTERNS);
    const pxCol = findColumn(headers, PX_COLUMN_PATTERNS);

    if (!dxCol) {
        return {
            output: null,
            totalRows: 0,
            skippedRows: 0,
            error: 'Dosyada tanı kodu sütunu bulunamadı. Beklenen sütun adları: dx, diagnosis, dx_code, tani, tani_kodu'
        };
    }

    const outHeaders = [...headers, ...categories, ...categories.map(c => `${c}_tech`), 'ccc_flag', 'num_categories'];
    const outputChunks = [Papa.unparse([outHeaders])];
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

            outputChunks.push(Papa.unparse([outRowValues]));
        } catch (e) {
            skippedRows++;
        }
    }

    if (totalRows === 0) {
        return {
            output: null,
            totalRows: 0,
            skippedRows: 0,
            error: 'Dosyada işlenecek veri bulunamadı.'
        };
    }

    return {
        output: outputChunks.join('\n'),
        totalRows,
        skippedRows,
        error: null
    };
}

/**
 * Parse Excel buffer into { headers, rows }.
 */
function parseExcelBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return { headers: [], rows: [] };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (jsonData.length === 0) {
        return { headers: [], rows: [] };
    }
    const headers = Object.keys(jsonData[0]);
    return { headers, rows: jsonData };
}

/**
 * Send classification results as CSV download.
 */
function sendCsvResponse(res, result) {
    if (result.error) {
        return res.status(422).json({ error: true, message: result.error });
    }

    res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ccc_v3_sonuclar.csv"',
        'Cache-Control': 'no-store',
        'X-Total-Rows': String(result.totalRows),
    });
    if (result.skippedRows > 0) {
        res.set('X-Skipped-Rows', String(result.skippedRows));
    }
    res.send(result.output);
}

router.post('/classify-batch', (req, res) => {
    let bb;
    try {
        bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } });
    } catch (err) {
        return res.status(400).json({ error: true, message: 'Geçersiz istek formu.' });
    }

    let fileFound = false;

    bb.on('file', (name, file, info) => {
        if (name !== 'file') {
            file.resume();
            return;
        }
        fileFound = true;

        const ext = getFileExtension(info.filename);

        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            file.resume();
            if (!res.headersSent) {
                res.status(422).json({
                    error: true,
                    message: `Desteklenmeyen dosya formatı: ${ext || '(bilinmiyor)'}. Desteklenen formatlar: CSV, XLSX, XLS`
                });
            }
            return;
        }

        // Excel files: buffer entirely then parse
        if (ext === '.xlsx' || ext === '.xls') {
            const chunks = [];
            let hasError = false;

            file.on('data', (chunk) => {
                chunks.push(chunk);
            });

            file.on('limit', () => {
                hasError = true;
                if (!res.headersSent) {
                    res.status(413).json({ error: true, message: 'Dosya boyutu çok büyük. Maksimum 50MB desteklenmektedir.' });
                }
            });

            file.on('end', () => {
                if (hasError || res.headersSent) return;

                try {
                    const buffer = Buffer.concat(chunks);
                    const { headers, rows } = parseExcelBuffer(buffer);
                    const result = classifyRows(rows, headers, req.dxMap, req.pxMap);
                    sendCsvResponse(res, result);
                } catch (err) {
                    if (!res.headersSent) {
                        res.status(500).json({ error: true, message: 'Excel dosyası ayrıştırma hatası.' });
                    }
                }
            });

            return;
        }

        // CSV files: streaming parse with PapaParse
        const categories = getCategories();
        let dxCol = null;
        let pxCol = null;
        let headerWritten = false;
        let skippedRows = 0;
        let totalRows = 0;
        let outputChunks = [];
        let hasError = false;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            step: function (results, parser) {
                if (hasError) return;

                const row = results.data;
                const headers = results.meta.fields || [];

                if (!headerWritten) {
                    dxCol = findColumn(headers, DX_COLUMN_PATTERNS);
                    pxCol = findColumn(headers, PX_COLUMN_PATTERNS);

                    if (!dxCol) {
                        hasError = true;
                        parser.abort();
                        if (!res.headersSent) {
                            res.status(422).json({
                                error: true,
                                message: 'Dosyada tanı kodu sütunu bulunamadı. Beklenen sütun adları: dx, diagnosis, dx_code, tani, tani_kodu'
                            });
                        }
                        return;
                    }

                    const outHeaders = [...headers, ...categories, ...categories.map(c => `${c}_tech`), 'ccc_flag', 'num_categories'];
                    outputChunks.push(Papa.unparse([outHeaders]));
                    headerWritten = true;
                }

                totalRows++;
                try {
                    const dxRaw = String(row[dxCol] || '');
                    const dxCodes = dxRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
                    const pxCodes = pxCol ? String(row[pxCol] || '').split(/[;,]/).map(s => s.trim()).filter(Boolean) : [];

                    const result = classify(dxCodes, pxCodes, req.dxMap, req.pxMap);

                    const outRowValues = [];
                    for (const h of headers) outRowValues.push(row[h]);
                    for (const cat of categories) outRowValues.push(result[cat]);
                    for (const cat of categories) outRowValues.push(result[`${cat}_tech`]);
                    outRowValues.push(result.ccc_flag);
                    outRowValues.push(result.num_categories);

                    outputChunks.push(Papa.unparse([outRowValues]));
                } catch (e) {
                    skippedRows++;
                }
            },
            complete: function () {
                if (hasError) return;

                if (!headerWritten) {
                    if (!res.headersSent) {
                        return res.status(422).json({ error: true, message: 'Dosyada işlenecek veri bulunamadı veya bölüm ayrıştırma hatası.' });
                    }
                    return;
                }

                const finalOutput = outputChunks.join('\n');

                res.set({
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="ccc_v3_sonuclar.csv"',
                    'Cache-Control': 'no-store',
                    'X-Total-Rows': String(totalRows),
                });
                if (skippedRows > 0) {
                    res.set('X-Skipped-Rows', String(skippedRows));
                }

                res.send(finalOutput);
            },
            error: function (err) {
                if (hasError) return;
                hasError = true;
                if (!res.headersSent) {
                    res.status(500).json({ error: true, message: 'CSV ayrıştırma hatası.' });
                }
            }
        });

        file.on('limit', () => {
            if (hasError) return;
            hasError = true;
            if (!res.headersSent) {
                res.status(413).json({ error: true, message: 'Dosya boyutu çok büyük. Maksimum 50MB desteklenmektedir.' });
            }
        });
    });

    bb.on('finish', () => {
        if (!fileFound && !res.headersSent) {
            res.status(422).json({ error: true, message: 'Dosya yüklenmedi.' });
        }
    });

    bb.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).json({ error: true, message: 'Yükleme hatası.' });
        }
    });

    req.pipe(bb);
});

export default router;
