# Tracecase

Tracecase turns customer bug reports into evidence-backed investigations and tested draft pull requests.

## Surfaces

- `/` — GitHub sign-in.
- `/app` — authenticated engineering dashboard.
- `/intake` — isolated public reporter iframe.
- `/tracecase-widget.js` — embeddable reporter loader.

The dashboard never links to the reporter. The reporter receives a public project key, checks its host origin, and cannot access the dashboard session.

## Start

1. Complete [ENV_SETUP.md](./ENV_SETUP.md).
2. Install and validate:

   ```powershell
   npm install
   npm run typecheck
   npm run test
   ```

3. Prepare MongoDB:

   ```powershell
   npm run mongo:plan
   $env:MONGODB_APPLY_CHANGES='true'
   npm run mongo:apply
   npm run project:bootstrap
   ```

4. Run:

   ```powershell
   npm run dev
   ```

## Embed

```html
<script src="https://YOUR-TRACECASE-DOMAIN/tracecase-widget.js" defer></script>
<tracecase-widget
  base-url="https://YOUR-TRACECASE-DOMAIN"
  project-key="YOUR-PUBLIC-PROJECT-KEY">
</tracecase-widget>
```

The widget uses the browser’s speech recognition and speech synthesis when available. Tracecase stores the transcript, not the audio. No voice-provider key is required.

## Deploy

Import the repository into Vercel, set the Root Directory to `product`, add the variables from `.env.example`, and deploy. The application uses standard Next.js commands.

Tracecase can create branches and draft pull requests. It has no merge or deploy method.
