import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// Get references to all HTML elements
const fileInput = document.getElementById('csv-file-input');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
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

let lastSelection = null;

// Initialize Handsontable
const hot = new Handsontable(spreadsheetContainer, {
    startRows: 1000,
    startCols: 52,
    rowHeaders: true,
    colHeaders: true,
    height: '100%',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    afterSelection: (r, c, r2, c2) => {
        const startRow = Math.min(r, r2);
        const endRow = Math.max(r, r2);
        const startCol = Math.min(c, c2);
        const endCol = Math.max(c, c2);
        lastSelection = { startRow, endRow, startCol, endCol };
    }
});

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

// Helper function to parse an A1-style range string
function parseA1Range(rangeStr) {
    try {
        const [start, end] = rangeStr.split(':');
        const startCoords = Handsontable.helper.cellCoords(start);
        const endCoords = end ? Handsontable.helper.cellCoords(end) : startCoords;

        return {
            startRow: Math.min(startCoords.row, endCoords.row),
            endRow: Math.max(startCoords.row, endCoords.row),
            startCol: Math.min(startCoords.col, endCoords.col),
            endCol: Math.max(startCoords.col, endCoords.col),
        };
    } catch (e) {
        // Return null if the range string is invalid
        return null;
    }
}

async function main() {
    try {
        statusMessage.innerText = "Initializing WebR...";
        await webR.init();
        statusMessage.innerText = "Installing R packages...";
        await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales'))");
        statusMessage.innerText = "Loading R functions...";
        const response = await fetch('r/paired_comparison.R');
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

    // Event listeners for "Set" buttons
    setBeforeButton.addEventListener('click', () => {
        if (lastSelection) {
            const startCol = Handsontable.helper.colIndexToLabel(lastSelection.startCol);
            const endCol = Handsontable.helper.colIndexToLabel(lastSelection.endCol);
            beforeRangeInput.value = `${startCol}${lastSelection.startRow + 1}:${endCol}${lastSelection.endRow + 1}`;
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    setAfterButton.addEventListener('click', () => {
        if (lastSelection) {
            const startCol = Handsontable.helper.colIndexToLabel(lastSelection.startCol);
            const endCol = Handsontable.helper.colIndexToLabel(lastSelection.endCol);
            afterRangeInput.value = `${startCol}${lastSelection.startRow + 1}:${endCol}${lastSelection.endRow + 1}`;
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    // Event listeners for menu items
    importCsvMenu.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', (e) => {
        e.preventDefault();
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52));
    });
    exportCsvMenu.addEventListener('click', (e) => {
        e.preventDefault();
        const dataToExport = hot.getSourceData(0,0,hot.countRows()-1, hot.countCols()-1);
        const csv = Papa.unparse(dataToExport, { header: true });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'data.csv';
        link.click();
    });
    
    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            loadCsvData(event.target.files[0]);
            fileInput.value = '';
        }
    });
    
    // Run button logic
    runButton.addEventListener('click', async () => {
        const beforeRangeStr = beforeRangeInput.value;
        const afterRangeStr = afterRangeInput.value;

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
                alert("Invalid range format. Please use 'A1' or 'A1:A50' format.");
                runButton.disabled = false;
                statusMessage.innerText = "Ready.";
                await shelter.purge();
                return;
            }

            const beforeData = hot.getData(beforeRange.startRow, beforeRange.startCol, beforeRange.endRow, beforeRange.endCol).flat();
            const afterData = hot.getData(afterRange.startRow, afterRange.startCol, afterRange.endRow, afterRange.endCol).flat();

            if (beforeData.length !== afterData.length || beforeData.length === 0) {
                 alert("Error: 'Before' and 'After' ranges must have the same number of cells and not be empty.");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }
            
            statusMessage.innerText = "Running analysis...";
            const rCommand = `
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                data <- data.frame(before_col = before_vals, after_col = after_vals)
                paired_comparison(data = data, before_col = before_col, after_col = after_col)
            `;
            
            const result = await shelter.captureR(rCommand);
            
            try {
                const plots = result.images;
                if (plots.length > 0) {
                    const img = document.createElement('img');
                    img.src = plots[0]; 
                    plotOutput.innerHTML = '';
                    plotOutput.appendChild(img);
                }
                const textOutput = result.messages
                    .filter(msg => msg.type === 'stdout' || msg.type === 'stderr')
                    .map(msg => msg.data)
                    .join('\\n');
                statsOutput.innerText = textOutput;
                outputsDiv.style.display = 'block';
            } finally {
                result.destroy();
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
}

main();
