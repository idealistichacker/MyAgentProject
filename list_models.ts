import { loadConfig } from './src/state/fsState.js';

async function listModels() {
  const config = loadConfig();
  console.log('Config:', { baseUrl: config.baseUrl, model: config.model });
  try {
    const res = await fetch(`${config.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      }
    });
    if (!res.ok) {
      console.error('Failed:', res.status, res.statusText, await res.text());
      return;
    }
    const data = await res.json() as any;
    console.log('Available models:', data.data?.map((m: any) => m.id));
  } catch (err) {
    console.error('Error:', err);
  }
}

listModels();
