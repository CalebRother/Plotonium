import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
import * as goldenLayout from 'golden-layout';

document.addEventListener('DOMContentLoaded', async () => {

    const webR = new WebR();
    let hot; 
    let plotImage, statsOutput, statusMessage, pcRunButton, gcRunButton;

    // --- 1. Golden Layout Configuration ---
    const layoutContainer = document.getElementById('layout-container');
    const layout = new goldenLayout.GoldenLayout(layoutContainer);

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

    const layoutConfig = { /* same as before */ };
    layout.loadLayout(layoutConfig);

    // --- 2. Application Logic ---
    function initializeEventListeners(controlsContainer) {
        let lastSelection = null;
        hot.updateSettings({
            afterSelectionEnd: (r, c, r2, c2) => { lastSelection = { startRow: Math.min(r, r2), endRow: Math.max(r, r2), startCol: Math.min(c, c2), endCol: Math.max(c, c2) }; }
        });

        const getA1Notation = (selection) => `${hot.getColHeader(selection.startCol)}${selection.startRow + 1}:${hot.getColHeader(selection.endCol)}${selection.endRow + 1}`;
        
        // Tab switching logic
        controlsContainer.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                controlsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                controlsContainer.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                controlsContainer.querySelector(`#${button.dataset.tab}`).classList.add('active');
            });
        });

        // Paired Comparison Listeners
        controlsContainer.querySelector('#pc-set-before').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#pc-before-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#pc-set-after').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#pc-after-range').value = getA1Notation(lastSelection); });
        pcRunButton.addEventListener('click', () => runPairedAnalysis(controlsContainer));

        // Group Comparison Listeners
        controlsContainer.querySelector('#gc-set-response').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-response-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#gc-set-group1').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-group1-range').value = getA1Notation(lastSelection); });
        controlsContainer.querySelector('#gc-set-group2').addEventListener('click', () => { if(lastSelection) controlsContainer.querySelector('#gc-group2-range').value = getA1Notation(lastSelection); });
        gcRunButton.addEventListener('click', () => runGroupComparisonAnalysis(controlsContainer));
    }

    const parseA1Range = (rangeStr) => { /* same as before */ };

    async function runPairedAnalysis(controlsContainer) { /* same as before, just rename variables to be specific */ }
    
    async function runGroupComparisonAnalysis(controlsContainer) {
        const responseRangeStr = controlsContainer.querySelector('#gc-response-range').value.trim();
        const group1RangeStr = controlsContainer.querySelector('#gc-group1-range').value.trim();
        const group2RangeStr = controlsContainer.querySelector('#gc-group2-range').value.trim();
        const isParametric = controlsContainer.querySelector('#gc-parametric').checked;

        if (!responseRangeStr || !group1RangeStr) {
            alert("Please set at least the 'Response' and 'Group 1' ranges.");
            return;
        }

        gcRunButton.disabled = true;
        statusMessage.innerText = "Processing data...";
        plotImage.style.display = 'none';

        const responseRange = parseA1Range(responseRangeStr);
        const group1Range = parseA1Range(group1RangeStr);
        const hasGroup2 = group2RangeStr !== '';
        const group2Range = hasGroup2 ? parseA1Range(group2RangeStr) : null;
        
        // Simplified data extraction
        const responseData = hot.getData(responseRange.startRow, responseRange.startCol, responseRange.endRow, responseRange.endCol).flat();
        const group1Data = hot.getData(group1Range.startRow, group1Range.startCol, group1Range.endRow, group1Range.endCol).flat();
        const group2Data = hasGroup2 ? hot.getData(group2Range.startRow, group2Range.startCol, group2Range.endRow, group2Range.endCol).flat() : null;

        // Create data frame in R
        const shelter = await new webR.Shelter();
        try {
            await shelter.evalR(`response_vals <- c(${responseData.join(',')})`);
            await shelter.evalR(`group1_vals <- c(${JSON.stringify(group1Data).slice(1,-1)})`);
            
            let dataFrameR = `data <- data.frame(response_col = response_vals, group1_col = as.factor(group1_vals))`;
            let rCommand;

            if (hasGroup2) {
                await shelter.evalR(`group2_vals <- c(${JSON.stringify(group2Data).slice(1,-1)})`);
                dataFrameR += `\ndata$group2_col <- as.factor(group2_vals)`;
                rCommand = `group_comparison(data, response_col, group1_col, group2_col, parametric=${isParametric ? 'TRUE' : 'FALSE'})`;
            } else {
                rCommand = `group_comparison(data, response_col, group1_col, parametric=${isParametric ? 'TRUE' : 'FALSE'})`;
            }
            
            await shelter.evalR(dataFrameR);

            statusMessage.innerText = "Running analysis...";
            const result = await shelter.captureR(rCommand);

            // Handle output (same logic as before)
            const plotResult = result.images[0];
            if(plotResult) { /* ... plotting logic ... */ }
            statsOutput.innerText = result.output.filter(msg => msg.type !== 'stderr').map(msg => msg.data).join('\n').trim();
            statusMessage.innerText = "Analysis complete.";
        } catch (error) {
            console.error("Failed during analysis:", error);
            statusMessage.innerText = "An error occurred. Check console.";
        } finally {
            await shelter.purge();
            gcRunButton.disabled = false;
        }
    }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR...";
            await webR.init();
            statusMessage.innerText = "Installing R packages...";
            // ADDED purrr and rcompanion
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'rstatix', 'scales', 'ggpubr', 'purrr', 'rcompanion'))");
            
            statusMessage.innerText = "Loading R functions...";
            // Assumes both R files are in an 'r' folder
            const pc_script = await (await fetch(`r/paired_comparison.R?v=${Date.now()}`)).text();
            const gc_script = await (await fetch(`r/group_comparisons.R?v=${Date.now()}`)).text();
            await webR.evalR(pc_script.replace(/\r/g, ''));
            await webR.evalR(gc_script.replace(/\r/g, ''));

            statusMessage.innerText = "Ready.";
            pcRunButton.disabled = false;
            gcRunButton.disabled = false;
        } catch (error) {
            console.error("Failed during initialization:", error);
            statusMessage.innerText = "Error during startup. Check console.";
        }
    }
});
