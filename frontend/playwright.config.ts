import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  fullyParallel:true,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',...devices['Desktop Chrome']},
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4173',
    cwd:'.',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,
    timeout:120000,
    env:{...process.env,VITE_CLAUSEBID_ADDRESS:'0x9999999999999999999999999999999999999999',VITE_E2E_FIXTURE:'true'},
  },
});
