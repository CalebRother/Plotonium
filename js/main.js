import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

document.addEventListener('DOMContentLoaded', () => {
    
    const webR = new WebR();

    // Get references to all HTML elements
    const fileInput = document.getElementById('csv-file-input');
    const spreadsheetContainer = document.getElementById('spreadsheet-container');
    const runButton = document.getElementById('run-button');
    const statusMessage = document.getElementById('status-message');
    const outputsDiv = document.getElementById('outputs');
    const plotCanvas = document.getElementById('plot-canvas');
    const statsOutput = document.getElementById('stats-output');
    const beforeRangeInput = document.getElementById('before-range-input');
    const setBeforeButton = document.getElementById('set-before-button');
    const afterRangeInput = document.getElementById('after-range-input');
    const setAfterButton = document.getElementById('set-after-button');
    const importCsvMenu = document.getElementById('import-csv-menu');
    const exportCsvMenu = document.getElementById('export-csv-menu');
    const addRowMenu = document.getElementById('add-row-menu');
    const addColMenu = document.getElementById('add-col-menu');
    const clearTableMenu = document.getElementById('clear-table-menu');
    const parametricCheckbox = document.getElementById('parametric-checkbox');

    let lastSelection = null;

    const hot = new Handsontable(spreadsheetContainer, {
        startRows: 1000,
        startCols: 52,
        rowHeaders: true,
        colHeaders: true,
        height: '100%',
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        contextMenu: true,
        afterSelectionEnd: (r, c, r2, c2) => {
            lastSelection = { startRow: Math.min(r, r2), endRow: Math.max(r, r2), startCol: Math.min(c, c2), endCol: Math.max(c, c2) };
        }
    });

    function getA1Notation(selection) {
        const startCol = hot.getColHeader(selection.startCol);
        const endCol = hot.getColHeader(selection.endCol);
        return `${startCol}${selection.startRow + 1}:${endCol}${selection.endRow + 1}`;
    }

    function loadCsvData(file) {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.data.length === 0) return;
                hot.populateFromArray(0, 0, results.data);
            }
        });
    }

    function parseA1Range(rangeStr) {
        try {
            const colToIdx = (col) => col.split('').reduce((acc, val) => acc * 26 + val.charCodeAt(0) - 64, 0) - 1;
            const [start, end] = rangeStr.toUpperCase().split(':');
            const startMatch = start.match(/^([A-Z]+)(\d+)$/);
            if (!startMatch) return null;
            const startCol = colToIdx(startMatch[1]);
            const startRow = parseInt(startMatch[2], 10) - 1;
            if (!end) { return { startRow, startCol, endRow: startRow, endCol: startCol }; }
            const endMatch = end.match(/^([A-Z]+)(\d+)$/);
            if (!endMatch) return null;
            const endCol = colToIdx(endMatch[1]);
            const endRow = parseInt(endMatch[2], 10) - 1;
            return {
                startRow: Math.min(startRow, endRow),
                startCol: Math.min(startCol, endCol),
                endRow: Math.max(startRow, endRow),
                endCol: Math.max(startCol, endCol),
            };
        } catch (e) {
            console.error("Error parsing range:", e);
            return null;
        }
    }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR...";
            await webR.init();
            statusMessage.innerText = "Installing R packages...";
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'rstatix', 'scales', 'ggpubr'))");
            statusMessage.innerText = "Loading R functions...";
            const response = await fetch(`r/paired_comparison.R?v=${new Date().getTime()}`);
            if (!response.ok) { throw new Error(`Failed to fetch R script: ${response.status}`); }
            let rScriptText = await response.text();
            rScriptText = rScriptText.replace(/\r/g, '');
            await webR.evalR(rScriptText);
            statusMessage.innerText = "Ready.";
            runButton.disabled = false;
        } catch (error) {
            console.error("Failed during initialization:", error);
            statusMessage.innerText = "Error during startup. Check console.";
        }
    }

    // --- REVERTED: Event listeners for the "Set" buttons ---
    setBeforeButton.addEventListener('click', () => {
        if (lastSelection) {
            beforeRangeInput.value = getA1Notation(lastSelection);
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    setAfterButton.addEventListener('click', () => {
        if (lastSelection) {
            afterRangeInput.value = getA1Notation(lastSelection);
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    importCsvMenu.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', (e) => {
        e.preventDefault();
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52));
    });
    exportCsvMenu.addEventListener('click', (e) => { /* ... existing export logic ... */ });
    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            loadCsvData(event.target.files[0]);
            fileInput.value = '';
        }
    });
    
    // --- REVERTED: Run Button logic now uses the text input values ---
    runButton.addEventListener('click', async () => {
        const beforeRangeStr = beforeRangeInput.value.trim();
        const afterRangeStr = afterRangeInput.value.trim();

        if (!beforeRangeStr || !afterRangeStr) {
            alert("Please set both 'Before' and 'After' ranges.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Processing data...";
        outputsDiv.style.display = 'none';

        const shelter = await new webR.Shelter();
        try {
            const beforeRange = parseA1Range(beforeRangeStr);
            const afterRange = parseA1Range(afterRangeStr);

            if (!beforeRange || !afterRange) {
                 alert("Error: Invalid range format. Please use standard spreadsheet notation (e.g., 'A1' or 'B2:B61').");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }

            const beforeData = hot.getData(beforeRange.startRow, beforeRange.startCol, beforeRange.endRow, beforeRange.endCol).flat().filter(v => v !== null && v !== '');
            const afterData = hot.getData(afterRange.startRow, afterRange.startCol, afterRange.endRow, afterRange.endCol).flat().filter(v => v !== null && v !== '');

            if (beforeData.length !== afterData.length || beforeData.length === 0) {
                 alert("Error: 'Before' and 'After' ranges must contain the same number of non-empty cells.");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }
            
            const isParametric = parametricCheckbox.checked;
            statusMessage.innerText = "Running analysis...";
            const rCommand = `
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                data <- data.frame(before_col = before_vals, after_col = after_vals)
                
                paired_comparison(
                    data = data, 
                    before_col = before_col, 
                    after_col = after_col,
                    parametric = ${isParametric ? 'TRUE' : 'FALSE'}
                )
            `;
            
            const result = await shelter.captureR(rCommand);
            
            try {
                const plots = result.images;
                if (plots.length > 0) {
                    const plot = plots[0]; 
                    const ctx = plotCanvas.getContext('2d');
                    plotCanvas.width = plot.width;
                    plotCanvas.height = plot.height;
                    ctx.drawImage(plot, 0, 0);
                }

                const textOutput = result.output
                    .filter(msg => msg.type === 'stdout' || msg.type === 'stderr' || msg.type === 'message')
                    .map(msg => msg.data)
                    .join('\n');
                
                statsOutput.innerText = textOutput.trim();
                
                outputsDiv.style.display = 'block';

            } finally {
                // No destroy method needed
            }

        } catch(error) {
            console.error("Failed during analysis:", error);
            statusMessage.innerText = "An error occurred during analysis. Check console.";
        } finally {
            await shelter.purge();
            statusMessage.innerText = "Analysis complete.";
            runButton.disabled = false;
        }
    });

    main();
});
