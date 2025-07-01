import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
import * as goldenLayout from 'golden-layout';

document.addEventListener('DOMContentLoaded', async () => {

    let webR = new WebR();
    let hot; 
    let plotImage, statsOutput, statusMessage, pcRunButton, gcRunButton;

    const layoutContainer = document.getElementById('layout-container');
    const layout = new goldenLayout.GoldenLayout(layoutContainer);

    // --- Component Registration ---
    layout.registerComponentFactoryFunction('output', (container) => { /* same as before */ });
    layout.registerComponentFactoryFunction('spreadsheet', (container) => { /* same as before */ });
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

    // --- Application Logic ---
    function initializeEventListeners(controlsContainer) {
        let lastSelection = null;
        hot.updateSettings({
            afterSelectionEnd: (r, c, r2, c2) => { lastSelection = { startRow: Math.min(r, r2), endRow: Math.max(r, r2), startCol: Math.min(c, c2), endCol: Math.max(c, c2) }; }
        });

        const getA1Notation = (selection) => `${hot.getColHeader(selection.startCol)}${selection.startRow + 1}:${hot.getColHeader(selection.endCol)}${selection.endRow + 1}`;
        
        // Dropdown menu logic
        const analysisSelect = controlsContainer.querySelector('#analysis-type-select');
        analysisSelect.addEventListener('change', (e) => {
            controlsContainer.querySelectorAll('.analysis-pane').forEach(pane => pane.classList.remove('active'));
            controlsContainer.querySelector(`#${e.target.value}`).classList.add('active');
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

        // File Menu Listeners (you might want to abstract these out later)
        document.getElementById('import-csv-menu').addEventListener('click', (e) => { /* ... */ });
    }

    const parseA1Range = (rangeStr) => { /* same as before */ };
    async function runPairedAnalysis(controlsContainer) { /* same as before */ }
    async function runGroupComparisonAnalysis(controlsContainer) { /* same as before */ }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR...";
            await webR.init();
            statusMessage.innerText = "Installing R packages...";
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'rstatix', 'scales', 'ggpubr', 'purrr', 'rcompanion'))");
            
            statusMessage.innerText = "Loading R functions...";
            const pc_script_res = await fetch(`r/paired_comparison.R`);
            if (!pc_script_res.ok) throw new Error(`Failed to load paired_comparison.R: ${pc_script_res.statusText}`);
            await webR.evalR((await pc_script_res.text()).replace(/\r/g, ''));

            const gc_script_res = await fetch(`r/group_comparisons.R`);
            if (!gc_script_res.ok) throw new Error(`Failed to load group_comparisons.R: ${gc_script_res.statusText}`);
            await webR.evalR((await gc_script_res.text()).replace(/\r/g, ''));

            statusMessage.innerText = "Ready.";
            pcRunButton.disabled = false;
            gcRunButton.disabled = false;
        } catch (error) {
            console.error("Initialization Error:", error);
            statusMessage.innerText = `Error: ${error.message}`;
            statusMessage.style.color = 'red';
        }
    }
});
