import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyArDBUpStogSewJal2B0yCG8YROcrvwfv8",
  authDomain: "nxttopperindexdb.firebaseapp.com",
  projectId: "nxttopperindexdb",
  storageBucket: "nxttopperindexdb.firebasestorage.app",
  messagingSenderId: "1049434775497",
  appId: "1:1049434775497:web:9d03d0fa3e7a3ac8e81218"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
