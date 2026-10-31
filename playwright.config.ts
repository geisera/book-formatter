import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:"./tests",
 testMatch:"*.spec.ts",
 timeout:120000,
 expect:{timeout:12000},
 workers:process.env.CI?2:undefined,
 use:{baseURL:"http://127.0.0.1:3100"},
 webServer:{command:"python3 -m http.server 3100 --directory out",url:"http://127.0.0.1:3100",reuseExistingServer:false},
});
