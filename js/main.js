import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
import * as goldenLayout from 'golden-layout';

document.addEventListener('DOMContentLoaded', async () => {
    // Declaring these in a higher scope
    let hot, statusMessage, pcRunButton, gcRunButton;

    try {
        const layoutContainer = document.getElementById('layout-container');
        if (!layoutContainer) throw new Error("Fatal Error: #layout-container not found.");
        const layout = new goldenLayout.GoldenLayout(layoutContainer);

        // --- Component Registration ---
        // (output and spreadsheet registration are unchanged)
        layout.registerComponentFactoryFunction('output', (container) => {
            const template = document.getElementById('output-panel-template');
            container.element.innerHTML = template.innerHTML;
        });
        layout.registerComponentFactoryFunction('spreadsheet', (container) => {
             const template = document.getElementById('spreadsheet-panel-template');
             container.element.innerHTML = template.innerHTML;
             const spreadsheetContainer = container.element.querySelector('#spreadsheet-container');
             hot = new Handsontable(spreadsheetContainer, { /* ... hot config ... */ });
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

        // Load the layout
        const layoutConfig = { /* ... layout config ... */ };
        layout.loadLayout(layoutConfig);

    } catch (e) {
        document.body.innerHTML = `<div style="padding: 2em; color: red;"><strong>Fatal Error:</strong> ${e.message}</div>`;
        console.error(e);
    }

    // --- Application Logic ---
    function initializeEventListeners(controlsContainer) {
        // Dropdown menu logic
        const analysisSelect = controlsContainer.querySelector('#analysis-type-select');
        analysisSelect.addEventListener('change', (e) => {
            controlsContainer.querySelectorAll('.analysis-pane').forEach(pane => pane.classList.remove('active'));
            const selectedPane = controlsContainer.querySelector(`#${e.target.value}`);
            if (selectedPane) selectedPane.classList.add('active');
        });
        // ... other event listeners
    }

    async function main() {
        try {
            statusMessage.innerText = "Initializing WebR...";
            let webR = new WebR();
            await webR.init();
            
            statusMessage.innerText = "Installing R packages...";
            await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'rstatix', 'scales', 'ggpubr', 'purrr', 'rcompanion'))");
            
            statusMessage.innerText = "Loading R functions...";
            const rScripts = ['paired_comparison.R', 'group_comparisons.R'];
            for (const scriptName of rScripts) {
                // ADDED a cache-busting parameter to the fetch URL
                const response = await fetch(`r/${scriptName}?v=${new Date().getTime()}`);
                if (!response.ok) {
                    throw new Error(`Failed to load ${scriptName} (${response.status} ${response.statusText}). Please ensure the file exists in the 'r' folder.`);
                }
                const scriptText = await response.text();
                await webR.evalR(scriptText.replace(/\r/g, ''));
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
