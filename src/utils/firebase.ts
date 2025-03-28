// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAqUjqPPIJINrccI6vw0SPtkp5821bBIGg",
  authDomain: "the-gatherer-game.firebaseapp.com",
  projectId: "the-gatherer-game",
  storageBucket: "the-gatherer-game.firebasestorage.app",
  messagingSenderId: "21047439772",
  appId: "1:21047439772:web:f2cb453c2d2489947e1859",
  measurementId: "G-KF9CJCWMJL",
  databaseURL: "https://the-gatherer-game-default-rtdb.europe-west1.firebasedatabase.app",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

export { db, analytics };
