# Quick Start Guide

For Supabase Auth + new project credentials, complete **[README_SETUP.md](./README_SETUP.md)** first.

## Start the Server

### Option 1: Run Both Server and Gulp Watch Together (Recommended)
```bash
npm run dev
```

This will:
- Start the Express server on port 3000
- Start Gulp watch with Browser-sync on port 3001
- Access your site at: `http://localhost:3001`

### Option 2: Run Separately

**Terminal 1 - Server:**
```bash
npm run server
```

**Terminal 2 - Gulp Watch:**
```bash
npm run watch
```

## First Time Setup

If you haven't set up yet:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start development:**
   ```bash
   npm run dev
   ```

## Check if Server is Running

Look for this message in your terminal:
```
Server is running on port 3000
Access your site at: http://localhost:3000
```

## Common Issues

### "Cannot find module" error
```bash
npm install
```

### "dist folder not found" error
```bash
npm run build
```

### Port already in use
Kill the process using the port:
```bash
# Find what's using port 3000
lsof -ti:3000

# Kill it (replace PID with the number from above)
kill -9 <PID>
```

### Database errors
The database file (`tasks.db`) will be created automatically when the server starts.

## Access Your Site

- **Development URL**: `http://localhost:3001` (includes live reload)
- **Direct Server**: `http://localhost:3000` (Express server only)
