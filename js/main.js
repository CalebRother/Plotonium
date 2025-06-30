import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// --- Get references to all HTML elements ---
const fileInput = document.getElementById('csv-file-input');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const beforeColSelect = document.getElementById('before-col-select');
const afterColSelect = document.getElementById('after-col-select');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
const statsOutput = document.getElementById('stats-output');

// --- NEW: Get references to the new menu items ---
const importCsvMenu = document.getElementById('import-csv-menu');
const exportCsvMenu = document.getElementById('export-csv-menu');
const addRowMenu = document.getElementById('add-row-menu');
const addColMenu = document.getElementById('add-col-menu');
const clearTableMenu = document.getElementById('clear-table-menu');


// --- Initialize the Handsontable spreadsheet ---
const hot = new Handsontable(spreadsheetContainer, {
    startRows: 1000,
    startCols: 52,
    rowHeaders: true,
    colHeaders: true,
    height: '100%',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    afterChange: updateColumnSelectors,
    afterLoadData: updateColumnSelectors,
    afterSetDataAtCell: updateColumnSelectors,
    afterCreateRow: updateColumnSelectors,
    afterRemoveRow: updateColumnSelectors,
    afterCreateCol: updateColumnSelectors,
    afterRemoveCol: updateColumnSelectors,
});

function updateColumnSelectors() {
    setTimeout(() => {
        const headers = hot.getColHeader();
        const currentBefore = beforeColSelect.value;
        const currentAfter = afterColSelect.value;
        
        beforeColSelect.innerHTML = '';
        afterColSelect.innerHTML = '';
        
        const defaultOption = document.createElement('option');
        defaultOption.textContent = '-- Select a column --';
        defaultOption.value = '';
        beforeColSelect.appendChild(defaultOption);
        afterColSelect.appendChild(defaultOption.cloneNode(true));

        headers.forEach(header => {
            if (header && typeof header === 'string') { 
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                beforeColSelect.appendChild(option);
                afterColSelect.appendChild(option.cloneNode(true));
            }
        });
        
        beforeColSelect.value = currentBefore;
        afterColSelect.value = currentAfter;
    }, 0);
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

async function main() {
    try {
        statusMessage.innerText = "Initializing WebR...";
        await webR.init();

        statusMessage.innerText = "Installing R packages...";
        await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales'))");
        
        statusMessage.innerText = "Loading R functions from file...";
        const response = await fetch('r/paired_comparison.R');
        if (!response.ok) {
            throw new Error(`Failed to fetch R script: ${response.status}`);
        }
        let rScriptText = await response.text();
        rScriptText = rScriptText.replace(/\r/g, '');
        await webR.evalR(rScriptText);
        
        statusMessage.innerText = "Ready.";
        runButton.disabled = false;
        updateColumnSelectors();

    } catch (error) {
        console.error("Failed during initialization:", error);
        statusMessage.innerText = "Error during startup. Check console.";
    }

    // --- MODIFIED: Event listeners are now attached to the menu items ---
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

    // Run button logic (no changes needed here)
    runButton.addEventListener('click', async () => {
        const beforeCol = beforeColSelect.value;
        const afterCol = afterColSelect.value;

        if (!beforeCol || !afterCol || beforeCol === afterCol) {
            alert("Please select two different columns to compare.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Processing data and running analysis...";
        outputsDiv.style.display = 'none';

        const shelter = await new webR.Shelter();
        try {
            const tableData = hot.getData();
            const headers = hot.getColHeader();
            let csvContent = Papa.unparse({ fields: headers, data: tableData }, { skipEmptyLines: false });
            await webR.FS.writeFile('/tmp/current_data.csv', csvContent);

            const rCommand = `
                data <- read.csv('/tmp/current_data.csv', check.names = FALSE)
                
                paired_comparison(
                    data = data,
                    before_col = \`${beforeCol}\`,
                    after_col = \`${afterCol}\`,
                    parametric = FALSE
                )
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
