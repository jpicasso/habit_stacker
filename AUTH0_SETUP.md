# Auth0 Setup Guide

This guide will help you set up Auth0 authentication for your UpriseU application.

## Step 1: Create an Auth0 Account

1. Go to [https://auth0.com](https://auth0.com) and sign up for a free account
2. Complete the registration process

## Step 2: Create an Application

1. In your Auth0 Dashboard, go to **Applications** → **Applications**
2. Click **Create Application**
3. Choose **Single Page Web Applications** as the application type
4. Click **Create**

## Step 3: Configure Your Application

1. In your application settings, find the following:
   - **Domain**: This is your Auth0 domain (e.g., `your-tenant.auth0.com`)
   - **Client ID**: This is your application's client ID

2. Scroll down to **Allowed Callback URLs** and add:
   ```
   http://localhost:3000
   http://localhost:3000/*
   ```
   (Replace with your production URLs when deploying)
   ```
   https://uprise-u-dot-com-718662ca0e08.herokuapp.com/, https://upriseu.com, https://upriseu.com/*, https://www.upriseu.com, https://www.upriseu.com/*, http://upriseu.com, http://upriseu.com/*, http://www.upriseu.com, http://www.upriseu.com/*
   ```

3. Scroll down to **Allowed Logout URLs** and add:
   ```
   http://localhost:3000
   ```
   (Replace with your production URLs when deploying)

4. Scroll down to **Allowed Web Origins** and add:
   ```
   http://localhost:3000
   ```
   (Replace with your production URLs when deploying)

5. Click **Save Changes**

## Step 4: Update Your Configuration

1. Open `src/js/auth0-config.js`
2. Replace the placeholder values:
   ```javascript
   const AUTH0_CONFIG = {
     domain: 'YOUR_AUTH0_DOMAIN', // Replace with your Auth0 domain
     clientId: 'YOUR_AUTH0_CLIENT_ID', // Replace with your Client ID
     authorizationParams: {
       redirect_uri: window.location.origin
     }
   };
   ```

   Example:
   ```javascript
   const AUTH0_CONFIG = {
     domain: 'myapp.auth0.com',
     clientId: 'abc123xyz456',
     authorizationParams: {
       redirect_uri: window.location.origin
     }
   };
   ```

## Step 5: Test Your Setup

1. Run your development server:
   ```bash
   gulp watch
   # or
   npm start
   ```

2. Navigate to your site and click the **Login** button
3. You should be redirected to Auth0's login page
4. After logging in, you'll be redirected back to your site
5. The **Login** button should be replaced with a **Logout** button

## Step 6: Protect Private Pages (Optional)

To protect specific pages (like `private.html`), you can add authentication checks:

```javascript
// In your page or a script that runs on private pages
async function checkAuth() {
  const auth0 = await window.auth0Promise;
  const isAuthenticated = await auth0.isAuthenticated();
  
  if (!isAuthenticated) {
    // Redirect to login or show an error
    window.location.href = '/';
    alert('Please log in to access this page');
  }
}

// Call this when the page loads
checkAuth();
```

## Using Auth0 in Your Code

### Check if user is authenticated:
```javascript
const auth0 = await window.auth0Promise;
const isAuthenticated = await auth0.isAuthenticated();
```

### Get user information:
```javascript
const auth0 = await window.auth0Promise;
const user = await auth0.getUser();
console.log(user); // User profile information
```

### Make authenticated API calls:
```javascript
// Use window.auth0Fetch instead of regular fetch
const response = await window.auth0Fetch('/api/protected-endpoint', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

## Troubleshooting

### Login button doesn't work
- Check the browser console for errors
- Verify your Auth0 configuration values are correct
- Make sure the Auth0 SDK script is loading (check Network tab)

### Redirect not working
- Verify your callback URLs are set correctly in Auth0 Dashboard
- Check that `redirect_uri` matches one of your allowed callback URLs

### User not staying logged in
- Check browser console for errors
- Verify cookies/localStorage are not being blocked
- Make sure you're not in incognito/private mode

## Production Deployment

When deploying to production:

1. Update the callback URLs in Auth0 Dashboard to include your production domain
2. Update the logout URLs to include your production domain
3. Update the web origins to include your production domain
4. Consider using environment variables for your Auth0 configuration instead of hardcoding values

## Additional Resources

- [Auth0 Documentation](https://auth0.com/docs)
- [Auth0 SPA SDK](https://auth0.com/docs/libraries/auth0-spa-js)
- [Auth0 Quick Start Guide](https://auth0.com/docs/quickstart/spa)
