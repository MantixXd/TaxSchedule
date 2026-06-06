const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || "https://trilaterace-default-rtdb.europe-west1.firebasedatabase.app"
    });
  } catch (e) {
    console.error("Chyba při inicializaci Firebase Admin:", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body;
  
  // Custom domain for the tax app
  const email = username.includes('@') ? username : `${username}@tax.schedule`;
  
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    console.error("Chybí FIREBASE_API_KEY v environment variables!");
    return res.status(500).json({ success: false, message: "Server configuration error (API Key missing)." });
  }

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(401).json({ 
        success: false, 
        message: data.error.message
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Auth handler error:", error);
    res.status(500).json({ error: error.message });
  }
}
