// Backfill dailyScreenTime, dailyVideoTime, and dailyNotesTime for existing students
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyArDBUpStogSewJal2B0yCG8YROcrvwfv8",
  authDomain: "nxttopperindexdb.firebaseapp.com",
  projectId: "nxttopperindexdb",
  storageBucket: "nxttopperindexdb.firebasestorage.app",
  messagingSenderId: "1049434775497",
  appId: "1:1049434775497:web:9d03d0fa3e7a3ac8e81218"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function backfill() {
  console.log('Starting historical data migration...');
  const studentsSnap = await getDocs(collection(db, 'students'));
  console.log(`Found ${studentsSnap.size} students.`);

  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data();
    console.log(`Processing student: ${student.name} (${studentDoc.id})`);

    const logsSnap = await getDocs(collection(db, 'students', studentDoc.id, 'logs'));
    console.log(`  Found ${logsSnap.size} logs.`);

    const dailyVideo = {};
    const dailyNotes = {};
    const dailyScreen = {};
    const logsByDate = {};

    logsSnap.docs.forEach(lDoc => {
      const log = lDoc.data();
      const dateKey = (log.timestamp || '').slice(0, 10);
      if (!dateKey) return;

      if (!logsByDate[dateKey]) logsByDate[dateKey] = [];
      logsByDate[dateKey].push(log);

      if (log.type === 'watch') {
        dailyVideo[dateKey] = (dailyVideo[dateKey] || 0) + (log.durationSecs || 0);
      } else if (log.type === 'notes') {
        dailyNotes[dateKey] = (dailyNotes[dateKey] || 0) + (log.durationSecs || 0);
      }
    });

    // Estimate daily screen time distribution based on activity log density
    const totalLogs = logsSnap.size;
    const totalScreenSecs = student.totalScreenTime || 0;

    Object.keys(logsByDate).forEach(dateKey => {
      const dayLogs = logsByDate[dateKey];
      const ratio = totalLogs > 0 ? dayLogs.length / totalLogs : 1;
      dailyScreen[dateKey] = Math.round(totalScreenSecs * ratio);
    });

    // If no logs, but has screen time and lastActive, assign to lastActive date
    if (Object.keys(dailyScreen).length === 0 && totalScreenSecs > 0) {
      const activeDate = (student.lastActive || new Date().toISOString()).slice(0, 10);
      dailyScreen[activeDate] = totalScreenSecs;
    }

    console.log('  Calculated dailyScreen:', dailyScreen);
    console.log('  Calculated dailyVideo:', dailyVideo);
    console.log('  Calculated dailyNotes:', dailyNotes);

    await updateDoc(doc(db, 'students', studentDoc.id), {
      dailyScreenTime: dailyScreen,
      dailyVideoTime: dailyVideo,
      dailyNotesTime: dailyNotes
    });
    console.log(`  Updated student ${student.name} successfully.`);
  }

  console.log('Migration completed successfully!');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
