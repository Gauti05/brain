const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const csv = require('csv-parser');

const filePath = workerData.filePath;

let sum = 0;
let totalBytes = 0;
try {
  totalBytes = fs.statSync(filePath).size;
} catch (err) {
  parentPort.postMessage({ type: 'error', error: `Cannot read file stats: ${err.message}` });
  process.exit(1);
}

let bytesRead = 0;

const readStream = fs.createReadStream(filePath);

readStream.on('data', (chunk) => {
  bytesRead += chunk.length;
  const progress = Math.min(99, Math.round((bytesRead / totalBytes) * 100)); // cap at 99 until finished
  parentPort.postMessage({ type: 'progress', progress });
});

readStream
  .pipe(csv())
  .on('data', (row) => {

    for (const key in row) {
      const val = parseFloat(row[key]);
      if (!isNaN(val)) {
        sum += val;
      }
    }
  })
  .on('end', () => {
    parentPort.postMessage({ type: 'completed', result: sum });
  })
  .on('error', (err) => {
    parentPort.postMessage({ type: 'error', error: err.message });
  });
