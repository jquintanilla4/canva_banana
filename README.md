<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1LRCJ0zSN4fC2Lt1H-aYp6qwHNY2WOh6A

## Run Locally

**Prerequisites:**  Node.js

### Setup Steps

1. **Install dependencies** (⚠️ Required - don't skip this!):
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
   - (Optional) Add `FAL_API_KEY` to target Fal.ai. This app calls the `fal-ai/nano-banana/edit` endpoint by default and accepts `FAL_API_URL` if you need to point at a different gateway.

3. **Run the app:**
   ```bash
   npm run dev
   ```

### Troubleshooting

**Error: `sh: vite: command not found`**
- This means dependencies weren't installed. Run `npm install` first before running `npm run dev`.
