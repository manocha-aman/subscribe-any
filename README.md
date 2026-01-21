# Subscribe Any

A browser extension that helps you convert one-time purchases into subscriptions by detecting orders and sending reorder reminders.

## Features

- **AI-Powered Order Detection**: Automatically detects order confirmation pages on any e-commerce site
- **Smart Reminders**: Get browser notifications when it's time to reorder
- **Email Reminders**: Optional email notifications for items due for reorder
- **Cross-Device Sync**: Your subscriptions sync across devices via Supabase
- **Privacy-Focused**: Your data is stored securely with row-level security

## Project Structure

```
subscribe-any/
├── extension/              # Chrome extension
│   ├── src/
│   │   ├── popup/         # Extension popup UI (React)
│   │   ├── content/       # Content script for page detection
│   │   ├── background/    # Service worker
│   │   ├── lib/           # Core business logic
│   │   └── types/         # TypeScript types
│   ├── e2e/               # Playwright E2E tests
│   └── manifest.json      # Chrome extension manifest
├── supabase/              # Backend
│   ├── migrations/        # Database schema
│   └── functions/         # Edge functions (email reminders)
└── README.md
```

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)
- (Optional) OpenAI or Anthropic API key for AI-powered detection

## Setup

### 1. Clone and Install Dependencies

```bash
cd extension
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migration to create tables:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to your project
   supabase link --project-ref YOUR_PROJECT_REF

   # Run migrations
   supabase db push
   ```

3. Get your Supabase URL and anon key from Project Settings > API

### 3. Configure Environment Variables

Create `extension/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Build the Extension

```bash
npm run build
```

### 5. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder

## Development

### Run Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Build for Development

```bash
npm run dev
```

### E2E Tests

```bash
npm run test:e2e
```

## Configuration

### AI Provider Setup (Optional)

The extension can use AI to analyze order pages more accurately. Configure in the extension settings:

1. **OpenAI**: Get API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. **Claude**: Get API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

Without an AI provider, the extension uses heuristic detection which works on most major retailers.

### Email Reminders

To enable email reminders:

1. Set up [Resend](https://resend.com) (free tier: 3000 emails/month)
2. Add `RESEND_API_KEY` to your Supabase Edge Function secrets
3. Deploy the edge function:
   ```bash
   supabase functions deploy send-reminders
   ```
4. Set up a cron job to trigger daily:
   ```bash
   supabase functions schedule send-reminders --cron "0 9 * * *"
   ```

## How It Works

1. **Detection**: When you visit an order confirmation page, the content script analyzes the URL and page content
2. **Analysis**: If heuristics suggest it's an order page, it's sent to the AI (if configured) for detailed analysis
3. **Prompt**: A non-intrusive popup appears asking if you want to subscribe to reorder reminders
4. **Storage**: Subscriptions are stored in Supabase with your account
5. **Reminders**: The service worker checks for due reminders and sends browser notifications
6. **Email**: (Optional) Daily edge function sends email digests of due items

## Tech Stack

- **Extension**: React + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Testing**: Vitest + Playwright
- **AI**: OpenAI GPT-4o Mini or Claude Haiku (optional)

## Privacy

- All data is stored in your Supabase project (you control it)
- API keys are stored locally in Chrome's secure storage
- Page content is only sent to AI APIs when you have them configured
- Row-level security ensures users only see their own data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

MIT
