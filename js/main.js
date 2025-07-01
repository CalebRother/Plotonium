import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
import * as goldenLayout from 'golden-layout'; 

document.addEventListener('DOMContentLoaded', async () => {

    const webR = new WebR();
    let hot; // Handsontable instance
    let plotImage, statsOutput, statusMessage, runButton; // UI elements

    // --- 1. Golden Layout Configuration ---
    const layoutContainer = document.getElementById('layout-container');
    const layout = new goldenLayout.GoldenLayout(layoutContainer);

    // -- Component Registration --
    layout.registerComponentFactoryFunction('output', (container) => {
        const template = document.getElementById('output-panel-template');
        container.element.innerHTML = template.innerHTML;
        plotImage = container.element.querySelector('#plot-image');
        statsOutput = container.element.querySelector('#stats-output');
    });

    layout.registerComponentFactoryFunction('spreadsheet', (container) => {
        const template = document.getElementById('spreadsheet-panel-template');
        container.element.innerHTML = template.innerHTML;
        const spreadsheetContainer = container.element.querySelector('#spreadsheet-container');
        hot = new Handsontable(spreadsheetContainer, {
            startRows: 1000,
            startCols: 52,
            rowHeaders: true,
            colHeaders: true,
            height: '100%',
            width: '100%',
            licenseKey: 'non-commercial-and-evaluation',
            contextMenu: true
        });

        // FIX: Listen for resize events to make the spreadsheet redraw itself
        container.on('resize', () => {
            hot.render();
        });
    });

    layout.registerComponentFactoryFunction('controls', (container) => {
        const template = document.getElementById('controls-panel-template');
        container.element.innerHTML = template.innerHTML;
        statusMessage = container.element.querySelector('#status-message');
        runButton = container.element.querySelector('#run-button');
        
        initializeEventListeners(container.element);
        main(); 
    });

    // -- Initial Layout Structure --
    const layoutConfig = {
        root: {
            type: 'column',
            content: [{
                type: 'row',
                height: 65, // ADJUSTED: Gave less height to the top row
                content: [{
                    type: 'component',
                    componentType: 'output',
                    title: 'Output Window'
                }, {
                    type: 'component',
                    componentType: 'spreadsheet',
                    title: 'Spreadsheet'
                }]
            }, {
                type: 'component',
                componentType: 'controls',
                title: 'Controls',
                height: 35 // ADJUSTED: Gave more height to the controls panel
            }]
        }
    };

    layout.loadLayout(layoutConfig);

    // --- 2. Application Logic ---
    function initializeEventListeners(controlsContainer) {
        let lastSelection = null;
        
        hot.updateSettings({
            afterSelectionEnd: (r, c, r2, c2) => {
                lastSelection = { startRow: Math.min(r, r2), endRow: Math.max(r, r2), startCol: Math.min(c, c2), endCol: Math.max(c, c2) };
            }
        });

        const getA1Notation = (selection) => `${hot.getColHeader(selection.startCol)}${selection.startRow + 1}:${hot.getColHeader(selection.endCol)}${selection.endRow + 1}`;
        const loadCsvData = (file) => Papa.parse(file, { header: false, skipEmptyLines: true, complete: (results) => { if (results.data.length > 0) hot.loadData(results.data); } });
        
        document.getElementById('import-csv-menu').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('csv-file-input').click(); });
        document.getElementById('add-row-menu').addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
        document.getElementById('add-col-menu').addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
        document.getElementById('clear-table-menu').addEventListener('click', (e) => { e.preventDefault(); hot.clear(); hot.updateSettings({ startRows: 1000, startCols: 52 }); });
        document.getElementById('csv-file-input').addEventListener('change', (event) => { if (event.target.files.length > 0) loadCsvData(event.target.files[0]); event.target.value = ''; });

        controlsContainer.querySelector('#set-before-button').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#before-range-input').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#set-after-button').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#after-range-input').value = getA1Notation(lastSelection); });
        runButton.addEventListener('click', () => runAnalysis(controlsContainer));
    }

    async function runAnalysis(controlsContainer) {
        const beforeRangeStr = controlsContainer.querySelector('#before-range-input').value.trim();
        const afterRangeStr = controlsContainer.querySelector('#after-range-input').value.trim();
        const isParametric = controlsContainer.querySelector('#parametric-checkbox').checked;

        if (!beforeRangeStr || !afterRangeStr) {
            alert("Please set both 'Before' and 'After' ranges.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Processing data...";
        plotImage.style.display = 'none';

        const parseA1Range = (rangeStr) => {
            try {
                const colToIdx = (col) => col.split('').reduce((acc, val) => acc * 26 + val.charCodeAt(0) - 64, 0) - 1;
                const [start, end] = rangeStr.toUpperCase().split(':');
                const startMatch = start.match(/^([A-Z]+)(\d+)$/);
                if (!startMatch) return null;
                const startCol = colToIdx(startMatch[1]);
                const startRow = parseInt(startMatch[2], 10) - 1;
                if (!end) return { startRow, startCol, endRow: startRow, endCol: startCol };
                const endMatch = end.match(/^([A-Z]+)(\d+)$/);
                if (!endMatch) return null;
                const endCol = colToIdx(endMatch[1]);
                const endRow = parseInt(endMatch[2], 10) - 1;
                return { startRow: Math.min(startRow, endRow), startCol: Math.min(startCol, endCol), endRow: Math.max(startRow, endRow), endCol: Math.max(startCol, endCol) };
            } catch (e) { return null; }
        };

        const beforeRange = parseA1Range(beforeRangeStr);
        const afterRange = parseA1Range(afterRangeStr);

        if (!beforeRange || !afterRange) {
            alert("Error: Invalid range format.");
            runButton.disabled = false;
            return;
        }

        const beforeData = hot.getData(beforeRange.startRow, beforeRange.startCol, beforeRange.endRow, beforeRange.endCol).flat().filter(v => v !== null && v !== '');
        const afterData = hot.getData(afterRange.startRow, afterRange.startCol, afterRange.endRow, afterRange.endCol).flat().filter(v => v !== null && v !== '');

        if (beforeData.length !== afterData.length || beforeData.length === 0) {
            alert("Error: 'Before' and 'After' ranges must contain the same number of non-empty cells.");
            runButton.disabled = false;
            return;
        }

        statusMessage.innerText = "Running analysis...";
        const shelter = await new webR.Shelter();
        try {
            const rCommand = `
                before_vals <- c(${beforeData.join(',')})
                after_vals <- c(${afterData.join(',')})
                data <- data.frame(before_col = before_vals, after_col = after_vals)
                
                paired_comparison(data=data, before_col=before_col, after_col=after_col, parametric=${isParametric ? 'TRUE' : 'FALSE'})
            `;
            const result = await shelter.captureR(rCommand);

            const plotResult = result.images[0];
            if(plotResult) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = plotResult.width;
                tempCanvas.height = plotResult.height;
                tempCanvas.getContext('2d').drawImage(plotResult, 0, 0);
                plotImage.src = tempCanvas.toDataURL();
                plotImage.style.display = 'block';
            }

            statsOutput.innerText = result.output.filter(msg => msg.type !== 'stderr').map(msg => msg.data).join('\n').trim();
            statusMessage.innerText = "Analysis complete.";
        } catch (error) {
            console.error("Failed during analysis:", error);
            statusMessage.innerText = "An error occurred. Check console.";
        } finally {
            await shelter.purge();
            runButton.disabled = false;
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
            const rScriptText = (await response.text()).replace(/\r/g, '');
            await webR.evalR(rScriptText);
            statusMessage.innerText = "Ready.";
            runButton.disabled = false;
        } catch (error) {
            console.error("Failed during initialization:", error);
            statusMessage.innerText = "Error during startup. Check console.";
        }
    }
});
