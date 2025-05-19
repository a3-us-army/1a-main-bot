// utils/reminderSystem.js
import { getDatabase } from "./database.js";
import { sendAutomaticReminder } from "../commands/events/remind-event.js";

// Store reminders that have already been sent to avoid duplicates
const sentReminders = new Set();

// Check for upcoming events and send reminders
export async function checkAndSendReminders(client) {
	try {
		const db = getDatabase();
		const currentTime = Math.floor(Date.now() / 1000);

		// Look for events happening in about 1 hour (3600 seconds)
		// Use a smaller buffer to reduce chance of duplicates
		const reminderTime = currentTime + 3600;
		const bufferStart = reminderTime - 120; // 2 minutes before
		const bufferEnd = reminderTime + 120; // 2 minutes after

		// Get events that need reminders
		const events = db
			.prepare(`
        SELECT * FROM events 
        WHERE time BETWEEN ? AND ?
        ORDER BY time ASC
      `)
			.all(bufferStart, bufferEnd);

		console.log(
			`Checking reminders: Found ${events.length} events happening in ~1 hour`,
		);

		// Send reminders for each event
		for (const event of events) {
			// Skip if reminder was already sent
			const reminderKey = `reminder_${event.id}`;
			if (sentReminders.has(reminderKey)) {
				console.log(`Skipping reminder for event ${event.id} - already sent`);
				continue;
			}

			console.log(`Sending reminder for event: ${event.title} (${event.id})`);

			// Send the reminder
			await sendAutomaticReminder(client, event);

			// Mark as sent in both memory and database
			sentReminders.add(reminderKey);

			// Add a record in the database that this reminder was sent
			// This ensures reminders aren't duplicated even if the bot restarts
			try {
				// First check if we need to create the reminders table
				db.prepare(`
          CREATE TABLE IF NOT EXISTS sent_reminders (
            event_id TEXT PRIMARY KEY,
            sent_at INTEGER
          )
        `).run();

				// Then record that we sent this reminder
				db.prepare(`
          INSERT OR REPLACE INTO sent_reminders (event_id, sent_at)
          VALUES (?, ?)
        `).run(event.id, currentTime);
			} catch (dbError) {
				console.error("Error recording sent reminder:", dbError);
			}
		}
	} catch (error) {
		console.error("Error checking for event reminders:", error);
	}
}

// Load already sent reminders from database on startup
function loadSentReminders() {
	try {
		const db = getDatabase();

		// Create the table if it doesn't exist
		db.prepare(`
      CREATE TABLE IF NOT EXISTS sent_reminders (
        event_id TEXT PRIMARY KEY,
        sent_at INTEGER
      )
    `).run();

		// Load existing reminders into memory
		const existingReminders = db
			.prepare("SELECT event_id FROM sent_reminders")
			.all();

		for (const reminder of existingReminders) {
			sentReminders.add(`reminder_${reminder.event_id}`);
		}

		console.log(`Loaded ${existingReminders.length} previously sent reminders`);

		// Clean up old reminders (older than 24 hours)
		const cleanupTime = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
		db.prepare("DELETE FROM sent_reminders WHERE sent_at < ?").run(cleanupTime);
	} catch (error) {
		console.error("Error loading sent reminders:", error);
	}
}

// Initialize the reminder system
export function setupReminderSystem(client) {
	// Load existing reminders first
	loadSentReminders();

	// Use a single interval reference to prevent multiple intervals
	let reminderInterval = null;

	// Clear any existing interval just to be safe
	if (reminderInterval) {
		clearInterval(reminderInterval);
	}

	// Check for reminders every minute
	reminderInterval = setInterval(
		() => checkAndSendReminders(client),
		60 * 1000,
	);

	console.log("Event reminder system initialized");
}
