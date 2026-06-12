import { loadConfig } from './src/state/fsState.js';

async function testPrompt() {
  const config = loadConfig();
  console.log('Testing model:', config.model);
  const start = Date.now();
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Say hello in 5 words.' }]
      })
    });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json() as any;
      console.log('Content:', data.choices?.[0]?.message?.content);
    } else {
      console.error(await res.text());
    }
  } catch (err) {
    console.error('Error:', err);
  }
  console.log(`Took ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

testPrompt();
