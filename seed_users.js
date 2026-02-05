/**
 * Database Seeding Script for Development/Testing
 * 
 * SECURITY NOTE: This script requires Firebase configuration from environment.
 * Do NOT hardcode Firebase credentials in this file.
 * 
 * USAGE:
 * 1. This script is designed to be run via Node.js with proper environment setup
 * 2. Alternatively, use Firebase Admin SDK for server-side seeding
 * 3. For browser testing, use the Firebase Emulator Suite
 * 
 * For production seeding, use:
 *   - Firebase Admin SDK with a service account
 *   - Cloud Functions triggered by deployment
 */

console.warn("⚠️ seed_users.js: This script requires Firebase config from environment.");
console.warn("   For production use, prefer Firebase Admin SDK or Cloud Functions.");
console.warn("   See README.md for proper seeding procedures.");

// Example structure for seeding (to be run with proper config injection):
const dummyUsers = [
    {
        id: "dummy-staff-001",
        name: "Sam Staff (Test)",
        email: "sam.staff@example.com",
        role: "STAFF",
        jobTitle: "IT Support Technician",
        avatar: "SS",
        weeklyCommitment: "",
        leadMeasureProgress: {}
    },
    {
        id: "dummy-manager-001",
        name: "Mary Manager (Test)",
        email: "mary.manager@example.com",
        role: "MANAGER",
        jobTitle: "IT Support Manager",
        avatar: "MM",
        weeklyCommitment: "",
        leadMeasureProgress: {}
    }
];

console.log("📋 Dummy users template loaded (not seeded - requires Firebase config):");
console.table(dummyUsers.map(u => ({ id: u.id, name: u.name, role: u.role })));
