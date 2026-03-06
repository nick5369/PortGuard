import { useState, useRef } from "react";
import {
    FileSpreadsheet,
    Upload,
    PenLine,
    X,
    FileUp,
    AlertTriangle,
    Loader2,
    Send,
} from "lucide-react";

const COLUMNS = [
    "Container_ID",
    "Declaration_Date",
    "Declaration_Time",
    "Trade_Regime",
    "Origin_Country",
    "Destination_Port",
    "Destination_Country",
    "HS_Code",
    "Importer_ID",
    "Exporter_ID",
    "Declared_Value",
    "Declared_Weight",
    "Measured_Weight",
    "Shipping_Line",
    "Dwell_Time_Hours",
];

const PLACEHOLDERS = [
    "41256141",
    "2021-04-01",
    "04:38:21",
    "Import",
    "RO",
    "PORT_40",
    "UZ",
    "420231",
    "Y3OM027",
    "FQKH1PD",
    "1248.7",
    "1",
    "1.041",
    "LINE_MODE_40",
    "67.6",
];

function parseCSV(text) {
    const lines = text
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.trim());
    return lines.map((line) =>
        line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
    );
}

function buildCSVBlob(headers, rows) {
    const lines = [headers.join(",")];
    rows.forEach((r) => lines.push(r.join(",")));
    return new Blob([lines.join("\n")], { type: "text/csv" });
}

