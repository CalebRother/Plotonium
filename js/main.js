import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();

// Embed the paired_comparison() R function directly. This avoids
// runtime issues if fetching the R file fails in some environments.
const PAIRED_COMPARISON_R = `
paired_comparison <- function(data, before_col, after_col,
                              parametric = FALSE,
                              plot_title = NULL, xlab = NULL,
                              ylab = "Value", before_label = NULL,
                              after_label = NULL,
                              show_paired_lines = TRUE,
                              before_color = NULL, after_color = NULL) {
  before_str <- rlang::as_name(rlang::enquo(before_col))
  after_str <- rlang::as_name(rlang::enquo(after_col))
  data$subject_id <- 1:nrow(data)
  data_clean <- data
  data_clean$difference <- data_clean[[after_str]] - data_clean[[before_str]]
  data_subset <- data_clean[, c("subject_id", before_str, after_str, "difference")]
  data_clean <- na.omit(data_subset)
  if (nrow(data_clean) == 0) {
    stop("No complete pairs of data found after removing NAs.")
  }
  set.seed(42)
  data_clean$x_jitter <- runif(nrow(data_clean), min = -0.2, max = 0.2)
  if (parametric) {
    stats_res <- data_clean %>% rstatix::t_test(difference ~ 1, mu = 0)
    test_name <- "Paired t-Test"
  } else {
    stats_res <- data_clean %>% rstatix::wilcox_test(difference ~ 1, mu = 0)
    test_name <- "Wilcoxon Signed-Rank Test"
  }
  data_long <- data_clean %>%
    dplyr::select(-difference) %>%
    tidyr::pivot_longer(
      cols = c(rlang::all_of(before_str), rlang::all_of(after_str)),
      names_to = "time",
      values_to = "value"
    ) %>%
    dplyr::mutate(time = factor(time, levels = c(before_str, after_str)))
  if (!is.null(before_label) && !is.null(after_label)) {
    levels(data_long$time) <- c(before_label, after_label)
  }
  if (is.null(plot_title)) plot_title <- paste("Change from", before_str, "to", after_str)
  if (is.null(xlab)) xlab <- "Time Point"
  p_value_formatted <- rstatix::pvalue(stats_res$p, accuracy = 0.001, add_p = TRUE)
  plot_subtitle <- paste(test_name, ", ", p_value_formatted, sep = "")
  p <- ggplot2::ggplot(data_long, ggplot2::aes(y = value))
  if (show_paired_lines) {
    p <- p + ggplot2::geom_line(
      ggplot2::aes(x = as.numeric(time) + x_jitter, group = subject_id),
      color = "grey70", alpha = 0.5
    )
  }
  p <- p + ggplot2::geom_point(
    ggplot2::aes(x = as.numeric(time) + x_jitter, color = time),
    alpha = 0.8
  )
  p <- p + ggplot2::geom_boxplot(
    ggplot2::aes(x = as.numeric(time), fill = time, group = time),
    alpha = 0.7, outlier.shape = NA
  )
  p <- p +
    ggplot2::theme_minimal() +
    ggplot2::theme(legend.position = "none") +
    ggplot2::scale_x_continuous(breaks = 1:2, labels = levels(data_long$time)) +
    ggplot2::labs(
      title = plot_title,
      subtitle = plot_subtitle,
      x = xlab,
      y = ylab
    )
  if (!is.null(before_color) && !is.null(after_color)) {
    level_names <- levels(data_long$time)
    custom_colors <- c(before_color, after_color)
    names(custom_colors) <- level_names
    p <- p +
      ggplot2::scale_color_manual(values = custom_colors) +
      ggplot2::scale_fill_manual(values = custom_colors)
  }
  print(p)
  message("\nPaired Analysis Results:")
  print(stats_res)
  invisible(list(plot = p, stats_results = stats_res))
}
`;

