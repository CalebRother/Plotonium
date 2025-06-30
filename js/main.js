// This file should have an import statement at the top if you are using modules.
// For this example, we assume WebR is loaded globally from index.html.
document.addEventListener('DOMContentLoaded', () => {
    
    const webR = new WebR();

    // --- THIS SECTION IS CORRECTED ---
    // Get references to all the current HTML elements in index.html
    const fileInput = document.getElementById('csv-file-input');
    const spreadsheetContainer = document.getElementById('spreadsheet-container');
    const runButton = document.getElementById('run-button');
    const statusMessage = document.getElementById('status-message');
    
    // This is the container for the entire output section in the top-left panel
    const outputsDiv = document.getElementById('outputs'); 
    const plotCanvas = document.getElementById('plot-canvas');
    const statsOutput = document.getElementById('stats-output');
    
    const importCsvMenu = document.getElementById('import-csv-menu');
    const exportCsvMenu = document.getElementById('export-csv-menu');
    const addRowMenu = document.getElementById('add-row-menu');
    const addColMenu = document.getElementById('add-col-menu');
    const clearTableMenu = document.getElementById('clear-table-menu');

    let selections = [];

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
        afterSelectionEnd: (r, c, r2, c2) => {
            const selection = {
                startRow: Math.min(r, r2),
                endRow: Math.max(r, r2),
                startCol: Math.min(c, c2),
                endCol: Math.max(c, c2),
            };
            selections.push(selection);
            if (selections.length > 2) {
                selections.shift();
            }
            // You would have a function here to update the UI with selection info
        }
    });
    
    // Helper functions (loadCsvData, etc.) are assumed to be here and correct
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
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales', 'ggpubr'))");
            statusMessage.innerText = "Loading R functions...";
            const response = await fetch(`r/paired_comparison.R?v=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch R script: ${response.status}`);
            }
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

    // All your menu event listeners go here...
    importCsvMenu.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', (e) => {
        e.preventDefault();
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52));
        selections = [];
        // You would call your UI update function here
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
        if (selections.length < 2) {
            alert("Please select two data ranges in the spreadsheet.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Processing data and running analysis...";
        outputsDiv.style.display = 'none';

        const shelter = await new webR.Shelter();
        try {
            const afterRange = selections[0];
            const beforeRange = selections[1];
            
            const beforeData = hot.getData(beforeRange.startRow, beforeRange.startCol, beforeRange.endRow, beforeRange.endCol).flat().filter(v => v !== null && v !== '');
            const afterData = hot.getData(afterRange.startRow, afterRange.startCol, afterRange.endRow, afterRange.endCol).flat().filter(v => v !== null && v !== '');

            if (beforeData.length !== afterData.length || beforeData.length === 0) {
                 alert("Error: 'Before' and 'After' ranges must contain the same number of non-empty cells.");
                 runButton.disabled = false;
                 statusMessage.innerText = "Ready.";
                 await shelter.purge();
                 return;
            }
            
            const rCommand = `
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                data <- data.frame(before_col = before_vals, after_col = after_vals)
                
                paired_comparison(
                    data = data, 
                    before_col = before_col, 
                    after_col = after_col
                )
            `;
            
            const result = await shelter.captureR(rCommand);
            
            try {
                // Handle the plot
                const plots = result.images;
                if (plots.length > 0) {
                    const plot = plots[0]; 
                    const ctx = plotCanvas.getContext('2d');
                    plotCanvas.width = plot.width;
                    plotCanvas.height = plot.height;
                    ctx.drawImage(plot, 0, 0);
                }

                // Handle the text output
                const textOutput = result.stdout + '\\n' + result.stderr;
                statsOutput.innerText = textOutput.trim();
                
                // --- FIX: Make the entire output container visible ---
                outputsDiv.style.display = 'block';

            } finally {
                // No result.destroy() needed
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
