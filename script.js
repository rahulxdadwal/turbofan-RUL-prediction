const subsets = ["FD001", "FD002", "FD003", "FD004"];

function formatMetric(value) {
  return Number(value).toFixed(3);
}

function getRows(metrics) {
  return Object.values(metrics).map((model) => ({
    name: model.display_name,
    results: model.results,
  }));
}

function bestBySubset(rows, subset) {
  return rows.reduce((best, row) => {
    const value = row.results[subset]?.rmse;
    if (value == null) return best;
    if (!best || value < best.rmse) {
      return { model: row.name, rmse: value };
    }
    return best;
  }, null);
}

function renderTable(rows) {
  const bestMap = Object.fromEntries(
    subsets.map((subset) => [subset, bestBySubset(rows, subset)])
  );

  document.querySelector("#results-body").innerHTML = rows
    .map((row) => {
      const cells = subsets
        .map((subset) => {
          const value = row.results[subset]?.rmse;
          const best = bestMap[subset];
          const isBest = best && best.model === row.name;
          return `<td class="${isBest ? "best" : ""}">${formatMetric(value)}</td>`;
        })
        .join("");

      return `<tr><td>${row.name}</td>${cells}</tr>`;
    })
    .join("");
}

function renderBars(rows) {
  const best = subsets.map((subset) => ({ subset, ...bestBySubset(rows, subset) }));
  const max = Math.max(...best.map((item) => item.rmse));

  document.querySelector("#best-bars").innerHTML = best
    .map((item) => {
      const width = Math.max(8, (item.rmse / max) * 100);
      return `
        <div class="bar-row">
          <div class="bar-top">
            <strong>${item.subset}</strong>
            <span>${item.model} - RMSE ${formatMetric(item.rmse)}</span>
          </div>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

fetch("metrics_summary.json")
  .then((response) => response.json())
  .then((metrics) => {
    const rows = getRows(metrics);
    renderTable(rows);
    renderBars(rows);
  })
  .catch(() => {
    document.querySelector("#results-body").innerHTML =
      '<tr><td colspan="5">Unable to load metrics_summary.json.</td></tr>';
  });
