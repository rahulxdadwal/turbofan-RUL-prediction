const subsets = ["FD001", "FD002", "FD003", "FD004"];

const metadataFiles = [
  {
    label: "01A",
    path: "exports/preprocessing/01A/preprocessing_metadata.json",
    features: "exports/preprocessing/01A/selected_features.json",
  },
  {
    label: "01B",
    path: "exports/preprocessing/01B/preprocessing_metadata_01B.json",
    features: "exports/preprocessing/01B/selected_features_01B.json",
  },
  {
    label: "01C",
    path: "exports/preprocessing/01C/preprocessing_metadata_01C.json",
    features: "exports/preprocessing/01C/selected_features_01C.json",
  },
  {
    label: "01D",
    path: "exports/preprocessing/01D/preprocessing_metadata_01D.json",
    features: "exports/preprocessing/01D/selected_features_01D.json",
  },
];

const subsetProfiles = {
  FD001: { complexity: 0.85, baseLife: 132 },
  FD002: { complexity: 1.08, baseLife: 118 },
  FD003: { complexity: 0.94, baseLife: 126 },
  FD004: { complexity: 1.18, baseLife: 110 },
};

let modelRows = [];

function formatMetric(value) {
  return value == null ? "N/A" : Number(value).toFixed(3);
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

function getApiBaseUrl() {
  return (
    window.RUL_API_URL ||
    new URLSearchParams(window.location.search).get("api") ||
    localStorage.getItem("RUL_API_URL") ||
    ""
  ).replace(/\/$/, "");
}

function updateApiStatus(message, isApiResult = false) {
  const status = document.querySelector("#api-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("api-live", isApiResult);
}

function bestModelFor(subset) {
  return modelRows.reduce((best, row) => {
    if (!best) return row;
    return row.results[subset].rmse < best.results[subset].rmse ? row : best;
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

function normalizeRiskBand(value, rul) {
  const band = String(value || "").toLowerCase();
  if (band.includes("critical") || rul < 35) {
    return { label: "Critical", className: "critical" };
  }
  if (band.includes("watch") || rul < 70) {
    return { label: "Watch", className: "watch" };
  }
  return { label: "Stable", className: "stable" };
}

function getRecommendation(risk, fromApi) {
  if (risk.label === "Critical") {
    return fromApi
      ? "Real model inference indicates a short remaining useful life. Prioritize inspection."
      : "Prioritize inspection and prepare a maintenance action. The sensor pattern indicates accelerated degradation.";
  }
  if (risk.label === "Watch") {
    return fromApi
      ? "Real model inference suggests a watch zone. Increase monitoring frequency."
      : "Increase monitoring frequency and review recent cycles for trend changes before the next operating window.";
  }
  return fromApi
    ? "Real model inference indicates stable remaining life for the sample window."
    : "Continue routine monitoring. Schedule a sensor trend review within the next maintenance window.";
}

function setPredictionResult({ rul, risk, modelName, rmse, score, dataset, confidence, recommendation }) {
  document.querySelector("#rul-output").textContent = Math.round(rul);
  document.querySelector("#confidence-fill").style.width = `${confidence}%`;
  document.querySelector("#recommendation").textContent = recommendation;
  document.querySelector("#rmse-output").textContent = formatMetric(rmse);
  document.querySelector("#score-output").textContent = formatMetric(score);
  document.querySelector("#dataset-output").textContent = dataset;
  document.querySelector("#selected-model").textContent = modelName;

  const riskPill = document.querySelector("#risk-pill");
  riskPill.textContent = risk.label;
  riskPill.className = `risk-pill ${risk.className}`;
}

function updateRangeReadouts() {
  ["temperature-margin", "vibration-severity", "pressure-drift"].forEach((id) => {
    document.querySelector(`#${id}-value`).textContent = document.querySelector(`#${id}`).value;
  });
}

function parseSensorImpact() {
  const raw = document.querySelector("#sensor-row").value.trim();
  if (!raw) return 0;

  const values = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return 0;

  const averageMagnitude = values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
  return Math.min(18, averageMagnitude % 22);
}

function demoPrediction(subset, selectedResult) {
  const cycle = Number(document.querySelector("#cycle-count").value);
  const temperature = Number(document.querySelector("#temperature-margin").value);
  const vibration = Number(document.querySelector("#vibration-severity").value);
  const pressure = Number(document.querySelector("#pressure-drift").value);
  const profile = subsetProfiles[subset];

  const degradation =
    cycle * 0.34 +
    temperature * 0.46 +
    vibration * 0.58 +
    pressure * 0.32 +
    parseSensorImpact();

  const rawRul = profile.baseLife - degradation * profile.complexity + selectedResult.rmse * 0.74;
  const rul = Math.max(8, Math.round(rawRul));
  const confidence = Math.max(42, Math.min(92, Math.round(96 - selectedResult.rmse * 1.45 - degradation * 0.08)));
  const risk = normalizeRiskBand("", rul);

  return {
    rul,
    risk,
    confidence,
    recommendation: getRecommendation(risk, false),
  };
}

async function runPrediction(event) {
  event.preventDefault();
  updateRangeReadouts();

  if (!modelRows.length) {
    updateApiStatus("Loading model metrics before prediction can run.");
    return;
  }

  const subset = document.querySelector("#prediction-subset").value;
  const selectedBest = bestModelFor(subset);
  const selectedResult = selectedBest.results[subset];
  const apiBaseUrl = getApiBaseUrl();

  if (apiBaseUrl) {
    updateApiStatus(`Calling configured API: ${apiBaseUrl}`, true);
    try {
      const response = await fetch(`${apiBaseUrl}/sample/${subset}`);
      if (response.ok) {
        const result = await response.json();
        const rul = Number(result.predicted_rul_cycles);
        const risk = normalizeRiskBand(result.risk_band, rul);
        const confidence = Math.max(42, Math.min(92, Math.round(96 - selectedResult.rmse * 1.45)));

        setPredictionResult({
          rul,
          risk,
          modelName: String(result.model_name || selectedBest.name).replaceAll("_", "-"),
          rmse: selectedResult.rmse,
          score: selectedResult.score,
          dataset: result.subset || subset,
          confidence,
          recommendation: getRecommendation(risk, true),
        });
        updateApiStatus(`Prediction returned from ${apiBaseUrl}`, true);
        return;
      }
      updateApiStatus(`API returned ${response.status}; using browser demo fallback.`);
    } catch (error) {
      updateApiStatus("API unavailable or sleeping; using browser demo fallback.");
    }
  } else {
    updateApiStatus("Using browser demo prediction until an API URL is configured.");
  }

  const fallback = demoPrediction(subset, selectedResult);
  setPredictionResult({
    ...fallback,
    modelName: selectedBest.name,
    rmse: selectedResult.rmse,
    score: selectedResult.score,
    dataset: subset,
  });
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

fetch("exports/metrics_summary.json")
  .then((response) => response.json())
  .then((metrics) => {
    modelRows = getRows(metrics);
    renderTable(modelRows);
    renderBars(modelRows);
    document.querySelector("#prediction-form").dispatchEvent(new Event("submit"));
  })
  .catch(() => {
    document.querySelector("#results-body").innerHTML =
      '<tr><td colspan="5">Unable to load exports/metrics_summary.json.</td></tr>';
    updateApiStatus("Unable to load metrics; prediction workspace is unavailable.");
  });

renderMetadata().catch(() => {
  document.querySelector("#metadata-grid").innerHTML =
    "<article>Unable to load preprocessing metadata.</article>";
});

["temperature-margin", "vibration-severity", "pressure-drift"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", updateRangeReadouts);
});

document.querySelector("#prediction-form").addEventListener("submit", runPrediction);
updateRangeReadouts();
