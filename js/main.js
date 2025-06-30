import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

document.addEventListener('DOMContentLoaded', () => {
    
    const webR = new WebR();

    // Get references to all HTML elements
    const fileInput              = document.getElementById('csv-file-input');
    const spreadsheetContainer   = document.getElementById('spreadsheet-container');
    const runButton              = document.getElementById('run-button');
    const statusMessage          = document.getElementById('status-message');
    const outputsDiv             = document.getElementById('outputs');
    const plotCanvas             = document.getElementById('plot-canvas');
    const statsOutput            = document.getElementById('stats-output');
    const beforeRangeDisplay     = document.getElementById('before-range-display');
    const afterRangeDisplay      = document.getElementById('after-range-display');
    const importCsvMenu          = document.getElementById('import-csv-menu');
    const exportCsvMenu          = document.getElementById('export-csv-menu');
    const addRowMenu             = document.getElementById('add-row-menu');
    const addColMenu             = document.getElementById('add-col-menu');
    const clearTableMenu         = document.getElementById('clear-table-menu');

    let selections = [];

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
            const sel = {
                startRow: Math.min(r, r2),
                endRow:   Math.max(r, r2),
                startCol: Math.min(c, c2),
                endCol:   Math.max(c, c2),
            };
            selections.push(sel);
            if (selections.length > 2) selections.shift();
            updateRangeDisplays();
        }
    });

    function updateRangeDisplays() {
        if (selections.length === 0) {
            beforeRangeDisplay.textContent = 'None';
            afterRangeDisplay.textContent  = 'None';
        } else if (selections.length === 1) {
            beforeRangeDisplay.textContent = getA1Notation(selections[0]);
            afterRangeDisplay.textContent  = 'None';
        } else {
            beforeRangeDisplay.textContent = getA1Notation(selections[0]);
            afterRangeDisplay.textContent  = getA1Notation(selections[1]);
        }
    }

    function getA1Notation({startRow, endRow, startCol, endCol}) {
        const startColName = hot.getColHeader(startCol);
        const endColName   = hot.getColHeader(endCol);
        return `${startColName}${startRow+1}:${endColName}${endRow+1}`;
    }

    function loadCsvData(file) {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                if (!results.data.length) return;
                hot.populateFromArray(0, 0, results.data);
            }
        });
    }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR…";
            await webR.init();
            statusMessage.innerText = "Installing R packages…";
            await webR.evalR(`webr::install(c('dplyr','rlang','ggplot2','tidyr','rstatix','scales','ggpubr'))`);

            statusMessage.innerText = "Loading R function…";
            const resp = await fetch(`r/paired_comparison.R?v=${Date.now()}`);
            if (!resp.ok) throw new Error(`Fetch R script failed: ${resp.status}`);
            let rText = await resp.text();
            rText = rText.replace(/\r/g, '');
            await webR.evalR(rText);

            statusMessage.innerText = "Ready.";
            runButton.disabled = false;
        } catch (err) {
            console.error("Startup error:", err);
            statusMessage.innerText = "Error on load. See console.";
        }
    }

    importCsvMenu.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
    addRowMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_row_below'); });
    addColMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_col_end'); });
    clearTableMenu.addEventListener('click', e => {
        e.preventDefault();
        hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000,52));
        selections = []; updateRangeDisplays();
    });
    exportCsvMenu.addEventListener('click', e => { /* your CSV export logic */ });
    fileInput.addEventListener('change',    e => { if(e.target.files.length) loadCsvData(e.target.files[0]); });

    runButton.addEventListener('click', async () => {
        if (selections.length < 2) {
            alert("Select two ranges (before then after).");
            return;
        }

        runButton.disabled  = true;
        statusMessage.innerText = "Processing…";
        outputsDiv.style.display = 'none';

        const shelter = await new webR.Shelter();
        try {
            // **flip** so first selection = before, second = after
            const beforeSel = selections[0];
            const afterSel  = selections[1];

            const beforeData = hot.getData(
                beforeSel.startRow, beforeSel.startCol,
                beforeSel.endRow,   beforeSel.endCol
            ).flat().filter(v => v !== null && v !== '');

            const afterData = hot.getData(
                afterSel.startRow, afterSel.startCol,
                afterSel.endRow,   afterSel.endCol
            ).flat().filter(v => v !== null && v !== '');

            if (beforeData.length !== afterData.length || !beforeData.length) {
                alert("Error: Before/After must have the same number of non-empty values.");
                return;
            }

            statusMessage.innerText = "Running analysis…";
            const rCmd = `
                before_vals <- c(${beforeData.join(',')})
                after_vals  <- c(${afterData.join(',')})
                data        <- data.frame(before_col = before_vals, after_col = after_vals)
                paired_comparison(data, before_col, after_col)
            `;

            const result = await shelter.captureR(rCmd);

            // draw the plot
            if (result.images.length) {
                const img = result.images[0];
                const ctx = plotCanvas.getContext('2d');
                plotCanvas.width  = img.width;
                plotCanvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            }

            // include R message() output as well as stdout/stderr
            const textOutput = result.output
                .filter(m => ['stdout','stderr','message'].includes(m.type))
                .map(m => m.data)
                .join('\n')
                .trim();

            statsOutput.innerText = textOutput;
            outputsDiv.style.display = 'block';

        } catch (err) {
            console.error("Analysis error:", err);
            alert("Analysis failed—see console.");            
        } finally {
            await shelter.purge();
            runButton.disabled = false;
            statusMessage.innerText = "Ready.";
        }
    });

    main();
});
