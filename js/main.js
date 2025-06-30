import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// --- Get references to all HTML elements ---
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

// --- NEW: This variable will hold the coordinates of the last selection ---
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
    // --- MODIFIED: This hook now only stores the selection coordinates ---
    afterSelection: (r, c, r2, c2) => {
        // Find the top-left and bottom-right corners of the selection
        const startRow = Math.min(r, r2);
        const endRow = Math.max(r, r2);
        const startCol = Math.min(c, c2);
        const endCol = Math.max(c, c2);
        lastSelection = { startRow, endRow, startCol, endCol };
    }
});

function loadCsvData(file) { /* ... This function is correct and remains unchanged ... */ }

// --- NEW: Helper function to parse an A1-style range string (e.g., "B2:C10") ---
function parseA1Range(rangeStr) {
    const [start, end] = rangeStr.split(':');
    const startCoords = Handsontable.helper.cellCoords(start);
    const endCoords = end ? Handsontable.helper.cellCoords(end) : startCoords;

    return {
        startRow: Math.min(startCoords.row, endCoords.row),
        endRow: Math.max(startCoords.row, endCoords.row),
        startCol: Math.min(startCoords.col, endCoords.col),
        endCol: Math.max(startCoords.col, endCoords.col),
    };
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

    // --- MODIFIED: Event listeners for "Set" buttons ---
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

    // --- FIX: Re-attaching event listeners to the menu items ---
    importCsvMenu.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', (e) => { /* ... existing clear logic ... */ });
    exportCsvMenu.addEventListener('click', (e) => { /* ... existing export logic ... */ });
    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            // Reusing the same loadCsvData function as before
            loadCsvData(event.target.files[0]);
            fileInput.value = '';
        }
    });
    
    // --- MODIFIED: Run button logic now uses the new range parser ---
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
            // Function to get data from a range string
            const getDataFromRange = (rangeStr) => {
                try {
                    const { startRow, endRow, startCol, endCol } = parseA1Range(rangeStr);
                    return hot.getData(startRow, startCol, endRow, endCol).flat();
                } catch (e) {
                    return null; // Return null if range is invalid
                }
            };

            const beforeData = getDataFromRange(beforeRangeStr);
            const afterData = getDataFromRange(afterRangeStr);

            if (!beforeData || !afterData || beforeData.length !== afterData.length || beforeData.length === 0) {
                 alert("Error: Invalid range format or ranges have different sizes. Please check your input (e.g., 'A1:A50').");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }
            
            statusMessage.innerText = "Running analysis...";
            // --- The R command logic remains the same ---
            const rCommand = `
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                data <- data.frame(before_col = before_vals, after_col = after_vals)
                paired_comparison(data = data, before_col = before_col, after_col = after_col)
            `;
            
            const result = await shelter.captureR(rCommand);
            // ... (The rest of the result processing logic is the same)
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

// Re-add the loadCsvData function for completeness
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

main();