// Get references to all HTML elements
const fileInput = document.getElementById('csv-file-input');
const loadCsvButton = document.getElementById('load-csv-button');
const addRowButton = document.getElementById('add-row-button');
const addColButton = document.getElementById('add-col-button');
const clearTableButton = document.getElementById('clear-table-button');
const exportCsvButton = document.getElementById('export-csv-button');
const spreadsheetContainer = document.getElementById('spreadsheet-container');
const beforeColSelect = document.getElementById('before-col-select');
const afterColSelect = document.getElementById('after-col-select');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');
const outputsDiv = document.getElementById('outputs');
const plotOutput = document.getElementById('plot-output');
const statsOutput = document.getElementById('stats-output');

// Initialize the Handsontable spreadsheet
const hot = new Handsontable(spreadsheetContainer, {
    data: [['', ''], ['', '']], 
    rowHeaders: true,
    colHeaders: ['Column A', 'Column B'],
    height: 'auto',
    width: 'auto',
    minSpareRows: 1,
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    afterChange: updateColumnSelectors,
    afterLoadData: updateColumnSelectors,
    afterSetDataAtCell: updateColumnSelectors,
    afterCreateRow: updateColumnSelectors,
    afterRemoveRow: updateColumnSelectors,
    afterCreateCol: updateColumnSelectors,
    afterRemoveCol: updateColumnSelectors,
});

function updateColumnSelectors() {
    setTimeout(() => {
        const headers = hot.getColHeader();
        const currentBefore = beforeColSelect.value;
        const currentAfter = afterColSelect.value;
        
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
        
        beforeColSelect.value = currentBefore;
        afterColSelect.value = currentAfter;
    }, 0);
}

function loadCsvData(file) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            const headers = results.meta.fields;
            const tableData = results.data.map(row =>
                headers.map(field => row[field] !== undefined ? row[field] : '')
            );
            hot.updateSettings({
                colHeaders: headers,
                data: tableData,
                columns: headers.map(() => ({})),
            });
        }
    });
}

async function main() {
    try {
        statusMessage.innerText = "Initializing WebR...";
        await webR.init();

        statusMessage.innerText = "Installing R packages...";
        await webR.evalR("webr::install(c('dplyr', 'rlang', 'ggplot2', 'tidyr', 'rstatix', 'scales'))");
        
        statusMessage.innerText = "Loading R functions...";

        // Evaluate the embedded paired_comparison() definition
        await webR.evalR(PAIRED_COMPARISON_R.trim());
        
        statusMessage.innerText = "Ready.";
        runButton.disabled = false;
        updateColumnSelectors();

    } catch (error) {
        console.error("Failed during initialization:", error);
        statusMessage.innerText = "Error during startup. Check console.";
    }

    // Event listeners for spreadsheet controls
    loadCsvButton.addEventListener('click', () => { fileInput.click(); });
    addRowButton.addEventListener('click', () => { hot.alter('insert_row_below'); });
    addColButton.addEventListener('click', () => {
        const numCols = hot.countCols();
        const newHeader = `Column ${String.fromCharCode(65 + numCols)}`;
        hot.alter('insert_col_end', numCols);
        const headers = hot.getColHeader();
        headers[numCols] = newHeader;
        hot.updateSettings({ colHeaders: headers });
        updateColumnSelectors();
    });
    clearTableButton.addEventListener('click', () => {
        hot.loadData([["", ""]]);
        hot.updateSettings({ colHeaders: ["Column A", "Column B"] });
        updateColumnSelectors();
    });
    exportCsvButton.addEventListener('click', () => {
        const data = hot.getData();
        const headers = hot.getColHeader();
        const csv = Papa.unparse({ fields: headers, data: data }, { skipEmptyLines: false });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'data.csv';
        link.click();
    });

    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            loadCsvData(event.target.files[0]);
            fileInput.value = '';
        }
    });

    spreadsheetContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        spreadsheetContainer.classList.add('dragover');
    });
    spreadsheetContainer.addEventListener('dragleave', () => {
        spreadsheetContainer.classList.remove('dragover');
    });
    spreadsheetContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        spreadsheetContainer.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            loadCsvData(e.dataTransfer.files[0]);
        }
    });

    // Run button logic
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
            let csvContent = Papa.unparse({ fields: headers, data: tableData }, { skipEmptyLines: false });
            await webR.FS.writeFile('/tmp/current_data.csv', csvContent);

            const rCommand = `
                data <- read.csv('/tmp/current_data.csv', check.names = FALSE)
                
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
