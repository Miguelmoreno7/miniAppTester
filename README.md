# Instagram Business Login App Review Demo

Demo web app for Meta App Review using **Instagram Business Login (Instagram Platform API)**.

## Features

- OAuth flow with Instagram Business Login (no Facebook Login clásico).
- Demonstrates permissions:
  - `instagram_business_content_publish`
  - `instagram_business_manage_comments`
  - `instagram_business_basic`
- Publish media via `/publish`.
- Read and reply to comments via `/comments`.
- Optional Basic Auth gate for reviewers.

## Requirements

- Node.js 18+
- Instagram App with Business Login enabled.
- Instagram Professional account connected to a Facebook Page.

## Setup

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Fill in:
   - `IG_APP_ID`
   - `IG_APP_SECRET`
   - `BASE_URL` (e.g. `http://localhost:3000`)
   - `SESSION_SECRET`
   - Optional: `REVIEW_USER` / `REVIEW_PASS` to enable Basic Auth

3. Add **Valid OAuth Redirect URIs** in Meta Developer Console:
   - `${BASE_URL}/auth/callback`
   - If your app already uses Chatwoot, keep the existing Chatwoot redirect URI as well (do not remove it).

## Run locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## Run with Docker

```bash
docker compose up --build
```

## App Review Flow (Video Script)

### Publish permission (`instagram_business_content_publish`)

1. Open home page and click **Connect**.
2. Complete Instagram Business Login.
3. After redirect, show the status **Connected as @username** on home.
4. Go to **Publish**.
5. Paste a public `image_url` and add a caption.
6. Submit and show confirmation with **Creation ID** and **Media ID**.

### Manage comments permission (`instagram_business_manage_comments`)

1. Go to **Comments**.
2. Select a recently published media from the dropdown and load comments.
3. Show the list of comments.
4. Submit a reply using the inline reply form.
5. Show confirmation that the reply was sent.

## Notes

- Ensure the Instagram Professional account is connected to a Facebook Page and has access to the app.
- The demo uses `express-session` memory store; for production, use a persistent session store.