export default function RiskInput({ onSubmit, loading }) {
    const [mode, setMode] = useState("csv");
    const [rowCount, setRowCount] = useState(3);
    const [manualRows, setManualRows] = useState(
        Array.from({ length: 3 }, () => Array(COLUMNS.length).fill(""))
    );
    const [csvFile, setCsvFile] = useState(null);
    const [csvData, setCsvData] = useState([]);
    const [hasHeader, setHasHeader] = useState(true);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef(null);

    function updateRowCount(n) {
        const count = Math.max(1, Math.min(100, Number(n) || 1));
        setRowCount(count);
        setManualRows((prev) => {
            if (count > prev.length)
                return [
                    ...prev,
                    ...Array.from({ length: count - prev.length }, () =>
                        Array(COLUMNS.length).fill("")
                    ),
                ];
            return prev.slice(0, count);
        });
    }

    function updateCell(ri, ci, val) {
        setManualRows((prev) => {
            const copy = prev.map((r) => [...r]);
            copy[ri][ci] = val;
            return copy;
        });
    }

    function handleFile(file) {
        if (!file) return;
        setCsvFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            const parsed = parseCSV(e.target.result);
            setCsvData(parsed);
        };
        reader.readAsText(file);
    }

    function clearFile() {
        setCsvFile(null);
        setCsvData([]);
        if (fileRef.current) fileRef.current.value = "";
    }

    function submit() {
        if (mode === "manual") {
            const filled = manualRows.filter((r) => r.some((c) => c.trim()));
            if (!filled.length) return;
            const blob = buildCSVBlob(COLUMNS, filled);
            onSubmit(blob, filled, COLUMNS);
        } else {
            if (!csvData.length) return;
            let headers;
            let rows;
            if (hasHeader) {
                headers = csvData[0];
                rows = csvData.slice(1);
            } else {
                headers = COLUMNS;
                rows = csvData;
            }
            const blob = buildCSVBlob(COLUMNS, rows);
            onSubmit(blob, rows, COLUMNS);
        }
    }

    const previewHeaders = hasHeader && csvData.length > 0 ? csvData[0] : COLUMNS;
    const previewRows =
        hasHeader && csvData.length > 1
            ? csvData.slice(1, 6)
            : !hasHeader && csvData.length > 0
                ? csvData.slice(0, 5)
                : [];
    const totalDataRows =
        csvData.length > 0
            ? hasHeader
                ? csvData.length - 1
                : csvData.length
            : 0;

    return (
        <div className="re-section anim-fadeUp" style={{ animationDelay: "100ms" }}>
            <div className="re-section-head">
                <FileSpreadsheet size={18} />
                Data Input
            </div>
            <div className="re-section-body">
                <div className="re-tabs">
                    <button
                        className={`re-tab ${mode === "csv" ? "active" : ""}`}
                        onClick={() => setMode("csv")}
                    >
                        <Upload size={15} />
                        Upload CSV
                    </button>
                    <button
                        className={`re-tab ${mode === "manual" ? "active" : ""}`}
                        onClick={() => setMode("manual")}
                    >
                        <PenLine size={15} />
                        Manual Entry
                    </button>
                </div>

                {mode === "manual" && (
                    <>
                        <div className="re-row-count">
                            <label>Number of Rows</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={rowCount}
                                onChange={(e) => updateRowCount(e.target.value)}
                            />
                        </div>
                        <div className="re-manual-table-wrap" style={{ maxHeight: 360 }}>
                            <table className="re-manual-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        {COLUMNS.map((c) => (
                                            <th key={c}>{c.replace(/_/g, " ")}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {manualRows.map((row, ri) => (
                                        <tr key={ri}>
                                            <td
                                                style={{
                                                    textAlign: "center",
                                                    color: "var(--pg-text-muted)",
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {ri + 1}
                                            </td>
                                            {row.map((val, ci) => (
                                                <td key={ci}>
                                                    <input
                                                        type="text"
                                                        value={val}
                                                        placeholder={PLACEHOLDERS[ci]}
                                                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {mode === "csv" && (
                    <>
                        {!csvFile && (
                            <div
                                className={`re-upload-zone ${dragOver ? "drag-over" : ""}`}
                                onClick={() => fileRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOver(true);
                                }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOver(false);
                                    handleFile(e.dataTransfer.files[0]);
                                }}
                            >
                                <FileUp size={32} />
                                <p>Drop your CSV file here or click to browse</p>
                                <span>.csv files only</span>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv"
                                    hidden
                                    onChange={(e) => handleFile(e.target.files[0])}
                                />
                            </div>
                        )}

                        {csvFile && (
                            <>
                                <div className="re-upload-file">
                                    <FileSpreadsheet size={18} />
                                    <span>{csvFile.name}</span>
                                    <small>{(csvFile.size / 1024).toFixed(1)} KB</small>
                                    <button onClick={clearFile} style={{ color: "var(--pg-text-muted)" }}>
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="re-header-toggle">
                                    <button
                                        className={`re-toggle ${hasHeader ? "on" : ""}`}
                                        onClick={() => setHasHeader(!hasHeader)}
                                    />
                                    <label>
                                        {hasHeader
                                            ? "First row contains column headers"
                                            : "No headers -- column names will be added automatically"}
                                    </label>
                                </div>

                                {csvData.length > 0 && (
                                    <div className="re-csv-preview">
                                        <table>
                                            <thead>
                                                <tr>
                                                    {previewHeaders.map((h, i) => (
                                                        <th key={i}>{h.replace(/_/g, " ")}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((r, ri) => (
                                                    <tr key={ri}>
                                                        {r.map((c, ci) => (
                                                            <td key={ci}>{c}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                <div className="re-actions">
                    <button
                        className="pg-btn pg-btn-filled"
                        onClick={submit}
                        disabled={
                            loading ||
                            (mode === "manual" &&
                                !manualRows.some((r) => r.some((c) => c.trim()))) ||
                            (mode === "csv" && !csvData.length)
                        }
                    >
                        {loading ? (
                            <>
                                <Loader2 size={15} className="ti-spin" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Send size={15} />
                                Analyze Risk
                            </>
                        )}
                    </button>
                    <span className="count-badge">
                        {mode === "manual"
                            ? `${manualRows.filter((r) => r.some((c) => c.trim())).length} row(s)`
                            : totalDataRows > 0
                                ? `${totalDataRows} row(s) detected`
                                : ""}
                    </span>
                </div>
            </div>
        </div>
    );
}
