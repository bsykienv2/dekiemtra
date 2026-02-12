// api/uploadImage.js
export default async function handler(req, res) {
  // CORS (tùy chọn, nhưng nên có)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { imageData, fileName } = req.body || {};
    if (!imageData || !String(imageData).startsWith('data:image')) {
      return res.status(400).json({ status: 'error', message: 'Invalid imageData' });
    }

    // ✅ URL Apps Script của bạn
    const GOOGLE_SCRIPT_URL =
      'https://script.google.com/macros/s/AKfycbxDZOQYYtoaRIpYc77cUGiIDzLmKZ9YhDHW7c6pD1BOSxA4h3xy8zUDVyEVd1wZnQM/exec';

    // Forward sang Apps Script
    const upstream = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadImage',
        imageData,
        fileName: fileName || `image_${Date.now()}.png`,
      }),
    });

    const text = await upstream.text();

    // Apps Script của bạn trả JSON string: {status,data,message}
    // Trả nguyên văn về client
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
}
