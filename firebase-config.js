// Firebase 設定範本
// 請在 Firebase 控制台建立專案並取得以下資訊
// 控制台網址: https://console.firebase.google.com/

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: 將下方的內容替換為你在 Firebase 控制台取得的專案設定
const firebaseConfig = {
  apiKey: "AIzaSyC3NL1rNshbNXtt7qcrzY3VKpadeD9EcqE",
  authDomain: "my-simple-app-ec1b2.firebaseapp.com",
  projectId: "my-simple-app-ec1b2",
  storageBucket: "my-simple-app-ec1b2.firebasestorage.app",
  messagingSenderId: "944596520074",
  appId: "1:944596520074:web:fdb1921ce9df564c97b173"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 匯出各項服務實例
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
