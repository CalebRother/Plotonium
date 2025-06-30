import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// Get references to all HTML elements
const fileInput = document.getElementById('csv-file-input');
const loadCsvButton = document.getElementById('load-csv-button');
const addRowButton = document.getElementById('add-row-button');
const addColButton = document.getElementById('add-col-button');
const clearTableButton = document.getElementById('clear-table-button');
const exportCsvButton = document.getElementById('export-csv-button');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const beforeColSelect = document.getElementById('before-col-select');
const afterColSelect = document.getElementById('after-col-select');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
const statsOutput = document.getElementById('stats-output');

// Initialize the Handsontable spreadsheet
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

    // Event listeners
    loadCsvButton.addEventListener('click', () => { fileInput.click(); });
    addRowButton.addEventListener('click', () => { hot.alter('insert_row_below'); });
    addColButton.addEventListener('click', () => { hot.alter('insert_col_end'); });
    clearTableButton.addEventListener('click', () => {
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52));
    });
    exportCsvButton.addEventListener('click', () => {
        // Use the same logic as the run button to get clean data
        const cleanData = hot.getSourceData().filter(row => !hot.isEmptyRow(hot.getSourceData().indexOf(row)));
        const headers = hot.getColHeader().slice(0, hot.countCols()); // Get actual headers
        const csv = Papa.unparse({ fields: headers, data: cleanData });

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

    spreadsheetContainer.addEventListener('dragover', (e) => { e.preventDefault(); spreadsheetContainer.classList.add('dragover'); });
    spreadsheetContainer.addEventListener('dragleave', () => { spreadsheetContainer.classList.remove('dragover'); });
    spreadsheetContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        spreadsheetContainer.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            loadCsvData(e.dataTransfer.files[0]);
        }
    });

    // Run button logic
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
            // --- THIS IS THE FIX ---
            // 1. Get the source data array from the table.
            const sourceData = hot.getSourceData();
            // 2. Filter out rows that Handsontable considers empty.
            const cleanData = sourceData.filter((row, index) => !hot.isEmptyRow(index));
            // 3. Get the current headers.
            const headers = hot.getColHeader();

            // Check if there is any data left to analyze
            if (cleanData.length === 0) {
                alert("No data found in the spreadsheet to analyze.");
                runButton.disabled = false;
                statusMessage.innerText = "Ready.";
                await shelter.purge();
                return;
            }

            // Create a CSV string from the clean data only.
            let csvContent = Papa.unparse({ fields: headers, data: cleanData });
            
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
