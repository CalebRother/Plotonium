import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const webR = new WebR();

  // UI elements
  const fileInput            = document.getElementById('csv-file-input');
  const hotContainer         = document.getElementById('spreadsheet-container');
  const runButton            = document.getElementById('run-button');
  const statusMessage        = document.getElementById('status-message');
  const outputsDiv           = document.getElementById('outputs');
  const plotCanvas           = document.getElementById('plot-canvas');
  const statsOutput          = document.getElementById('stats-output');
  const beforeRangeDisplay   = document.getElementById('before-range-display');
  const afterRangeDisplay    = document.getElementById('after-range-display');
  const importCsvMenu        = document.getElementById('import-csv-menu');
  const exportCsvMenu        = document.getElementById('export-csv-menu');
  const addRowMenu           = document.getElementById('add-row-menu');
  const addColMenu           = document.getElementById('add-col-menu');
  const clearTableMenu       = document.getElementById('clear-table-menu');
  const parametricCheckbox   = document.getElementById('parametric-checkbox');

  let selections = [];
  const hot = new Handsontable(hotContainer, {
    startRows: 1000,
    startCols: 52,
    rowHeaders: true,
    colHeaders: true,
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    afterSelectionEnd: (r, c, r2, c2) => {
      selections.push({
        startRow: Math.min(r, r2),
        endRow:   Math.max(r, r2),
        startCol: Math.min(c, c2),
        endCol:   Math.max(c, c2),
      });
      if (selections.length > 2) selections.shift();
      updateRangeDisplays();
    }
  });

  function updateRangeDisplays() {
    if (selections.length === 0) {
      beforeRangeDisplay.textContent = 'None';
      afterRangeDisplay.textContent  = 'None';
    } else if (selections.length === 1) {
      beforeRangeDisplay.textContent = toA1(selections[0]);
      afterRangeDisplay.textContent  = 'None';
    } else {
      beforeRangeDisplay.textContent = toA1(selections[0]);
      afterRangeDisplay.textContent  = toA1(selections[1]);
    }
  }

  function toA1({startRow, endRow, startCol, endCol}) {
    const a = hot.getColHeader(startCol) + (startRow+1);
    const b = hot.getColHeader(endCol)   + (endRow+1);
    return `${a}:${b}`;
  }

  function loadCsv(file) {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: res => {
        if (!res.data.length) return;
        hot.populateFromArray(0, 0, res.data);
      }
    });
  }

  async function initWebR() {
    statusMessage.innerText = 'Initializing WebR…';
    await webR.init();
    statusMessage.innerText = 'Installing R packages…';
    await webR.evalR(`webr::install(c('dplyr','rlang','ggplot2','tidyr','rstatix','scales','ggpubr'))`);
    statusMessage.innerText = 'Loading paired_comparison.R…';
    const rsp = await fetch(`r/paired_comparison.R?v=${Date.now()}`);
    const txt = await rsp.text();
    await webR.evalR(txt.replace(/\r/g,''));
    statusMessage.innerText = 'Ready.';
    runButton.disabled = false;
  }

  importCsvMenu.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
  addRowMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_row_below'); });
  addColMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_col_end'); });
  clearTableMenu.addEventListener('click', e => {
    e.preventDefault();
    hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000,52));
    selections = []; updateRangeDisplays();
  });
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadCsv(e.target.files[0]); });
  exportCsvMenu.addEventListener('click', e => { /* your export logic */ });

  runButton.addEventListener('click', async () => {
    if (selections.length < 2) {
      alert('Please select two ranges (before then after).');
      return;
    }

    runButton.disabled    = true;
    outputsDiv.style.display = 'none';
    statusMessage.innerText  = 'Running analysis…';

    const shelter = await new webR.Shelter();
    try {
      // pull data out
      const [beforeSel, afterSel] = selections;
      const beforeVals = hot.getData(
        beforeSel.startRow, beforeSel.startCol,
        beforeSel.endRow,   beforeSel.endCol
      ).flat().filter(v=>v!==''); 
      const afterVals  = hot.getData(
        afterSel.startRow, afterSel.startCol,
        afterSel.endRow,   afterSel.endCol
      ).flat().filter(v=>v!==''); 

      if (beforeVals.length !== afterVals.length || !beforeVals.length) {
        alert("Error: ranges must have same non-empty count.");
        return;
      }

      const isParam = parametricCheckbox.checked ? 'TRUE' : 'FALSE';
      const rCmd = `
        before_vals <- c(${beforeVals.join(',')})
        after_vals  <- c(${afterVals.join(',')})
        data        <- data.frame(before_col=before_vals, after_col=after_vals)
        paired_comparison(data, before_col, after_col, parametric=${isParam})
      `;
      // captureR gives us images + text output
      const result = await shelter.captureR(rCmd);

      // draw the first plot
      if (result.images.length) {
        const img = result.images[0];
        const ctx = plotCanvas.getContext('2d');
        plotCanvas.width  = img.width;
        plotCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      }

      // gather all stdout/stderr/message lines
      const text = result.output
        .filter(m => ['stdout','stderr','message'].includes(m.type))
        .map(m => m.data)
        .join('\n')
        .trim();
      statsOutput.innerText = text;
      outputsDiv.style.display = 'block';

    } catch(err) {
      console.error('Analysis failed:', err);
      alert('Analysis error—see console.');
    } finally {
      await shelter.purge();
      runButton.disabled = false;
      statusMessage.innerText = 'Ready.';
    }
  });

  initWebR();
});
