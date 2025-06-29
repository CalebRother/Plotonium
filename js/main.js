import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// --- Get references to all HTML elements ---
const fileInput = document.getElementById('csv-file-input');
const loadCsvButton = document.getElementById('load-csv-button');
const addRowButton = document.getElementById('add-row-button');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const beforeColSelect = document.getElementById('before-col-select');
const afterColSelect = document.getElementById('after-col-select');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
const statsOutput = document.getElementById('stats-output');

// --- Initialize the Handsontable spreadsheet ---
const hot = new Handsontable(spreadsheetContainer, {
    data: [['', ''], ['', '']], // Start with a small empty grid
    rowHeaders: true,
    colHeaders: ['Column A', 'Column B'], // Default headers
    height: 'auto',
    width: 'auto',
    minSpareRows: 1, // Always have a blank row at the bottom
    licenseKey: 'non-commercial-and-evaluation', // Required for free use
    contextMenu: true, // Enable right-click menu (add/remove rows/cols)
    afterChange: updateColumnSelectors,
    afterLoadData: updateColumnSelectors,
    afterSetDataAtCell: updateColumnSelectors,
    afterCreateRow: updateColumnSelectors,
    afterRemoveRow: updateColumnSelectors,
    afterCreateCol: updateColumnSelectors,
    afterRemoveCol: updateColumnSelectors,
});

function updateColumnSelectors() {
    // Timeout gives Handsontable a moment to update its internal state
    setTimeout(() => {
        const headers = hot.getColHeader();

        const currentBefore = beforeColSelect.value;
        const currentAfter = afterColSelect.value;

        // Clear previous options
        beforeColSelect.innerHTML = '';
        afterColSelect.innerHTML = '';
        
        const defaultOption = document.createElement('option');
        defaultOption.textContent = '-- Select a column --';
        defaultOption.value = '';
        beforeColSelect.appendChild(defaultOption);
        afterColSelect.appendChild(defaultOption.cloneNode(true));

        headers.forEach(header => {
            if (header) { 
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                beforeColSelect.appendChild(option);
                afterColSelect.appendChild(option.cloneNode(true));
            }
        });
        
        // Try to preserve previous selections if they still exist
        beforeColSelect.value = currentBefore;
        afterColSelect.value = currentAfter;

    }, 0);
}

async function main() {
    try {
        statusMessage.innerText = "Initializing WebR...";
        await webR.init();

        statusMessage.innerText = "Installing R packages...";
        await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales'))");
        
        // --- THIS IS THE CLEAN, CORRECTED METHOD YOU SUGGESTED ---
        statusMessage.innerText = "Loading R functions from file...";
        await webR.evalR("source('r/paired_comparison.R')");
        
        statusMessage.innerText = "Ready.";
        runButton.disabled = false;
        updateColumnSelectors(); // Initial population of dropdowns

    } catch (error) {
        console.error("Failed during initialization:", error);
        statusMessage.innerText = "Error during startup. Check console.";
    }

    // --- Event listeners for spreadsheet controls ---
    loadCsvButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            Papa.parse(event.target.files[0], {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    // Create a dataset for Handsontable, ensuring all rows have all fields
                    const headers = results.meta.fields;
                    const tableData = results.data.map(row => {
                        return headers.map(field => row[field] !== undefined ? row[field] : '');
                    });

                    hot.updateSettings({
                        colHeaders: headers,
                        data: tableData,
                        columns: headers.map(() => ({})), // Ensure columns are responsive
                    });
                }
            });
            fileInput.value = '';
        }
    });
    
    addRowButton.addEventListener('click', () => {
        hot.alter('insert_row_below');
    });

    // --- Run button logic ---
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
            let csvContent = Papa.unparse({
                fields: headers,
                data: tableData
            }, {
                // Do not skip empty rows when creating the CSV string
                skipEmptyLines: false 
            });

            await webR.FS.writeFile('/tmp/current_data.csv', csvContent);

            const rCommand = `
                # Use backticks for column names to handle spaces or special characters
                data <- read.csv('/tmp/current_data.csv', check.names = FALSE)
                
                # The R function needs the unquoted names, which we provide here
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
