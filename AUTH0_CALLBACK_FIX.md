# Fixing Auth0 400 Bad Request Error

## The Problem

You're getting a `400 (Bad Request)` error when trying to log in. This happens because Auth0 doesn't recognize your callback URL as an allowed redirect URI.

## The Solution

You need to add your callback URLs to your Auth0 Application settings.

### Step 1: Find Your Current URL

Check what URL you're running on. Common options:
- `http://localhost:3000` (if using `npm start` or `gulp watch`)
- `http://localhost:8080` (if using browser-sync from gulp)
- Your production domain

Open your browser's developer console and run:
```javascript
console.log(window.location.origin);
```

This will show you the exact URL you need to configure.

### Step 2: Configure Auth0 Dashboard

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications** → **Applications**
3. Click on your application (the one with Client ID: `o6u8lOi5D9vHePmiLftTAcZKD6cR3wzh`)
4. Scroll down to **Application URIs** section

### Step 3: Add Callback URLs

In the **Allowed Callback URLs** field, add:
```
http://localhost:3000
http://localhost:3000/*
http://localhost:8080
http://localhost:8080/*
```

**Important:** Add ALL the URLs you might use:
- If using `gulp watch`, it might be `http://localhost:3000` or `http://localhost:8080`
- If using `npm start`, it's likely `http://localhost:3000`
- Add your production domain when you deploy

**Format:** One URL per line, or comma-separated:
```
http://localhost:3000,http://localhost:3000/*,http://localhost:8080,http://localhost:8080/*
```

### Step 4: Add Logout URLs

In the **Allowed Logout URLs** field, add:
```
http://localhost:3000
http://localhost:8080
```

### Step 5: Add Web Origins

In the **Allowed Web Origins** field, add:
```
http://localhost:3000
http://localhost:8080
```

### Step 6: Save Changes

Click **Save Changes** at the bottom of the page.

### Step 7: Test Again

1. Clear your browser cache or use an incognito window
2. Try logging in again
3. The error should be resolved

## Common Issues

### Still Getting 400 Error?

1. **Check the exact URL**: Make sure the URL in your browser matches exactly what you added to Auth0 (including `http://` vs `https://`, port numbers, etc.)

2. **Check browser console**: Look for the exact redirect URI being used:
   ```javascript
   console.log(window.location.origin);
   ```

3. **Wait a few seconds**: Sometimes Auth0 takes a moment to propagate changes

4. **Check for typos**: URLs are case-sensitive and must match exactly

### Using a Different Port?

If `gulp watch` is using a different port (like 8080), check the browser-sync output in your terminal. It will show you the exact URL.

### Production Deployment

When you deploy to production, make sure to:
1. Add your production domain to all three fields (Callback URLs, Logout URLs, Web Origins)
2. Update the `redirect_uri` in your code if needed (though `window.location.origin` should work automatically)

## Quick Test

After configuring, you can test by opening your browser console and running:
```javascript
// This should show your current origin
console.log('Current origin:', window.location.origin);

// Try to get Auth0 client
window.auth0Promise.then(auth0 => {
  console.log('Auth0 initialized:', !!auth0);
}).catch(err => {
  console.error('Auth0 error:', err);
});
```

## Still Having Issues?

If you're still getting errors:
1. Check the browser's Network tab to see the exact request being made
2. Look at the error message in the console - it often tells you which URL is missing
3. Make sure you're using the correct Application (check the Client ID matches)
