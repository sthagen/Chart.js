import {isNullOrUndef, resolve} from '../helpers';

function minMaxDecimation(data, availableWidth) {
  let avgX = 0;
  let countX = 0;
  let i, point, x, y, prevX, minIndex, maxIndex, startIndex, minY, maxY;
  const decimated = [];

  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;
  const dx = xMax - xMin;

  for (i = 0; i < data.length; ++i) {
    point = data[i];
    x = (point.x - xMin) / dx * availableWidth;
    y = point.y;
    const truncX = x | 0;

    if (truncX === prevX) {
      // Determine `minY` / `maxY` and `avgX` while we stay within same x-position
      if (y < minY) {
        minY = y;
        minIndex = i;
      } else if (y > maxY) {
        maxY = y;
        maxIndex = i;
      }
      // For first point in group, countX is `0`, so average will be `x` / 1.
      // Use point.x here because we're computing the average data `x` value
      avgX = (countX * avgX + point.x) / ++countX;
    } else {
      // Push up to 4 points, 3 for the last interval and the first point for this interval
      const lastIndex = i - 1;

      if (!isNullOrUndef(minIndex) && !isNullOrUndef(maxIndex)) {
        // The interval is defined by 4 points: start, min, max, end.
        // The starting point is already considered at this point, so we need to determine which
        // of the other points to add. We need to sort these points to ensure the decimated data
        // is still sorted and then ensure there are no duplicates.
        const intermediateIndex1 = Math.min(minIndex, maxIndex);
        const intermediateIndex2 = Math.max(minIndex, maxIndex);

        if (intermediateIndex1 !== startIndex && intermediateIndex1 !== lastIndex) {
          decimated.push({
            ...data[intermediateIndex1],
            x: avgX,
          });
        }
        if (intermediateIndex2 !== startIndex && intermediateIndex2 !== lastIndex) {
          decimated.push({
            ...data[intermediateIndex2],
            x: avgX
          });
        }
      }

      // lastIndex === startIndex will occur when a range has only 1 point which could
      // happen with very uneven data
      if (i > 0 && lastIndex !== startIndex) {
        // Last point in the previous interval
        decimated.push(data[lastIndex]);
      }

      // Start of the new interval
      decimated.push(point);
      prevX = truncX;
      countX = 0;
      minY = maxY = y;
      minIndex = maxIndex = startIndex = i;
    }
  }

  return decimated;
}

export default {
  id: 'decimation',

  defaults: {
    algorithm: 'min-max',
    enabled: false,
  },

  beforeElementsUpdate: (chart, args, options) => {
    if (!options.enabled) {
      return;
    }

    // Assume the entire chart is available to show a few more points than needed
    const availableWidth = chart.width;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const {_data, indexAxis} = dataset;
      const meta = chart.getDatasetMeta(datasetIndex);
      const data = _data || dataset.data;

      if (resolve([indexAxis, chart.options.indexAxis]) === 'y') {
        // Decimation is only supported for lines that have an X indexAxis
        return;
      }

      if (meta.type !== 'line') {
        // Only line datasets are supported
        return;
      }

      const xAxis = chart.scales[meta.xAxisID];
      if (xAxis.type !== 'linear' && xAxis.type !== 'time') {
        // Only linear interpolation is supported
        return;
      }

      if (chart.options.parsing) {
        // Plugin only supports data that does not need parsing
        return;
      }

      if (data.length <= 4 * availableWidth) {
        // No decimation is required until we are above this threshold
        return;
      }

      if (isNullOrUndef(_data)) {
        // First time we are seeing this dataset
        // We override the 'data' property with a setter that stores the
        // raw data in _data, but reads the decimated data from _decimated
        dataset._data = data;
        delete dataset.data;
        Object.defineProperty(dataset, 'data', {
          configurable: true,
          enumerable: true,
          get: function() {
            return this._decimated;
          },
          set: function(d) {
            this._data = d;
          }
        });
      }

      // Point the chart to the decimated data
      let decimated;
      switch (options.algorithm) {
      case 'min-max':
        decimated = minMaxDecimation(data, availableWidth);
        break;
      default:
        throw new Error(`Unsupported decimation algorithm '${options.algorithm}'`);
      }

      dataset._decimated = decimated;
    });
  },

  destroy(chart) {
    chart.data.datasets.forEach((dataset) => {
      if (dataset._decimated) {
        const data = dataset._data;
        delete dataset._decimated;
        delete dataset._data;
        Object.defineProperty(dataset, 'data', {value: data});
      }
    });
  }
};
