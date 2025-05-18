import Database from "better-sqlite3";

let db;

export function setupDatabase() {
	db = new Database("events.db");

	// Ensure the events table has the necessary columns
	db.prepare(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      creator_id TEXT,
      title TEXT,
      description TEXT,
      time TEXT,
      duration TEXT,
      image TEXT,
      message_id TEXT,
      channel_id TEXT
    )
  `).run();

	// Auto-migrate: Ensure required columns exist in the 'events' table
	const requiredColumns = {
		id: "TEXT PRIMARY KEY",
		creator_id: "TEXT",
		title: "TEXT",
		description: "TEXT",
		time: "TEXT",
		duration: "TEXT",
		image: "TEXT",
		message_id: "TEXT",
		channel_id: "TEXT",
	};

	// Get current columns in the table
	const existingColumns = db
		.prepare("PRAGMA table_info(events)")
		.all()
		.map((col) => col.name);

	// Add missing columns
	for (const [column, type] of Object.entries(requiredColumns)) {
		if (!existingColumns.includes(column)) {
			console.log(`Adding missing column '${column}' to 'events' table...`);
			db.prepare(`ALTER TABLE events ADD COLUMN ${column} ${type}`).run();
		}
	}

	// Ensure RSVP table exists
	db.prepare(`
    CREATE TABLE IF NOT EXISTS rsvps (
      event_id TEXT,
      user_id TEXT,
      status TEXT,
      PRIMARY KEY (event_id, user_id)
    )
  `).run();

	return db;
}

export function getDatabase() {
	if (!db) {
		setupDatabase();
	}
	return db;
}

// Database operations
export function createEvent(eventData) {
	const {
		id,
		creator_id,
		title,
		description,
		time,
		duration,
		image,
		message_id,
		channel_id,
	} = eventData;

	return getDatabase()
		.prepare(`
    INSERT INTO events (id, creator_id, title, description, time, duration, image, message_id, channel_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
		.run(
			id,
			creator_id,
			title,
			description,
			time,
			duration,
			image,
			message_id,
			channel_id,
		);
}

export function updateRSVP(eventId, userId, status) {
	return getDatabase()
		.prepare(`
    INSERT INTO rsvps (event_id, user_id, status)
    VALUES (?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET status=excluded.status
  `)
		.run(eventId, userId, status);
}

export function getEvent(eventId) {
	return getDatabase()
		.prepare("SELECT * FROM events WHERE id = ?")
		.get(eventId);
}

export function getRSVPs(eventId, status) {
	return getDatabase()
		.prepare("SELECT user_id FROM rsvps WHERE event_id = ? AND status = ?")
		.all(eventId, status);
}
