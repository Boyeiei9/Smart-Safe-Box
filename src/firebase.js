import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "smart-donate-box",
  appId: "1:522734213970:web:7d2650a34dda339c61b88b",
  databaseURL: "https://smart-donate-box-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "smart-donate-box.firebasestorage.app",
  apiKey: "AIzaSyA7Ky42I-GR_ycUga2Gl75Cjjl56GlAnSY",
  authDomain: "smart-donate-box.firebaseapp.com",
  messagingSenderId: "522734213970",
  measurementId: "G-XGJWCMH9LC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
