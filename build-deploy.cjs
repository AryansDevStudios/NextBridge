const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT_DIR = __dirname;
const STUDENT_APP_DIR = ROOT_DIR;
const ADMIN_APP_DIR = path.join(ROOT_DIR, 'admin-panel');
const DEPLOY_DIR = path.join(ROOT_DIR, 'deploy_dist');

async function buildAndConsolidate() {
  console.log('--- Starting Unified Build Process ---');

  // 1. Clean deploy directory
  console.log('Cleaning deploy directory...');
  await fs.emptyDir(DEPLOY_DIR);

  // 2. Build Student App
  console.log('Building Student App...');
  execSync('npm run build', { cwd: STUDENT_APP_DIR, stdio: 'inherit' });

  // 3. Build Admin Panel
  console.log('Building Admin Panel...');
  execSync('npm install', { cwd: ADMIN_APP_DIR, stdio: 'inherit' });
  execSync('npm run build', { cwd: ADMIN_APP_DIR, stdio: 'inherit' });

  // 4. Organize Deploy Folder
  console.log('Organizing Deployment Folder...');
  
  // A. Student App -> Root of DEPLOY_DIR
  await fs.copy(path.join(STUDENT_APP_DIR, 'dist'), DEPLOY_DIR);

  // B. Admin Panel -> /admin
  const adminDeployPath = path.join(DEPLOY_DIR, 'admin');
  await fs.copy(path.join(ADMIN_APP_DIR, 'dist'), adminDeployPath);

  // C. Student App -> /buildcode (for OTA)
  const buildcodePath = path.join(DEPLOY_DIR, 'buildcode');
  await fs.ensureDir(buildcodePath);
  
  // Zip the student app for OTA download
  console.log('Zipping Student App for OTA updates...');
  const zipPath = path.join(buildcodePath, 'update.zip');
  await zipDirectory(path.join(STUDENT_APP_DIR, 'dist'), zipPath);

  // Create a version file based on app version and timestamp
  const pkg = await fs.readJson(path.join(STUDENT_APP_DIR, 'package.json'));
  const currentAppVersion = pkg.version || '2.6.2';
  const version = `${currentAppVersion}-${Date.now()}`;
  await fs.writeJson(path.join(buildcodePath, 'version.json'), {
    version: version,
    appVersion: currentAppVersion,
    url: '/buildcode/update.zip',
    releaseDate: new Date().toISOString()
  });

  // D. Netlify _redirects to handle SPA routing
  const redirects = `
/admin/* /admin/index.html 200
/* /index.html 200
  `.trim();
  await fs.writeFile(path.join(DEPLOY_DIR, '_redirects'), redirects);

  console.log('--- Unified Build Complete! ---');
  console.log('The "deploy_dist" folder is ready for Netlify.');
}

function zipDirectory(sourceDir, outPath) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(outPath);
  return Promise.resolve();
}

buildAndConsolidate().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
