const cron = require('node-cron');
const { runAllChecks } = require('./checker');

let task = null;

/**
 * Start the background scheduler.
 * Default: every 4 minutes (*/4 * * * *)
 */
function startScheduler(intervalMinutes = 4) {
  if (task) {
    task.stop();
  }

  // Cron expression: every N minutes
  const expr = `*/${intervalMinutes} * * * *`;

  task = cron.schedule(expr, async () => {
    try {
      await runAllChecks();
    } catch (err) {
      console.error('[Scheduler] Error during checks:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log(`✅ Scheduler started → every ${intervalMinutes} minute(s) (${expr})`);

  // Also run once immediately on startup
  setTimeout(() => {
    runAllChecks().catch(err => console.error('[Scheduler] Initial check failed:', err.message));
  }, 2000);
}

function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
    console.log('Scheduler stopped');
  }
}

module.exports = { startScheduler, stopScheduler };
