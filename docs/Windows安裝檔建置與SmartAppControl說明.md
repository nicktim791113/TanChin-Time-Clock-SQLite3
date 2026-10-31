# Windows 安裝檔建置與 Smart App Control 說明

日期：2026-10-31；適用版本：v1.46.1。本文記錄本機唯讀診斷與專案建置方案，不代表正式服務已更新。

## 已確認的阻擋原因

2026-10-31 10:28:55（臺北時間），Windows CodeIntegrity Operational 同時記錄 3033、3077 與簽章資訊事件 3089：

| 項目 | 實際證據 |
| --- | --- |
| 發起程序 | node.exe（electron-builder 建置程序） |
| 被阻擋檔案 | dist/TanChin-Time-Clock-SQLite3 Setup 1.46.1.exe，當時為產生解除安裝程式用的暫存 helper，非完成的安裝檔 |
| PolicyGUID | {0283ac0f-fff1-49ae-ada1-8a933130cad6} |
| PolicyName | VerifiedAndReputableDesktop |
| 政策版本 | 27555.1000.240208 |
| 政策 SHA256 | 2668895A5B233A80432D00D67251D7B7F52686A3FB13780F4B242C5A1F937A01 |
| 3077 簽章層級 | Requested Signing Level 2；Validated Signing Level 1 |
| 失敗狀態 | 0xc0e90002 |
| 3089 | TotalSignatureCount 0、PublisherName Unknown |

Microsoft 文件將 VerifiedAndReputableDesktop 列為 Smart App Control 的強制執行政策名稱；3077 是 App Control 政策實際封鎖的事件。訊息中的「Enterprise signing」是 Code Integrity 的簽章要求用語，不能單憑此字樣認定公司 IT 剛部署了新的企業自訂政策。

官方參考：[Smart App Control 測試及政策識別](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/test-your-app-with-smart-app-control)、[App Control 除錯與事件判讀](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/appcontrol-debugging-and-troubleshooting)。

## 當時防護狀態及時間比較

唯讀取得的狀態如下：SmartAppControlState 為 On；VerifiedAndReputablePolicyState 為 1；DeviceGuard 的 CodeIntegrityPolicyEnforcementStatus 與 UsermodeCodeIntegrityPolicyEnforcementStatus 均為 2。Microsoft Defender 為 Normal 模式，防毒、即時防護、行為監控及 IOAV 均啟用。診斷未停用或變更上述狀態。

v1.46.0 在約 10:04 完成 NSIS 建置，而 v1.46.1 在約 10:28 遭阻擋。但這不等於中間政策被打開或改版：

- 10:00–10:35 沒有查到 3099 政策載入事件。
- 此 GUID 最近一筆成功載入為 10 月 24 日 13:31:45；版本與雜湊和本次 3077 相同，10 月 14 日載入紀錄也相同。
- 此時窗未查到 Defender 的設定變更、更新或偵測事件（本次查詢 IDs 5007、2000、2001、1116、1117）。這只是該範圍的查詢結果，不是完整防護系統歷史證明。
- 唯讀 Authenticode 檢查顯示：v1.46.0 完成的 Setup 與 v1.46.1 被阻擋的暫存 helper 都是 NotSigned。因此不能說前版因「已有簽章」才成功。
- CiTool 政策清單讀取回覆 0x80070005（拒絕存取），本次未提權，故未取得完整現行政策清單；政策名稱及狀態來自事件與狀態查詢的交叉核對。

已確認的是該次未簽章 helper 被 SAC／App Control 封鎖。尚無證據證明兩次建置間政策內容改變；也不能斷言是雲端信譽、快取、判定服務或暫存二進位差異造成。Microsoft 說明 SAC 會結合應用程式信譽與簽章，但本機事件沒有揭露足以判定本次前後差異的雲端決策細節。見 [Smart App Control 概述](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)。

## 專案建置方案：靜態取得解除安裝程式

專案提供 scripts/build-installer.js 作為建置入口，配合 scripts/nsis-static-uninstaller.cjs。它使用安裝依賴內 electron-builder 官方的 UninstallerReader 解析產生中的 NSIS helper，靜態取得解除安裝程式，避免為了這個建置步驟執行暫存 PE。

