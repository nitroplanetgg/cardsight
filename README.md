# CardSight Image Server

A small Node.js/Express server that accepts an image upload and forwards it to the CardSight AI API, then returns the API's response to the caller.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env with your real CARDSIGHT_API_URL and CARDSIGHT_API_KEY
```

## Run

```bash
npm start
```

Server starts on `http://localhost:3000` (or `PORT` from `.env`).

## Usage

Send a `multipart/form-data` POST request with an `image` field:

```bash
curl -F "image=@/path/to/card.jpg" http://localhost:3000/analyze
```

The server will:
1. Receive the image via `multer` (kept in memory, not written to disk).
2. Re-package it as multipart form data and POST it to `CARDSIGHT_API_URL`.
3. Return CardSight AI's JSON response back to you, with the same status code.

## Things you'll likely need to adjust

Since the exact CardSight AI API contract (endpoint path, auth scheme, field names, request/response shape) wasn't specified, `server.js` is written with clearly marked spots to adjust:

- **Auth header**: currently sends `Authorization: Bearer <key>`. If CardSight AI instead uses something like `x-api-key`, swap the header in `server.js`.
- **Upstream field name**: currently sends the image as a form field named `image`. Change this if CardSight AI expects a different field name.
- **Extra parameters**: if CardSight AI needs extra fields alongside the image (e.g. a card type, language, or mode parameter), add them to the `form.append(...)` calls.
- **Response shape**: the server currently passes through CardSight AI's raw JSON response unchanged. Add any post-processing you need in the `/analyze` handler.

## Notes

- File size limit is 10 MB by default (`multer` `limits.fileSize`); adjust in `server.js` if needed.
- Only image MIME types are accepted (rejects non-image uploads).
