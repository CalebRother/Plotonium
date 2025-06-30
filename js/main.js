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

// NEW: Get references to range selection UI
const beforeRangeInput = document.getElementById('before-range-input');
const setBeforeButton = document.getElementById('set-before-button');
const afterRangeInput = document.getElementById('after-range-input');
const setAfterButton = document.getElementById('set-after-button');

// NEW: Get references to the new menu items
const importCsvMenu = document.getElementById('import-csv-menu');
const exportCsvMenu = document.getElementById('export-csv-menu');
const addRowMenu = document.getElementById('add-row-menu');
const addColMenu = document.getElementById('add-col-menu');
const clearTableMenu = document.getElementById('clear-table-menu');

// NEW: Variable to store the current selection range from the spreadsheet
let currentSelectionRange = null;

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
    // NEW: Hook to capture user's selection
    afterSelectionEnd: (r, c, r2, c2) => {
        // Convert numeric coordinates to A1-style notation
        const startCol = Handsontable.helper.colIndexToLabel(c);
        const endCol = Handsontable.helper.colIndexToLabel(c2);
        const startRow = r + 1;
        const endRow = r2 + 1;
        
        // Store the selection range
        currentSelectionRange = {
            from: { row: Math.min(startRow, endRow), col: Math.min(c, c2) },
            to: { row: Math.max(startRow, endRow), col: Math.max(c, c2) },
            a1: `${startCol}${startRow}:${endCol}${endRow}`
        };
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

    // --- NEW: Event listeners for the "Set" buttons ---
    setBeforeButton.addEventListener('click', () => {
        if (currentSelectionRange) {
            beforeRangeInput.value = currentSelectionRange.a1;
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    setAfterButton.addEventListener('click', () => {
        if (currentSelectionRange) {
            afterRangeInput.value = currentSelectionRange.a1;
        } else {
            alert("Please select a range of cells in the spreadsheet first.");
        }
    });

    // --- Event listeners for menu items ---
    importCsvMenu.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', (e) => {
        e.preventDefault();
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52));
    });
    exportCsvMenu.addEventListener('click', (e) => { /* ... existing export logic ... */ });
    fileInput.addEventListener('change', (event) => { /* ... existing file input logic ... */ });
    
    // --- MODIFIED: Run button logic now uses ranges ---
    runButton.addEventListener('click', async () => {
        const beforeRangeStr = beforeRangeInput.value;
        const afterRangeStr = afterRangeInput.value;

        if (!beforeRangeStr || !afterRangeStr) {
            alert("Please set both 'Before' and 'After' ranges.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Processing data and running analysis...";
        outputsDiv.style.display = 'none';

        const shelter = await new webR.Shelter();
        try {
            // Function to get data from a range string (e.g., "A1:A50")
            const getDataFromRange = (rangeStr) => {
                const range = hot.getPlugin('customBorders').getBorders(hot.getSelectedRangeLast());
                 if (!range) return [];
                const from = range[0].range.from;
                const to = range[0].range.to;
                return hot.getData(from.row, from.col, to.row, to.col).flat();
            };

            const beforeData = getDataFromRange(beforeRangeStr);
            const afterData = getDataFromRange(afterRangeStr);

            if (beforeData.length !== afterData.length || beforeData.length === 0) {
                 alert("Error: 'Before' and 'After' ranges must have the same number of cells and not be empty.");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }
            
            // --- MODIFIED: The R command now creates the data frame on the fly ---
            const rCommand = `
                # Create a data frame from the JavaScript arrays
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                
                data <- data.frame(
                    before_col = before_vals,
                    after_col = after_vals
                )
                
                # Run the same analysis function, but on our new data frame
                paired_comparison(
                    data = data,
                    before_col = before_col,
                    after_col = after_col,
                    parametric = FALSE
                )
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

main();
