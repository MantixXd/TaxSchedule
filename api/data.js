const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://trilaterace-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.database();

export default async function handler(req, res) {
  const { method } = req;

  try {
    if (method === 'GET') {
      const { path } = req.query;
      const snapshot = await db.ref(path || '/').once('value');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json(snapshot.val() || {});
    }

    if (method === 'POST') {
      const { path, data } = req.body;
      // Použijeme set pro specifické cesty (např. parametry) nebo push pro seznamy
      if (path.startsWith('parameters/')) {
         await db.ref(path).set(data);
         return res.status(200).json({ success: true });
      } else {
         const newRef = await db.ref(path).push(data);
         return res.status(200).json({ id: newRef.key });
      }
    }
    
    if (method === 'PUT') {
        const { path, data } = req.body;
        await db.ref(path).set(data);
        return res.status(200).json({ success: true });
    }

    if (method === 'DELETE') {
      const { path } = req.body;
      await db.ref(path).remove();
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
