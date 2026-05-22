/* FCM background handler — configure env in hosting (injected at build) or use importScripts config */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: self.__FIREBASE_API_KEY__ || "",
  authDomain: self.__FIREBASE_AUTH_DOMAIN__ || "",
  projectId: self.__FIREBASE_PROJECT_ID__ || "",
  storageBucket: self.__FIREBASE_STORAGE_BUCKET__ || "",
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || "",
  appId: self.__FIREBASE_APP_ID__ || "",
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "PlaceMint reminder";
    const body = payload.notification?.body || "";
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: payload.data || { url: "/dashboard/reminders" },
      requireInteraction: payload.data?.level === "critical" || payload.data?.level === "urgent",
    });
  });
}
