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
    statusMessage.innerText = "Initializing WebR (this may take a moment)...";
    await webR.init();

    // --- THIS IS THE NEW, CRITICAL STEP ---
    // Install all the R packages that our script depends on.
    // This might take a moment the first time a user visits.
    statusMessage.innerText = "Installing R packages...";
    await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales'))");
    
    // Now that packages are installed, we can source our script.
    statusMessage.innerText = "Loading R functions...";
    await webR.evalR("source('r/paired_comparison.R')");
    
    statusMessage.innerText = "Ready to analyze.";
    runButton.disabled = false; // Enable the run button

    // Set up the "Run" button's click event
    runButton.addEventListener('click', async () => {
        if (!fileInput.files.length) {
            alert("Please select a CSV file first.");
            return;
        }

        runButton.disabled = true;
        statusMessage.innerText = "Reading data and running analysis...";
        outputsDiv.style.display = 'none';

        const file = fileInput.files[0];
        const fileBuffer = await file.arrayBuffer();
        await webR.FS.writeFile(`/tmp/${file.name}`, new Uint8Array(fileBuffer));

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
            result.destroy();
            statusMessage.innerText = "Analysis complete. Ready for next run.";
            runButton.disabled = false;
        }
    });
}

main();
