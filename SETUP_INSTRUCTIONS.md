# Setup Instructions for GitHub Pages Portfolio

Follow these steps EXACTLY:

## 1. First, delete your current repository and create a new one
- Go to https://github.com/RRocaP/Portfolio
- Click Settings → Scroll down to "Danger Zone" → Delete this repository
- Create a new repository named "Portfolio" (make it public)

## 2. Copy these files to your Portfolio repository

All the files in this `portfolio-fix` directory are ready to use:
- package.json
- astro.config.mjs
- .gitignore
- src/pages/index.astro
- .github/workflows/deploy.yml

## 3. Push to GitHub

```bash
cd /Users/ramon/projects/oncolyticsAI/portfolio-fix
git init
git add .
git commit -m "Initial portfolio setup"
git branch -M main
git remote add origin https://github.com/RRocaP/Portfolio.git
git push -u origin main
```

## 4. Enable GitHub Pages

1. Go to your repository settings: https://github.com/RRocaP/Portfolio/settings/pages
2. Under "Source", select "GitHub Actions" (not "Deploy from a branch")
3. Click Save

## 5. Wait for deployment

1. Go to https://github.com/RRocaP/Portfolio/actions
2. You should see a workflow running
3. Wait for it to complete (green checkmark)
4. Your site will be live at: https://RRocaP.github.io/Portfolio/

## If it still doesn't work:

Run this command to check the deployment:
```bash
curl -I https://RRocaP.github.io/Portfolio/
```

If you get a 404, wait 5 more minutes and try again.