這是專案持有的建置調整，不修改 node_modules，也不修改 Windows 安全政策、白名單或防護設定。保留 stock NSIS installer／uninstaller 範本、簽章呼叫及升級流程；沒有以自訂 installer script 取代完整安裝邏輯。保留簽章流程不等於本專案已配置簽章憑證，產物是否有有效簽章仍須另驗。

官方來源參考：[24.13.3 的 NSIS 建置流程](https://github.com/electron-userland/electron-builder/blob/v24.13.3/packages/app-builder-lib/src/targets/nsis/NsisTarget.ts)、[同版官方 UninstallerReader](https://github.com/electron-userland/electron-builder/blob/v24.13.3/packages/app-builder-lib/src/targets/nsis/nsisUtil.ts)、[NSIS 設定](https://www.electron.build/nsis/)。本專案適配器以目前安裝的 app-builder-lib 24.13.3 實際模組與範本為校驗基準，不能直接套用到任意新版本。

建置入口將一般 electron-builder CLI 參數原樣傳給已安裝的 CLI。例如指定本機排除設定及禁止發布時：

```powershell
node .\scripts\build-installer.js --config "暫存目錄\electron-builder-local.json" --publish never
```

使用 npm 的專案 build 指令時，同樣可在 -- 後傳入原參數；以當前 package.json 的實際 scripts 設定為準。

## 保護條件與建置證據

- 先核對 app-builder-lib 版本、關鍵模組 SHA256、stock NSIS 範本完整清單與每檔 SHA256；版本、內容或範本不符即失敗，升級依賴必須先重新審閱適配器。
- 不支援的選項、模板或讀取失敗直接停止，不退回執行暫存 helper，也不以 Wine／VM／其他 loader 作為 fallback。
- 預設證據檔為 dist/nsis-static-build-proof.json，可用 --static-uninstaller-proof 指定另一個證據檔位置。
- 核對證據中的本次 runId、status、buildExitCode、staticExtraction、helperExecutionAttempts、各 entry 狀態、輸入／輸出雜湊及最終 installer 雜湊；不能拿上次成功檔案充當本次結果。
- 建置成功仍須依發布規範核對來源、ASAR、禁止封裝檔案、安裝檔版本及 latest.yml 校驗。原始碼 ZIP 不代表營運 SQLite／WebCredentials 已備份，產物完成也不代表正式安裝或部署。

## 本次驗證狀態

- 530 項測試通過，包括 8 項建置適配器測試；版本／模組／範本變動、編譯／解析／簽章失敗與隱式自訂腳本均有拒絕路徑覆蓋。
- 已成功建置 `dist/TanChin-Time-Clock-SQLite3 Setup 1.46.1.exe`、blockmap 及 latest.yml；proof 的 status=complete、buildExitCode=0、staticExtraction=true、entries 非空且全為 ready，最終 installer 雜湊與實檔一致。
- helperExecutionAttempts=0 是建置適配器對已知暫存 PE 路徑、四個直接 child_process API 的攔截紀錄，不是作業系統全程序稽核。原廠靜態解析器與本專案適配器均無執行 helper 的 fallback。
- ASAR 版本為 1.46.1，來源一致（僅 electron-builder 正常移除 package.json 的開發欄位），禁止封裝項目為零；latest.yml SHA512／大小吻合。
- 封裝版以獨立空白 userData 啟動，health 回覆 1.46.1，SQLite 路徑屬測試 Temp，員工／打卡／綁定皆零、外部 API 關閉，測試程序與監聽已停止。沒有對正式資料或服務執行測試。
- 尚未執行實際安裝／升級／解除安裝驗收，也未部署正式服務。最終 Setup 仍為 NotSigned；本次修復的是建置時不必要的暫存 PE 執行，不保證所有目標電腦會允許未簽章安裝檔。若目標主機仍阻擋，需評估受信任程式碼簽章，不應停用 SAC 或加入防毒排除。

本次依使用者指定補交 v1.46.1，維持版本號。最終校驗碼與備份檔名以交付回報及本次 proof 為準；先前失敗的不完整 Setup 不得作為安裝檔交付。
