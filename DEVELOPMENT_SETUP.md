# Development Setup Guide

This guide explains how to run both the Express server (for API/database) and Gulp watch (for development) simultaneously.

## Quick Start (Recommended)

After installing dependencies, run:

```bash
npm run dev
```

This will start both the Express server and Gulp watch automatically.

## Manual Setup (Two Terminal Windows)

If you prefer to run them separately:

### Terminal 1: Express Server
```bash
npm run server
# or
node server.js
```

This starts the Express server on `http://localhost:3000`

### Terminal 2: Gulp Watch
```bash
npm run watch
# or
gulp watch
```

This starts Browser-sync on `http://localhost:3001` which proxies to the Express server.

## Access Your Application

- **Development URL**: `http://localhost:3001` (use this for development)
  - This includes live reload and proxies to the Express server
  - All API calls will work correctly

- **Direct Server URL**: `http://localhost:3000` (Express server only)
  - Use this if you want to test without Browser-sync

## How It Works

1. **Express Server** (`server.js`) runs on port 3000
   - Serves static files from `dist/`
   - Handles API routes (`/api/tasks`, etc.)
   - Manages the SQLite database

2. **Gulp Watch** runs Browser-sync on port 3001
   - Watches for file changes in `src/`
   - Automatically rebuilds and copies files to `dist/`
   - Proxies requests to the Express server on port 3000
   - Provides live reload functionality

## Available NPM Scripts

- `npm run dev` - Run both server and watch together
- `npm run server` - Run only the Express server
- `npm run watch` - Run only Gulp watch
- `npm run build` - Build production files (no server)
- `npm start` - Run Express server (for production)

## Troubleshooting

### Port Already in Use

If you get a "port already in use" error:

1. **Find what's using the port:**
   ```bash
   # macOS/Linux
   lsof -i :3000
   lsof -i :3001
   
   # Kill the process
   kill -9 <PID>
   ```

2. **Or change the ports** in `server.js` and `gulpfile.js`

### Database Not Working

- Make sure the Express server is running
- Check that `tasks.db` file is being created in the project root
- Look at server console for database initialization messages

### Changes Not Reflecting

- Make sure Gulp watch is running
- Check that files are being copied to `dist/`
- Try manually running `npm run build` to rebuild everything

## Development Workflow

1. Start development: `npm run dev`
2. Make changes to files in `src/`
3. Gulp automatically rebuilds and Browser-sync reloads
4. Test API endpoints at `http://localhost:3001/api/tasks`
5. View your site at `http://localhost:3001`

## Notes

- The `dist/` folder is generated automatically - don't edit files there directly
- Always edit files in `src/` directory
- Database file (`tasks.db`) is created in the project root
- Browser-sync will open a browser automatically (you can disable this in gulpfile.js)
