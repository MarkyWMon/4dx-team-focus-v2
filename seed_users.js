
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyCtERkXq5TuHwQJsalWeS2Y4DbMoWFjQHE",
    authDomain: "bhasvic-4dx-v2.firebaseapp.com",
    projectId: "bhasvic-4dx-v2",
    storageBucket: "bhasvic-4dx-v2.firebasestorage.app",
    messagingSenderId: "1039837804169",
    appId: "1:1039837804169:web:30f9859bbcee82c058f858"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedDummyUsers() {
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

    console.log("Seeding dummy users into Firestore...");

    for (const user of dummyUsers) {
        try {
            await setDoc(doc(db, "members", user.id), user);
            console.log(`✅ Created ${user.name} (${user.role})`);
        } catch (e) {
            console.error(`❌ Failed to create ${user.name}:`, e);
        }
    }
}

seedDummyUsers();
