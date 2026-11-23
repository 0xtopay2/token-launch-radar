const fs = require('fs');

function check() {
  const boardPath = process.argv[2] || 'out/board.json';
  const snapshotPath = process.argv[3] || '/tmp/makefun/kit/token-radar-01-kit/input/snapshot.json';

  console.log(`Running sanity checks on ${boardPath} against ${snapshotPath}...`);

  const boardData = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  const rows = boardData.rows;
  if (!Array.isArray(rows)) {
    throw new Error('board.json must have a "rows" array');
  }

  // 1. Row count 100-4000
  if (rows.length < 100 || rows.length > 4000) {
    throw new Error(`Row count ${rows.length} out of bounds (100-4000)`);
  }
  console.log(`[PASS] Row count: ${rows.length}`);

  // 2. Ranks 1..N
  const ranks = rows.map(r => r.rank);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) {
      throw new Error(`Invalid rank at index ${i}: expected ${i + 1}, got ${rows[i].rank}`);
    }
  }
  console.log('[PASS] Ranks are strictly 1..N');

  // 3. implied_value_usd non-increasing
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].implied_value_usd < rows[i+1].implied_value_usd) {
      throw new Error(`Implied value not non-increasing at index ${i} (${rows[i].slug}: ${rows[i].implied_value_usd} < ${rows[i+1].slug}: ${rows[i+1].implied_value_usd})`);
    }
  }
  console.log('[PASS] implied_value_usd is non-increasing');

  // 4. All 40 snapshot watchlist slugs covered
  const watchlist = snapshotData.watchlist || [];
  const boardSlugs = new Set(rows.map(r => r.slug));
  const missingWatchlist = watchlist.filter(w => !boardSlugs.has(w));
  if (missingWatchlist.length > 0) {
    throw new Error(`Missing watchlist slugs: ${missingWatchlist.join(', ')}`);
  }
  console.log(`[PASS] All ${watchlist.length} watchlist slugs covered`);

  // 5. >= 60 non-watchlist
  const nonWatchlistRows = rows.filter(r => !watchlist.includes(r.slug));
  if (nonWatchlistRows.length < 60) {
    throw new Error(`Non-watchlist rows count ${nonWatchlistRows.length} is below 60`);
  }
  console.log(`[PASS] Non-watchlist rows: ${nonWatchlistRows.length} (>= 60)`);

  // 6. farm_steps 3-12 strings each 20-600 chars
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r.farm_steps)) {
      throw new Error(`Row ${r.slug} farm_steps is not an array`);
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`Row ${r.slug} farm_steps count ${r.farm_steps.length} out of bounds (3-12)`);
    }
    for (let j = 0; j < r.farm_steps.length; j++) {
      const step = r.farm_steps[j];
      if (typeof step !== 'string') {
        throw new Error(`Row ${r.slug} step ${j} is not a string`);
      }
      const trimmedLen = step.trim().length;
      if (trimmedLen < 20 || trimmedLen > 600) {
        throw new Error(`Row ${r.slug} step ${j} length ${trimmedLen} out of bounds (20-600 chars): "${step}"`);
      }
    }
  }
  console.log('[PASS] All farm_steps valid (3-12 steps, 20-600 chars each)');

  // 7. Dashboard + data.js total bytes < 65536
  const dashFiles = ['dashboard/app.js', 'dashboard/app.css', 'dashboard/index.html', 'out/data.js'];
  let totalDashBytes = 0;
  for (const f of dashFiles) {
    const st = fs.statSync(f);
    totalDashBytes += st.size;
  }
  if (totalDashBytes >= 65536) {
    throw new Error(`Dashboard + data.js total bytes ${totalDashBytes} is not < 65536`);
  }
  console.log(`[PASS] Dashboard + data.js total bytes: ${totalDashBytes} (< 65536)`);

  // 8. 3 PNG screenshots exist each <= 524288 bytes and > 50KB
  const screenshots = ['screenshots/1-board.png', 'screenshots/2-detail.png', 'screenshots/3-filtered.png'];
  for (const s of screenshots) {
    if (!fs.existsSync(s)) {
      throw new Error(`Screenshot ${s} does not exist`);
    }
    const st = fs.statSync(s);
    if (st.size > 524288) {
      throw new Error(`Screenshot ${s} size ${st.size} exceeds 524288 bytes`);
    }
    if (st.size <= 50000) {
      throw new Error(`Screenshot ${s} size ${st.size} is <= 50KB (renders blank)`);
    }
  }
  console.log('[PASS] 3 PNG screenshots exist and each is <= 524288 bytes and > 50KB');

  console.log('SUCCESS: All sanity checks passed successfully!');
}

try {
  check();
} catch (err) {
  console.error('SANITY CHECK FAILED:', err.message);
  process.exit(1);
}
