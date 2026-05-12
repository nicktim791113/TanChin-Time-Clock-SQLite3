/**
 * === HTTP 明文竊聽模擬器 ===
 *
 * 這個腳本用 raw TCP socket 攔截 HTTP 封包，
 * 完整印出「攻擊者在同一個 WiFi 看到的內容」。
 *
 * 流程：
 *   curl → 本腳本 (port 4999，扮演竊聽者)
 *        → 轉發到真正的 Express 伺服器 (port 3000)
 *        → 把來回的明文全部印出來
 */

const net = require('net');

const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 3000;
const LISTEN_PORT = 4999;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const server = net.createServer((clientSocket) => {
  console.log(`\n${RED}${BOLD}${'='.repeat(70)}${RESET}`);
  console.log(`${RED}${BOLD}  [竊聽者] 攔截到一筆 HTTP 連線！${RESET}`);
  console.log(`${RED}${BOLD}${'='.repeat(70)}${RESET}\n`);

  const targetSocket = net.createConnection(TARGET_PORT, TARGET_HOST);

  // 攔截「瀏覽器 → 伺服器」的請求
  clientSocket.on('data', (data) => {
    const text = data.toString('utf8');
    console.log(`${YELLOW}${BOLD}>>> [竊聽到的請求 — 員工手機送出的內容] >>>${RESET}`);
    console.log(`${YELLOW}${text}${RESET}`);

    // 嘗試解析 JSON body 並高亮敏感欄位
    const bodyMatch = text.match(/\r\n\r\n([\s\S]+)/);
    if (bodyMatch) {
      try {
        const body = JSON.parse(bodyMatch[1]);
        console.log(`${RED}${BOLD}\n  !! 竊聽者解析出的敏感資料 !!${RESET}`);
        if (body.employeeId) console.log(`${RED}     工號: ${body.employeeId}${RESET}`);
        if (body.secret)     console.log(`${RED}     卡號/密碼: ${body.secret}${RESET}`);
        if (body.role)       console.log(`${RED}     登入角色: ${body.role}${RESET}`);
        if (body.location) {
          console.log(`${RED}     GPS 緯度: ${body.location.latitude}${RESET}`);
          console.log(`${RED}     GPS 經度: ${body.location.longitude}${RESET}`);
          console.log(`${RED}     GPS 精度: ${body.location.accuracy} 公尺${RESET}`);
        }
        console.log('');
      } catch (_) { /* not JSON */ }
    }

    // 高亮 Authorization header
    const authMatch = text.match(/Authorization:\s*Bearer\s+(\S+)/i);
    if (authMatch) {
      console.log(`${RED}${BOLD}  !! 竊聽到 Session Token: ${authMatch[1]}${RESET}`);
      console.log(`${RED}  !! 攻擊者可用此 Token 冒充該員工進行所有操作 !!${RESET}\n`);
    }

    targetSocket.write(data);
  });

  // 攔截「伺服器 → 瀏覽器」的回應
  targetSocket.on('data', (data) => {
    const text = data.toString('utf8');
    console.log(`${GREEN}${BOLD}<<< [竊聽到的回應 — 伺服器回傳的內容] <<<${RESET}`);
    console.log(`${GREEN}${text}${RESET}`);

    const bodyMatch = text.match(/\r\n\r\n([\s\S]+)/);
    if (bodyMatch) {
      try {
        const body = JSON.parse(bodyMatch[1]);
        if (body.token) {
          console.log(`${RED}${BOLD}\n  !! 竊聽到伺服器發出的 Session Token !!${RESET}`);
          console.log(`${RED}     Token: ${body.token}${RESET}`);
          console.log(`${RED}     攻擊者現在可以偽裝成這位員工了！${RESET}\n`);
        }
        if (body.dashboard?.profile) {
          const p = body.dashboard.profile;
          console.log(`${RED}${BOLD}\n  !! 竊聽到的員工個人資料 !!${RESET}`);
          if (p.name) console.log(`${RED}     姓名: ${p.name}${RESET}`);
          if (p.department) console.log(`${RED}     部門: ${p.department}${RESET}`);
          if (p.national_id) console.log(`${RED}     身份證字號: ${p.national_id}${RESET}`);
          if (p.bank_account) console.log(`${RED}     銀行帳號: ${p.bank_account}${RESET}`);
          if (p.mobile_phone) console.log(`${RED}     手機號碼: ${p.mobile_phone}${RESET}`);
          console.log('');
        }
      } catch (_) { /* not JSON */ }
    }

    clientSocket.write(data);
  });

  targetSocket.on('error', (err) => {
    console.log(`${RED}[竊聽者] 無法連接到 Express 伺服器 (port ${TARGET_PORT}): ${err.message}${RESET}`);
    console.log(`${CYAN}提示: 請確保 Electron 應用程式正在執行中${RESET}`);
    clientSocket.end();
  });

  clientSocket.on('error', () => targetSocket.end());
  targetSocket.on('end', () => clientSocket.end());
  clientSocket.on('end', () => targetSocket.end());
});

server.listen(LISTEN_PORT, () => {
  console.log(`${CYAN}${BOLD}`);
  console.log('='.repeat(70));
  console.log('  HTTP 明文竊聽模擬器 已啟動');
  console.log(`  監聽 port ${LISTEN_PORT}，轉發到 Express port ${TARGET_PORT}`);
  console.log('='.repeat(70));
  console.log(RESET);
  console.log(`${CYAN}現在請在另一個終端機執行以下指令來模擬攻擊：${RESET}\n`);
  console.log(`${BOLD}  模擬 1) 竊聽「員工登入」：${RESET}`);
  console.log(`  curl -X POST http://127.0.0.1:${LISTEN_PORT}/api/browser/login \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d "{\\"role\\":\\"employee\\",\\"employeeId\\":\\"EMP001\\",\\"secret\\":\\"A12345\\"}"\n`);
  console.log(`${BOLD}  模擬 2) 竊聽「帶 GPS 的打卡」：${RESET}`);
  console.log(`  curl -X POST http://127.0.0.1:${LISTEN_PORT}/api/browser/punch \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "Authorization: Bearer <貼上登入取得的token>" \\`);
  console.log(`    -d "{\\"location\\":{\\"latitude\\":25.0330,\\"longitude\\":121.5654,\\"accuracy\\":15,\\"capturedAt\\":${Date.now()}}}"\n`);
  console.log(`${YELLOW}等待攔截中...${RESET}\n`);
});
