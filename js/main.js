import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
import * as goldenLayout from 'golden-layout';

document.addEventListener('DOMContentLoaded', async () => {
    let webR;
    let hot; 
    let plotImage, statsOutput, statusMessage, pcRunButton, gcRunButton;

    try {
        const layoutContainer = document.getElementById('layout-container');
        if (!layoutContainer) throw new Error("Fatal Error: #layout-container not found.");
        const layout = new goldenLayout.GoldenLayout(layoutContainer);

        // --- Component Registration ---
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
                startRows: 1000, startCols: 52, rowHeaders: true, colHeaders: true,
                height: '100%', width: '100%', licenseKey: 'non-commercial-and-evaluation', contextMenu: true
            });
             container.on('resize', () => hot.render());
        });

        layout.registerComponentFactoryFunction('controls', (container) => {
            const template = document.getElementById('controls-panel-template');
            container.element.innerHTML = template.innerHTML;
            statusMessage = container.element.querySelector('#status-message');
            pcRunButton = container.element.querySelector('#pc-run-button');
            gcRunButton = container.element.querySelector('#gc-run-button');
            
            initializeEventListeners(container.element);
            main(); 
        });

        // --- Initial Layout Structure ---
        const layoutConfig = {
            root: {
                type: 'column',
                content: [{
                    type: 'row',
                    height: 65,
                    content: [{
                        type: 'component', componentType: 'output', title: 'Output Window'
                    }, {
                        type: 'component', componentType: 'spreadsheet', title: 'Spreadsheet'
                    }]
                }, {
                    type: 'component', componentType: 'controls', title: 'Controls', height: 35
                }]
            }
        };
        layout.loadLayout(layoutConfig);

    } catch (e) {
        document.body.innerHTML = `<div style="padding: 2em; color: red;"><strong>Fatal Error:</strong> ${e.message}</div>`;
        console.error(e);
    }

    // --- Helper & Logic Functions ---
    const getA1Notation = (selection) => `${hot.getColHeader(selection.startCol)}${selection.startRow + 1}:${hot.getColHeader(selection.endCol)}${selection.endRow + 1}`;
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
    
    function initializeEventListeners(controlsContainer) {
        let lastSelection = null;
        hot.updateSettings({
            afterSelectionEnd: (r, c, r2, c2) => { lastSelection = { startRow: Math.min(r, r2), endRow: Math.max(r, r2), startCol: Math.min(c, c2), endCol: Math.max(c, c2) }; }
        });
        
        const loadCsvData = (file) => Papa.parse(file, { header: false, skipEmptyLines: true, complete: (results) => { if (results.data.length > 0) hot.loadData(results.data); } });
        
        document.getElementById('import-csv-menu').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('csv-file-input').click(); });
        document.getElementById('add-row-menu').addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_row_below'); });
        document.getElementById('add-col-menu').addEventListener('click', (e) => { e.preventDefault(); hot.alter('insert_col_end'); });
        document.getElementById('clear-table-menu').addEventListener('click', (e) => { e.preventDefault(); hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000, 52)); });
        document.getElementById('csv-file-input').addEventListener('change', (event) => { if (event.target.files.length > 0) loadCsvData(event.target.files[0]); event.target.value = ''; });

        controlsContainer.querySelector('#analysis-type-select').addEventListener('change', (e) => {
            controlsContainer.querySelectorAll('.analysis-pane').forEach(pane => pane.classList.remove('active'));
            controlsContainer.querySelector(`#${e.target.value}`).classList.add('active');
        });

        controlsContainer.querySelector('#pc-set-before').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#pc-before-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#pc-set-after').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#pc-after-range').value = getA1Notation(lastSelection); });
        pcRunButton.addEventListener('click', () => runPairedAnalysis(controlsContainer));

        controlsContainer.querySelector('#gc-set-response').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-response-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#gc-set-group1').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-group1-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#gc-set-group2').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-group2-range').value = getA1Notation(lastSelection); });
        gcRunButton.addEventListener('click', () => runGroupComparisonAnalysis(controlsContainer));
    }

    async function runPairedAnalysis(controlsContainer) {
        const beforeRangeStr = controlsContainer.querySelector('#pc-before-range').value.trim();
        const afterRangeStr = controlsContainer.querySelector('#pc-after-range').value.trim();
        const isParametric = controlsContainer.querySelector('#pc-parametric').checked;
        if (!beforeRangeStr || !afterRangeStr) { alert("Please set both 'Before' and 'After' ranges."); return; }
        
        pcRunButton.disabled = true;
        await runAnalysis({type: 'paired', beforeRangeStr, afterRangeStr, isParametric});
        pcRunButton.disabled = false;
    }

    async function runGroupComparisonAnalysis(controlsContainer) {
        const responseRangeStr = controlsContainer.querySelector('#gc-response-range').value.trim();
        const group1RangeStr = controlsContainer.querySelector('#gc-group1-range').value.trim();
        const group2RangeStr = controlsContainer.querySelector('#gc-group2-range').value.trim();
        const isParametric = controlsContainer.querySelector('#gc-parametric').checked;
        if (!responseRangeStr || !group1RangeStr) { alert("Please set 'Response' and 'Group 1' ranges."); return; }
        
        gcRunButton.disabled = true;
        await runAnalysis({type: 'group', responseRangeStr, group1RangeStr, group2RangeStr, isParametric});
        gcRunButton.disabled = false;
    }

    async function runAnalysis(params) {
        statusMessage.innerText = "Processing data...";
        plotImage.style.display = 'none';
        statsOutput.innerText = '';

        const shelter = await new webR.Shelter();
        try {
            let rCommand;
            if (params.type === 'paired') {
                const beforeRange = parseA1Range(params.beforeRangeStr);
                const afterRange = parseA1Range(params.afterRangeStr);
                const beforeData = hot.getData(beforeRange.startRow, beforeRange.startCol, beforeRange.endRow, beforeRange.endCol).flat().filter(v => v !== null && v !== '');
                const afterData = hot.getData(afterRange.startRow, afterRange.startCol, afterRange.endRow, afterRange.endCol).flat().filter(v => v !== null && v !== '');
                if (beforeData.length !== afterData.length || beforeData.length === 0) { throw new Error("'Before' and 'After' ranges must have the same number of data points."); }
                
                await shelter.evalR(`data <- data.frame(before_col = c(${beforeData.join(',')}), after_col = c(${afterData.join(',')}))`);
                rCommand = `paired_comparison(data, before_col, after_col, parametric=${params.isParametric ? 'TRUE' : 'FALSE'})`;

            } else if (params.type === 'group') {
                const responseRange = parseA1Range(params.responseRangeStr);
                const group1Range = parseA1Range(params.group1RangeStr);
                const responseData = hot.getData(responseRange.startRow, responseRange.startCol, responseRange.endRow, responseRange.endCol).flat();
                const group1Data = hot.getData(group1Range.startRow, group1Range.startCol, group1Range.endRow, group1Range.endCol).flat();
                
                await shelter.evalR(`response_vals <- c(${responseData.join(',')})`);
                await shelter.evalR(`group1_vals <- jsonlite::fromJSON(${JSON.stringify(JSON.stringify(group1Data))})`);
                
                let dataFrameR = `data <- data.frame(response_col = response_vals, group1_col = as.factor(group1_vals))`;
                
                if (params.group2RangeStr) {
                    const group2Range = parseA1Range(params.group2RangeStr);
                    const group2Data = hot.getData(group2Range.startRow, group2Range.startCol, group2Range.endRow, group2Range.endCol).flat();
                    await shelter.evalR(`group2_vals <- jsonlite::fromJSON(${JSON.stringify(JSON.stringify(group2Data))})`);
                    dataFrameR += `\ndata$group2_col <- as.factor(group2_vals)`;
                    rCommand = `group_comparison(data, response_col, group1_col, group2_col, parametric=${params.isParametric ? 'TRUE' : 'FALSE'})`;
                } else {
                    rCommand = `group_comparison(data, response_col, group1_col, parametric=${params.isParametric ? 'TRUE' : 'FALSE'})`;
                }
                await shelter.evalR(dataFrameR);
            }

            statusMessage.innerText = "Running analysis...";
            const result = await shelter.captureR(rCommand);

            const plotResult = result.images[0];
            if(plotResult) { /* ... same plot resizing logic as before ... */ }
            statsOutput.innerText = result.output.filter(msg => msg.type !== 'stderr').map(msg => msg.data).join('\n').trim();
            statusMessage.innerText = "Analysis complete.";

        } catch (error) {
            console.error("Analysis Error:", error);
            statusMessage.innerText = `Error: ${error.message}`;
        } finally {
            await shelter.purge();
        }
    }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR...";
            webR = new WebR();
            await webR.init();
            
            statusMessage.innerText = "Installing R packages...";
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'rstatix', 'scales', 'ggpubr', 'purrr', 'rcompanion', 'jsonlite'))");
            
            statusMessage.innerText = "Loading R functions...";
            const rScripts = ['paired_comparison.R', 'group_comparisons.R'];
            for (const scriptName of rScripts) {
                const response = await fetch(`r/${scriptName}?v=${new Date().getTime()}`);
                if (!response.ok) throw new Error(`Failed to load ${scriptName}`);
                await webR.evalR((await response.text()).replace(/\r/g, ''));
            }

            statusMessage.innerText = "Ready.";
            if (pcRunButton) pcRunButton.disabled = false;
            if (gcRunButton) gcRunButton.disabled = false;

        } catch (error) {
            console.error("Initialization Error:", error);
            if (statusMessage) {
                statusMessage.innerText = `Error: ${error.message}`;
                statusMessage.style.color = 'red';
            }
        }
    }
});
