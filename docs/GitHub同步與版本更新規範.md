# GitHub 同步與版本更新規範

本規範適用於 TanChin-Time-Clock-SQLite3，每次修改都須同時參照 `docs/更新紀錄.md`、`docs/快速部署還原說明.md`、完整使用手冊與本次功能的操作說明。依使用者 2026-10-17 指示整理。

## 開工前

1. 核對目前專案根目錄與 `package.json` 名稱。
2. 執行 `git status --short --branch`。有任何非本次作業產生的未提交變更即停止回報，不強制覆蓋。
3. 檢查 `git remote -v`；origin 必須是 `nicktim791113/TanChin-Time-Clock-SQLite3`。
4. 執行 `git pull --ff-only`。失敗、衝突或無法快轉即停止回報，不使用 reset、強制 pull 或 force push。

## 修改與版本

- 小修正與 bug 修復升 patch；新增功能或較大改善升 minor；不相容大改升 major。
- 同步 `package.json`、`package-lock.json` 根與 packages 根版號、`package.json.txt` 參考設定及完整手冊的適用版本；動態版號取自 `app.getVersion()`。
- 修改瀏覽器資產後更新 `browser-client/index.html` 的快取標記。
- 在 `docs/更新紀錄.md` 最上方新增台北當日日期、版號、實際完成內容。清楚區分新增、修正、調整、驗證、備份與部署。
- 同步 `browser-client/release-notes.json`，每次發版整理使用者看得懂的重點。頁首版號按鈕以此顯示歷次更新；同版不同日期不得刪掉。不要放入實際營運資料、帳密、金鑰或私人路徑。
- 每次新增／變更頁面，同步更新頁內操作說明的流程、各欄位／按鈕與常見疑問，以及 `docs` 操作文件。

## 驗證與備份

1. 檢查 `git diff` 與 Git 狀態，依改動執行測試。介面修改需實測互動、桌機與手機、錯誤訊息及無資料狀態。
2. 使用隔離假資料與獨立 userData 啟動測試，不對營運 SQLite 執行測試或遷移。
3. `npm test`、`npm run build`；核對安裝檔與 app.asar 版號、來源一致性、封裝排除檔案，並隔離啟動封裝版。
4. 執行指定備份：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\backup-core-assets.ps1"
```

5. 預設輸出至 `C:\Users\nickt\OneDrive\Developer 公司系統\TanChin-Time-Clock-SQLite3 原始資料`。核對 ZIP 的 manifest、來源雜湊、缺漏項目與更新紀錄。新增根目錄後端模組必須同步加入備份腳本。若備份包含營運資料庫，須明確回報實際來源；正式上線另做一致性的完整 SQLite 備份。

## 提交與交付

確認 Git 不追蹤 `node_modules/`、`dist/`、實際資料庫、log、`.env`、密碼或金鑰，然後：

```powershell
git add -A
git diff --cached --check
git commit -m "v版本號：本次修改摘要"
git push
```

最後核對遠端 SHA 與本機一致、工作目錄乾淨。回報新版本與完成內容、備份完整路徑及名稱、更新紀錄位置、commit 訊息與 SHA、push 結果及安裝檔位置。安裝檔在 `dist/`，不加入 Git。

GitHub push 不代表正式打卡鐘已安裝或服務已重啟。部署須另外確認真正主機、備份 SQLite 與 WebCredentials、更新並重啟，再查 `/api/browser/health` 版號與實際操作。不宣稱尚未驗證的正式部署成功。
