// ═══════════════════════════════════════════════════════════════
// RESEARCH ANALYSIS v1
// Статистический анализ результатов оптимизации
// ═══════════════════════════════════════════════════════════════

const ResearchAnalysis = (() => {

  // ─── Утилиты для статистики ────────────────────────────────

  function mean(arr) {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdev(arr) {
    const m = mean(arr);
    const variance = arr.reduce((a, x) => a + Math.pow(x - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }

  // ─── 1. КОРРЕЛЯЦИИ: параметр → метрика ─────────────────────

  function analyzeCorrelations(results) {
    if (results.length < 10) return { error: 'Недостаточно данных (нужно ≥10)' };

    const metrics = ['pnl', 'wr', 'dd', 'pdd', 'sig', 'gt'];
    const paramNames = new Set();
    const paramValues = {}; // param → [значения]
    const metricValues = {}; // metric → [значения]

    // Собираем параметры и метрики
    for (const r of results) {
      if (!r.cfg) continue;

      for (const [key, val] of Object.entries(r.cfg)) {
        if (typeof val === 'number' && key !== 'commission' && key !== 'baseComm') {
          paramNames.add(key);
          if (!paramValues[key]) paramValues[key] = [];
          paramValues[key].push(val);
        }
      }

      for (const metric of metrics) {
        if (r[metric] !== undefined) {
          if (!metricValues[metric]) metricValues[metric] = [];
          metricValues[metric].push(r[metric]);
        }
      }
    }

    // Расчёт Pearson корреляций
    const correlations = {};
    for (const param of paramNames) {
      const pvals = paramValues[param];
      if (!pvals || pvals.length < 5) continue;

      correlations[param] = {};
      for (const metric of metrics) {
        const mvals = metricValues[metric];
        if (!mvals || mvals.length !== pvals.length) continue;

        const correlation = _pearsonCorr(pvals, mvals);
        if (!isNaN(correlation)) {
          correlations[param][metric] = correlation;
        }
      }
    }

    // Сортируем по абсолютному значению
    const sorted = Object.entries(correlations)
      .map(([param, corrs]) => ({
        param,
        metrics: Object.entries(corrs)
          .map(([metric, r]) => ({ metric, r }))
          .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      }))
      .sort((a, b) => Math.abs(b.metrics[0]?.r || 0) - Math.abs(a.metrics[0]?.r || 0));

    return {
      type: 'correlations',
      topParams: sorted.slice(0, 10),
      allCorrelations: correlations
    };
  }

  function _pearsonCorr(x, y) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX  += x[i];
      sumY  += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }

    const denom = Math.sqrt((n*sumX2 - sumX*sumX) * (n*sumY2 - sumY*sumY));
    if (denom === 0) return 0;
    return (n*sumXY - sumX*sumY) / denom;
  }

  // ─── 2. АНОМАЛИИ: Outlier Detection ────────────────────────

  function findAnomalies(results, metric = 'pnl', threshold = 2.5) {
    const values = results
      .map(r => r[metric])
      .filter(v => v !== undefined && !isNaN(v));

    if (values.length < 5) return { anomalies: [] };

    const m = mean(values);
    const s = stdev(values);

    // Z-score: |value - mean| > threshold * stdev
    const anomalies = results
      .map((r, idx) => ({
        ...r,
        zScore: Math.abs(r[metric] - m) / s
      }))
      .filter(r => r.zScore > threshold)
      .sort((a, b) => b.zScore - a.zScore);

    return {
      type: 'anomalies',
      metric,
      mean: m,
      stdev: s,
      count: anomalies.length,
      topAnomalies: anomalies.slice(0, 5),
      allAnomalies: anomalies
    };
  }

  // ─── 3. CLUSTERING: K-Means для успешных конфигов ─────────

  function clusterSuccessful(results, k = 3, minPnl = 1.0) {
    // Фильтруем успешные результаты
    const successful = results.filter(r => r.pnl >= minPnl && r.cfg);

    if (successful.length < k) {
      return { error: `Недостаточно успешных результатов (${successful.length} < ${k})` };
    }

    // Извлекаем числовые параметры (нормализованные)
    const paramNames = _getNumericParams(successful);
    if (paramNames.length === 0) {
      return { error: 'Не найдено числовых параметров для кластеризации' };
    }

    const features = successful.map(r => {
      const v = paramNames.map(p => r.cfg[p] || 0);
      return _normalize(v);
    });

    // K-means итерации
    const clusters = _kmeansCluster(features, k, 20);

    // Анализ кластеров
    const analysis = clusters.map((cluster, idx) => {
      const configs = cluster.map(i => successful[i]);
      return {
        clusterId: idx,
        size: configs.length,
        avgPnl: mean(configs.map(c => c.pnl)),
        avgWr: mean(configs.map(c => c.wr)),
        avgDd: mean(configs.map(c => c.dd)),
        topConfigs: configs
          .sort((a, b) => b.pnl - a.pnl)
          .slice(0, 3)
      };
    });

    return {
      type: 'clusters',
      k,
      totalSuccessful: successful.length,
      clusters: analysis.sort((a, b) => b.avgPnl - a.avgPnl)
    };
  }

  function _getNumericParams(results) {
    const params = new Set();
    for (const r of results) {
      if (!r.cfg) continue;
      for (const [key, val] of Object.entries(r.cfg)) {
        if (typeof val === 'number' && !key.includes('commission')) {
          params.add(key);
        }
      }
    }
    return Array.from(params).sort();
  }

  function _normalize(arr) {
    if (!arr || arr.length === 0) return [];
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const range = (max - min) || 1;
    if (!isFinite(min) || !isFinite(max)) return arr.map(() => 0);  // NaN защита
    return arr.map(x => (x - min) / range);
  }

  function _kmeansCluster(features, k, maxIter) {
    if (!features || features.length === 0) return [];
    if (k > features.length) k = features.length;  // Не больше k чем элементов

    const n = features.length;
    const clusters = Array.from({length: k}, () => []);
    let centers = features.slice(0, k).map(f => [...f]);

    for (let iter = 0; iter < maxIter; iter++) {
      // Очистить и переассигн
      for (let i = 0; i < k; i++) clusters[i] = [];

      // Ассигн точек ближайшему центру
      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let j = 0; j < k; j++) {
          const dist = _euclidean(features[i], centers[j]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = j;
          }
        }
        clusters[bestCluster].push(i);
      }

      // Пересчитать центры
      const newCenters = clusters.map((cluster, j) => {
        if (cluster.length === 0) return centers[j];
        const dim = features[0].length;
        return Array.from({length: dim}, (_, d) =>
          mean(cluster.map(i => features[i][d]))
        );
      });

      // Проверка сходимости
      let converged = true;
      for (let j = 0; j < k; j++) {
        if (_euclidean(centers[j], newCenters[j]) > 0.001) {
          converged = false;
          break;
        }
      }
      centers = newCenters;
      if (converged) break;
    }

    return clusters;
  }

  function _euclidean(a, b) {
    if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return Infinity;  // Неверные входные данные - максимальное расстояние
    }
    return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  }

  // ─── 4. FEATURE IMPORTANCE ────────────────────────────────

  function analyzeFeatureImportance(results) {
    const successful = results.filter(r => r.pnl > 0 && r.cfg);
    const unsuccessful = results.filter(r => r.pnl <= 0 && r.cfg);

    if (successful.length < 5 || unsuccessful.length < 5) {
      return { error: 'Недостаточно данных для сравнения' };
    }

    const paramNames = _getNumericParams(results);
    if (paramNames.length === 0) {
      return { error: 'Не найдено числовых параметров для анализа' };
    }
    const importance = {};

    for (const param of paramNames) {
      const sucVals = successful.map(r => r.cfg[param]).filter(v => v !== undefined);
      const unsucVals = unsuccessful.map(r => r.cfg[param]).filter(v => v !== undefined);

      if (sucVals.length < 3 || unsucVals.length < 3) continue;

      // Difference of means
      const diff = Math.abs(mean(sucVals) - mean(unsucVals));
      const stdDiff = Math.sqrt(Math.pow(stdev(sucVals), 2) + Math.pow(stdev(unsucVals), 2)) || 1;
      const tScore = diff / stdDiff;

      importance[param] = {
        successMean: mean(sucVals),
        unsuccessMean: mean(unsucVals),
        difference: diff,
        tScore: tScore
      };
    }

    const sorted = Object.entries(importance)
      .map(([param, data]) => ({ param, ...data }))
      .sort((a, b) => b.tScore - a.tScore);

    return {
      type: 'feature_importance',
      topFeatures: sorted.slice(0, 10),
      allFeatures: sorted
    };
  }

  // ─── API: Полный анализ ────────────────────────────────────

  async function analyzeResults(results) {
    if (results.length < 10) {
      return { error: 'Недостаточно результатов для анализа (нужно ≥10)' };
    }

    const insights = [];

    // 1. Корреляции
    const corr = analyzeCorrelations(results);
    if (!corr.error) insights.push(corr);

    // 2. Аномалии
    const anom = findAnomalies(results, 'pnl', 2.0);
    if (anom.anomalies.length > 0) insights.push(anom);

    // 3. Кластеры
    const clust = clusterSuccessful(results, 3);
    if (!clust.error) insights.push(clust);

    // 4. Feature Importance
    const feat = analyzeFeatureImportance(results);
    if (!feat.error) insights.push(feat);

    return {
      timestamp: Date.now(),
      resultCount: results.length,
      insights: insights,
      summary: {
        totalResults: results.length,
        profitable: results.filter(r => r.pnl > 0).length,
        avgPnl: mean(results.map(r => r.pnl || 0)),
        avgWr: mean(results.map(r => r.wr || 0)),
        avgDd: mean(results.map(r => r.dd || 0))
      }
    };
  }

  // ─── Public API ─────────────────────────────────────────────

  return {
    analyzeCorrelations,
    findAnomalies,
    clusterSuccessful,
    analyzeFeatureImportance,
    analyzeResults
  };
})();
