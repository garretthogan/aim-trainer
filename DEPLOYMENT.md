# Deployment Guide

This project is configured to automatically deploy to GitHub Pages using GitHub Actions.

## Initial Setup

### 1. Create a GitHub Repository

```bash
# Create a new repository on GitHub (via web interface or CLI)
# Repository name: aim-trainer
```

### 2. Connect Your Local Repository

```bash
# Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/aim-trainer.git

# Rename branch to main if needed
git branch -M main

# Push to GitHub
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**

That's it! Your site will automatically deploy whenever you push to the `main` branch.

## Repository Configuration

The deployment is configured with the following base path: `/aim-trainer/`

If you name your repository something different, update `vite.config.js`:

```javascript
base: process.env.NODE_ENV === 'production' ? '/YOUR-REPO-NAME/' : '/',
```

## Deployment Workflow

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will:

1. Trigger on every push to `main` branch
2. Install dependencies
3. Build the project with Vite
4. Deploy the `dist` folder to GitHub Pages

## Manual Deployment

You can also trigger a deployment manually:

1. Go to **Actions** tab in your GitHub repository
2. Select **Deploy to GitHub Pages** workflow
3. Click **Run workflow**

## Local Development

The base path is automatically set to `/` for local development:

```bash
npm run dev
```

## Build Locally

To test the production build locally:

```bash
npm run build
npm run preview
```

## View Your Site

After the first successful deployment, your site will be available at:

```
https://YOUR_USERNAME.github.io/aim-trainer/
```

## Troubleshooting

### 404 Errors on Deployment

- Make sure GitHub Pages is enabled in repository settings
- Check that the base path in `vite.config.js` matches your repository name
- Wait a few minutes for the deployment to complete

### Assets Not Loading

- Verify the base path in `vite.config.js` matches your repository name
- Check the browser console for 404 errors
- Ensure all asset paths are relative

### Deployment Failed

- Check the **Actions** tab for error messages
- Verify `package.json` has all required dependencies
- Ensure `npm run build` works locally

## Custom Domain

To use a custom domain:

1. Add a `CNAME` file to the `public` folder with your domain
2. Configure DNS settings with your domain provider
3. Enable custom domain in GitHub Pages settings

## Updating

To update your deployed site:

```bash
git add .
git commit -m "Your commit message"
git push
```

The site will automatically redeploy!
