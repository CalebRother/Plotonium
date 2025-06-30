import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const webR = new WebR();

  // — UI references —
  const fileInput          = document.getElementById('csv-file-input');
  const spreadsheetContainer = document.getElementById('spreadsheet-container');
  const runButton          = document.getElementById('run-button');
  const statusMessage      = document.getElementById('status-message');
  const outputsDiv         = document.getElementById('outputs');
  const plotCanvas         = document.getElementById('plot-canvas');
  const statsOutput        = document.getElementById('stats-output');
  const beforeRangeInput   = document.getElementById('before-range-input');
  const setBeforeButton    = document.getElementById('set-before-button');
  const afterRangeInput    = document.getElementById('after-range-input');
  const setAfterButton     = document.getElementById('set-after-button');
  const importCsvMenu      = document.getElementById('import-csv-menu');
  const exportCsvMenu      = document.getElementById('export-csv-menu');
  const addRowMenu         = document.getElementById('add-row-menu');
  const addColMenu         = document.getElementById('add-col-menu');
  const clearTableMenu     = document.getElementById('clear-table-menu');

  let lastSelection = null;

  // Handsontable setup
  const hot = new Handsontable(spreadsheetContainer, {
    startRows: 1000,
    startCols: 52,
    rowHeaders: true,
    colHeaders: true,
    height: '100%',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    afterSelectionEnd: (r, c, r2, c2) => {
      lastSelection = {
        startRow: Math.min(r, r2),
        endRow:   Math.max(r, r2),
        startCol: Math.min(c, c2),
        endCol:   Math.max(c, c2),
      };
    }
  });

  function getA1Notation({ startRow, endRow, startCol, endCol }) {
    const a = hot.getColHeader(startCol) + (startRow + 1);
    const b = hot.getColHeader(endCol)   + (endRow   + 1);
    return `${a}:${b}`;
  }

  function loadCsvData(file) {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) return;
        hot.populateFromArray(0, 0, res.data);
      }
    });
  }

  function parseA1Range(rangeStr) {
    const colToIdx = col => col.split('').reduce((acc, ch) => acc*26 + (ch.charCodeAt(0)-64), 0) - 1;
    const [start, end] = rangeStr.toUpperCase().split(':');
    const m1 = start.match(/^([A-Z]+)(\d+)$/);
    if (!m1) return null;
    const sr = parseInt(m1[2],10)-1, sc = colToIdx(m1[1]);
    let er=sr, ec=sc;
    if (end) {
      const m2 = end.match(/^([A-Z]+)(\d+)$/);
      if (!m2) return null;
      er = parseInt(m2[2],10)-1; ec = colToIdx(m2[1]);
    }
    return {
      startRow: Math.min(sr,er),
      endRow:   Math.max(sr,er),
      startCol: Math.min(sc,ec),
      endCol:   Math.max(sc,ec),
    };
  }

  async function main() {
    try {
      statusMessage.innerText = 'Initializing WebR…';
      await webR.init();
      statusMessage.innerText = 'Installing R packages…';
      await webR.evalR(`webr::install(c('dplyr','rlang','ggplot2','tidyr','rstatix','scales','ggpubr'))`);

      statusMessage.innerText = 'Loading analysis function…';
      const rsp = await fetch(`r/paired_comparison.R?v=${Date.now()}`);
      if (!rsp.ok) throw new Error(`R script fetch failed: ${rsp.status}`);
      const rText = (await rsp.text()).replace(/\r/g,'');
      await webR.evalR(rText);

      statusMessage.innerText = 'Ready.';
      runButton.disabled = false;
    } catch (err) {
      console.error('Startup error:', err);
      statusMessage.innerText = 'Error during startup. Check console.';
    }
  }

  // — Menu & buttons wiring —
  importCsvMenu.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
  addRowMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_row_below'); });
  addColMenu.addEventListener('click',   e => { e.preventDefault(); hot.alter('insert_col_end'); });
  clearTableMenu.addEventListener('click', e => {
    e.preventDefault();
    hot.loadData(Handsontable.helper.createEmptySpreadsheetData(1000,52));
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadCsvData(e.target.files[0]);
  });
  exportCsvMenu.addEventListener('click', e => {
    /* your existing export logic */
  });

  setBeforeButton .addEventListener('click', () => {
    if (lastSelection) beforeRangeInput.value = getA1Notation(lastSelection);
    else alert('Select a range first.');
  });
  setAfterButton .addEventListener('click', () => {
    if (lastSelection) afterRangeInput.value = getA1Notation(lastSelection);
    else alert('Select a range first.');
  });

  runButton.addEventListener('click', async () => {
    const beforeStr = beforeRangeInput.value.trim();
    const afterStr  = afterRangeInput.value.trim();
    if (!beforeStr || !afterStr) {
      alert("Please set both 'Before' and 'After' ranges.");
      return;
    }

    runButton.disabled    = true;
    statusMessage.innerText = 'Processing data…';
    outputsDiv.style.display = 'none';

    const shelter = await new webR.Shelter();
    try {
      const beforeRng = parseA1Range(beforeStr);
      const afterRng  = parseA1Range(afterStr);
      if (!beforeRng || !afterRng) {
        alert('Invalid range format.');
        return;
      }

      const beforeVals = hot
        .getData(beforeRng.startRow, beforeRng.startCol, beforeRng.endRow, beforeRng.endCol)
        .flat().filter(v=>v!=='');
      const afterVals  = hot
        .getData(afterRng.startRow,  afterRng.startCol,  afterRng.endRow,  afterRng.endCol)
        .flat().filter(v=>v!=='');
      if (beforeVals.length !== afterVals.length || !beforeVals.length) {
        alert("Ranges must have the same number of non-empty cells.");
        return;
      }

      statusMessage.innerText = 'Running analysis…';
      const rCmd = `
        before_vals <- c(${beforeVals.join(',')})
        after_vals  <- c(${afterVals.join(',')})
        data        <- data.frame(before_col=before_vals, after_col=after_vals)
        paired_comparison(data, before_col, after_col, parametric=FALSE)
      `;

      const result = await shelter.captureR(rCmd);

      // — Draw the plot if present —
      if (result.images.length) {
        const img = result.images[0];
        const ctx = plotCanvas.getContext('2d');
        plotCanvas.width  = img.width;
        plotCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      }

      // — Capture all stdout / stderr / message lines —
      const textOutput = result.output
        .filter(m => ['stdout','stderr','message'].includes(m.type))
        .map(m => m.data)
        .join('\n').trim();

      statsOutput.innerText   = textOutput;
      outputsDiv.style.display = 'block';

    } catch (err) {
      console.error('Analysis failed:', err);
      alert('Analysis error—see console.');
    } finally {
      await shelter.purge();
      runButton.disabled    = false;
      statusMessage.innerText = 'Analysis complete.';
    }
  });

  main();
});
