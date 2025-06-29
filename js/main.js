import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// Get references to our HTML elements
const fileInput = document.getElementById('csv-file-input');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
const statsOutput = document.getElementById('stats-output');

async function main() {
    // 1. Initialize WebR and load our R function
    statusMessage.innerText = "Initializing WebR (this may take a moment)...";
    await webR.init();
    statusMessage.innerText = "Loading R functions...";
    
    // --- THIS IS THE CORRECTED LINE ---
    // The path is now relative, without the leading slash.
    await webR.evalR("source('r/paired_comparison.R')");
    
    statusMessage.innerText = "Ready to analyze.";
    runButton.disabled = false; // Enable the run button

    // 2. Set up the "Run" button's click event
    runButton.addEventListener('click', async () => {
        if (!fileInput.files.length) {
            alert("Please select a CSV file first.");
            return;
        }

        // Disable button and show loading status
        runButton.disabled = true;
        statusMessage.innerText = "Reading data and running analysis...";
        outputsDiv.style.display = 'none';

        // 3. Make the user's file available to WebR
        const file = fileInput.files[0];
        const fileBuffer = await file.arrayBuffer();
        await webR.FS.writeFile(`/tmp/${file.name}`, new Uint8Array(fileBuffer));

        // 4. Construct and execute the R command
        const rCommand = `
            data <- read.csv('/tmp/${file.name}')
            
            paired_comparison(
                data = data,
                before_col = biomarker_baseline,
                after_col = biomarker_followup,
                parametric = FALSE
            )
        `;
        
        const result = await webR.captureR(rCommand);

        try {
            // 5. Process and display the results
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
                .join('\n');
            
            statsOutput.innerText = textOutput;
            outputsDiv.style.display = 'block';

        } finally {
            // 6. Clean up and re-enable the UI
            result.destroy();
            statusMessage.innerText = "Analysis complete. Ready for next run.";
            runButton.disabled = false;
        }
    });
}

main();
