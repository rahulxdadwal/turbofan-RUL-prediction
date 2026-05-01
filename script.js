const subsets = ["FD001", "FD002", "FD003", "FD004"];

const metadataFiles = [
  {
    label: "01A",
    path: "outputs%202/outputs-01A/preprocessing_metadata.json",
    features: "outputs%202/outputs-01A/selected_features.json",
  },
  {
    label: "01B",
    path: "outputs%202/outputs-01B/preprocessing_metadata_01B.json",
    features: "outputs%202/outputs-01B/selected_features_01B.json",
  },
  {
    label: "01C",
    path: "outputs%202/outputs-01C/preprocessing_metadata_01C.json",
    features: "outputs%202/outputs-01C/selected_features_01C.json",
  },
  {
    label: "01D",
    path: "outputs%202/outputs-01D/preprocessing_metadata_01D.json",
    features: "outputs%202/outputs-01D/selected_features_01D.json",
  },
];

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
            <span>${item.model} | RMSE ${formatMetric(item.rmse)}</span>
          </div>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function countFeatures(features) {
  const counts = Object.values(features).map((list) => list.length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? `${max}` : `${min}-${max}`;
}

async function renderMetadata() {
  const cards = await Promise.all(
    metadataFiles.map(async (item) => {
      const [metadata, features] = await Promise.all([
        fetch(item.path).then((response) => response.json()),
        fetch(item.features).then((response) => response.json()),
      ]);
      return { ...item, metadata, features };
    })
  );

  document.querySelector("#metadata-grid").innerHTML = cards
    .map(({ label, metadata, features, path }) => {
      const datasets = metadata.datasets.join(", ");
      const variant = metadata.variant || datasets;
      return `
        <article>
          <span>${label}</span>
          <h3>${variant}</h3>
          <dl>
            <div><dt>Datasets</dt><dd>${datasets}</dd></div>
            <div><dt>Window</dt><dd>${metadata.window_size} cycles</dd></div>
            <div><dt>RUL cap</dt><dd>${metadata.rul_cap}</dd></div>
            <div><dt>Scaler</dt><dd>${metadata.scaler_type}</dd></div>
            <div><dt>Features</dt><dd>${countFeatures(features)} per subset</dd></div>
          </dl>
          <a href="${path}">Open metadata</a>
        </article>
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

renderMetadata().catch(() => {
  document.querySelector("#metadata-grid").innerHTML =
    "<article>Unable to load preprocessing metadata.</article>";
});
