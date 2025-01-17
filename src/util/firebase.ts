// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging";
import admin from "firebase-admin";

require("dotenv").config();

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

const firebaseConfig = {
    apiKey: process.env.API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
const firebaseDb = getFirestore(app);
const messaging = getMessaging(app);

if(!admin.app.length){
  const serviceAccount = require("@/service-key.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

// getToken(messaging, {vapidKey: "BBdcj6yHrGyr0Y1ijR4v_5aAqwQ8uviTW28gciILqQjUSGpMi9E-wQZi9Yv3S_G0FaOvZ789SQsObwSY30CYJzs"}).then((currentToken) => {
//     if (currentToken) {
//       // Send the token to your server and update the UI if necessary
//       // ...
//     } else {
//       // Show permission request UI
//       console.log('No registration token available. Request permission to generate one.');
//       // ...
//     }
//   }).catch((err) => {
//     console.log('An error occurred while retrieving token. ', err);
//     // ...
//   });



export { firebaseDb, messaging };