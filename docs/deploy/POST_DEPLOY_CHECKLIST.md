# Post-Deployment Verification Checklist

After deploying to AWS Amplify, use this checklist to verify that the app is working correctly.

## Build & Serve

- [ ] Amplify build completed with green status (all three phases succeeded: preBuild, Build, Deploy)
- [ ] App loads at the Amplify URL without console errors (e.g., `https://main.xxxxxx.amplifyapp.com`)
- [ ] Deep-link routes resolve correctly: navigate directly to `<amplify-url>/brief` — should load the app, not return 404
- [ ] Static assets (JS, CSS, fonts) load with HTTP 200 (check Network tab in DevTools)
- [ ] No "Cannot find module" errors in the console

## Authentication

- [ ] App domain is listed in Supabase Auth's redirect URL allowlist
- [ ] Sign-in with Google works: click "Sign in" → Google popup opens → completes sign-in → redirects to `/brief`
- [ ] After successful sign-in, the app shows the user's email in the header
- [ ] Bearer token is attached to API requests (DevTools → Network → (any API call) → Request headers → `Authorization: Bearer <token>`)
- [ ] Signing out redirects to `/login` and clears the session
- [ ] Opening the app in a new tab while signed in goes directly to `/brief` (existing session is restored)
- [ ] Manually navigating to `/login` while signed in redirects to `/brief` (no sign-in loop)

## API Connectivity

- [ ] Backend health check passes: `curl -i https://<VITE_API_BASE_URL>/health` returns 200 OK
- [ ] `/brief` page loads task data from the backend (Network tab shows successful requests to `<VITE_API_BASE_URL>`)
- [ ] No CORS errors in the console (check for "Access-Control-Allow-Origin" errors)
- [ ] Capture flow works: type a task description, classify it, and proposals appear
- [ ] `/tasks` page loads the list of tasks from the backend
- [ ] Creating a new task succeeds and appears in the list

## Environment Variables

- [ ] No `VITE_DEV_TOKEN` visible in the built JavaScript (DevTools → Sources → (search for VITE_DEV_TOKEN) → should not find it)
- [ ] `VITE_AUTH_MODE` is `supabase` (not `dev`)
- [ ] Supabase URL and anon key are set and match the backend project's Auth URL
- [ ] `VITE_API_BASE_URL` is the correct Render backend URL (no typos, no trailing slash)

## Performance & Polish

- [ ] First Contentful Paint is reasonable (< 3s on a fast 4G connection in DevTools Throttling)
- [ ] No unhandled JavaScript errors in the browser console on initial load
- [ ] No "undefined is not a function" or similar runtime errors
- [ ] The app status indicator (if present) shows "API OK" or equivalent (backend is reachable and responsive)
- [ ] Slow API calls time out gracefully (no infinite spinners)

## Custom Domain (if configured)

- [ ] HTTPS certificate is issued and valid (no browser security warning, padlock icon visible)
- [ ] Root domain redirects to www (or vice versa) as configured
- [ ] Custom domain is added to Supabase Auth's redirect URL allowlist
- [ ] CORS allowlist on Render backend includes the custom domain
- [ ] `VITE_API_BASE_URL` matches the backend origin in the CORS allowlist

## Known Issues to Check

- [ ] No warnings or errors related to missing async imports or code-splitting
- [ ] No "Failed to fetch" errors on API calls (indicates backend is unreachable or CORS is blocked)
- [ ] Images and icons load correctly (no 404s in DevTools)
- [ ] Form inputs don't zoom the page on mobile (indicates meta viewport tag is correct)

---

## If Something Fails

1. **Check Amplify build logs:** Console → Deployments → (latest build) → click on the build → view logs
2. **Check browser console:** DevTools → Console tab → look for red errors
3. **Check Network tab:** DevTools → Network → filter by XHR/Fetch → look for failed requests and responses
4. **Check backend logs:** Render dashboard → (your backend service) → Logs → search for errors
5. **Verify environment variables:** Amplify Console → App settings → Environment variables → confirm all values are correct

For more troubleshooting, see the **AMPLIFY_DEPLOY.md** guide.
