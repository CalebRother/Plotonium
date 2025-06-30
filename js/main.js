import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// Get references to all HTML elements
const fileInput = document.getElementById('csv-file-input');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
// --- FIX: Get the new canvas element instead of the old plot div ---
const plotCanvas = document.getElementById('plot-canvas');
const statsOutput = document.getElementById('stats-output');
const beforeRangeDisplay = document.getElementById('before-range-display');
const afterRangeDisplay = document.getElementById('after-range-display');
// ... other element references remain the same ...

let selections = [];

// --- Initialize Handsontable ---
// ... This section remains the same ...

// --- Helper functions ---
// ... updateRangeDisplays(), getA1Notation(), loadCsvData() remain the same ...

async function main() {
    // ... This section remains the same ...
}

// --- Run button logic ---
runButton.addEventListener('click', async () => {
    if (selections.length < 2) {
        alert("Please select two data ranges in the spreadsheet.");
        return;
    }

    runButton.disabled = true;
    statusMessage.innerText = "Processing data...";
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
        
        statusMessage.innerText = "Running analysis...";
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
        
        // --- THIS IS THE FIX ---
        try {
            const plots = result.images;
            if (plots.length > 0) {
                const plot = plots[0]; // This is an ImageBitmap object
                // Get the 2D drawing context of our canvas
                const ctx = plotCanvas.getContext('2d');
                // Set the canvas size to match the plot image
                plotCanvas.width = plot.width;
                plotCanvas.height = plot.height;
                // Draw the plot image onto the canvas
                ctx.drawImage(plot, 0, 0);
            }
            const textOutput = result.messages
                .filter(msg => msg.type === 'stdout' || msg.type === 'stderr')
                .map(msg => msg.data)
                .join('\\n');
            statsOutput.innerText = textOutput;
            outputsDiv.style.display = 'block';
        } finally {
            // There is no result.destroy(), so this block is now empty
            // The shelter.purge() in the outer finally block handles all cleanup.
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

// NOTE: I have omitted the unchanged parts of the file for brevity. 
// You should only need to update the sections I've marked as changed.
// Make sure to re-include the functions and event listeners that were omitted.
