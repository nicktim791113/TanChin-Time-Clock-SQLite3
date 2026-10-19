/* Contextual instructions use the controls actually rendered for the signed-in user.
 * Never copy field values, employee names, credentials, or record contents into help. */
const workbenchHelpTopics = {
    'export.databaseBackup': ['完整資料庫備份與還原', '將目前連線主機的資料庫備份到兩個已保存位置之一，並把完整 ZIP 下載到目前操作電腦。從 TC039 連到打卡鐘時，主機存檔與 TC039 下載是兩個步驟。', ['先核對上方「已儲存路徑」。位置 1 保留原打卡鐘備份位置；位置 2 可填指定本機或網路共用路徑，留空停用。修改路徑或保留份數後按儲存。', '在「本次主機端存放位置」選位置 1 或位置 2，再按「立即完整備份並下載」。選擇只影響本次，不更改排程；建立完成後瀏覽器下載 ZIP。', '下載失敗而主機備份成功時，按「再次下載這份備份」，不會重新建立備份。有效期結束或登出後需重新執行。', '要還原先完整解壓 ZIP，將資料庫、manifest 與密碼金鑰附檔保留同一資料夾，核對連線主機與來源，再選資料庫檔並輸入「還原資料庫」。系統先建立緊急備份。'], ['兩個位置都由打卡鐘主機存取；TC039 能開啟 NAS，不代表打卡鐘執行帳戶有寫入權限。無法寫入所選位置會明確失敗，不會默默改存另一位置。', '在主機選位置／選擇備份檔會在主機開啟對話框，不是操作電腦的檔案選擇器；遠端操作可直接輸入主機端路徑。', '瀏覽器可決定下載資料夾或詢問另存位置。畫面「交由瀏覽器下載」不代表已確認使用者磁碟存檔，請核對瀏覽器下載清單。', '最近完整備份只列位置 1；位置 2 請至指定資料夾查看。保留份數分別套用於各位置，執行時只清理本次位置；排程指定路徑不受本次選擇影響。', 'ZIP 含完整業務資料與可用的密碼金鑰，不可公開分享或上傳 Git。此操作不包含自訂背景／音效，亦不會自動建立安全測試環境。']],
    'people.form': ['新增／編輯員工', '維護員工主檔。新增與編輯使用同一表單；編輯時會帶入既有資料，儲存才會寫入。', ['先填工號、姓名、部門及班別，再核對卡號與任職資料。', '感應讀卡只填入卡號，不會產生打卡紀錄。完成後按儲存；取消編輯可回到新增狀態。', '聯絡、家庭、銀行與身分資料屬個人資料，僅填業務所需。'], ['改工號前先確認歷史與關聯資料；不要用刪除再新增代替一般資料修改。', 'CSV 匯出包含完整名冊，不受篩選影響；匯入按工號／卡號合併，不刪除未列出的員工。']],
    'people.departments': ['部門設定', '部門清單供員工主檔與篩選選用。主管審核另在「主管指定」維護。', ['填部門名稱與排序，確認啟用狀態後儲存。', '清單的編輯會帶入表單；停用或刪除前先確認仍使用該部門的人員。'], ['停用不等於刪除員工，也不會自動重新指派主管。']],
    'people.roster': ['員工名冊資料', '查找人員、選擇顯示欄位，或進入個別主檔編輯。', ['以搜尋文字、部門等條件縮小名單；清除篩選恢復全部。', '顯示筆數控制畫面高度；表頭欄位設定只改顯示，不刪除資料。', '按編輯進主檔；刪除須先核對工號。審核與代辦主管統一從上方「主管指定」進入。'], ['匯出 CSV 是完整名冊，不等於目前篩選結果。', '名冊人數與出勤統計範圍不同；統計範圍在指標明細內設定。']],
    'security.settings': ['遠端打卡規則', '設定瀏覽器打卡的裝置綁定與 GPS 驗證條件。', ['選擇是否要求裝置綁定與 GPS，填允許定位誤差。', '核對設定後儲存；員工下次登入／打卡時按目前政策檢查。'], ['GPS 誤差上限是定位精度條件，不是公司地址的距離圍欄。', '裝置資料或 GPS 不等於工作時數；打卡結果仍應配合考勤查核。']],
    'security.devices': ['裝置綁定清單', '依員工分組查看綁定裝置，並安全解除指定範圍的綁定。', ['用關鍵字、部門與綁定狀態查找員工；清除篩選只重設查詢。', '解除單一裝置只影響該裝置；「解除此人全部裝置」只影響該工號。', '確認窗先核對受影響裝置，再按要求輸入工號確認；取消不會異動。'], ['解除此人全部裝置不是清除全體員工。重新登入能否再次綁定，仍由當時安全政策決定。', '如果確認期間裝置清單已變動，請重新載入並再次核對。']],
    'security.recent': ['最近遠端打卡', '以人員彙總最近兩週遠端打卡，再按需要查看明細。', ['期間採台北時間今天及前 13 日；人員列彙總期間內的紀錄。', '先篩選人員，再開啟該員工明細，核對時間、結果、來源與風險資訊。'], ['最近兩週不受舊有 50 筆上限截斷。已刪除員工的歷史仍保留並標示。', '彙總筆數是紀錄數，不能直接當作出勤天數或工作時數。']],
    'security.punchPermissions': ['員工網頁打卡權限', '控制哪些員工可從瀏覽器打卡；不修改實體卡片或既有考勤。', ['搜尋並勾選員工，選允許或禁止網頁打卡。', '填異動原因，檢查批量對象與確認欄後儲存。'], ['未設定例外時依現有預設政策處理；不要把畫面篩選當成已勾選名單。']],
    'security.requestHistory': ['員工紀錄可見範圍', '限制員工工作台可回看的請假／加班紀錄月份。', ['分別設定請假與加班可回看月數，填原因並確認儲存。'], ['N 代表本月加前 N 個月，0 仍可看本月；不限制代表不裁切。', '此設定不刪除資料，不改管理者查詢或員工額度扣抵；主管授權另受權限管控。']],
    'shifts.editor': ['班別時間設定', '維護可供員工使用的班別名稱與起訖時間。', ['填班別名稱、開始及結束時間後儲存。', '清單編輯會將資料帶入表單；移除前確認使用該班別的人員。'], ['修改班別是修改設定，不是補登或修改某筆打卡紀錄。']],
    'manualPunch.form': ['手動補登', '替指定員工新增缺漏的打卡紀錄。下方只顯示最近 50 筆手動補登。', ['選員工、日期、時間與打卡類型，確認應補的時點後送出。', '送出後核對成功訊息及下方補登紀錄，避免重複送出。'], ['補登打卡與紙本請假／加班核准補登是不同作業。', '歷史記錄區只保留最近 50 筆的畫面呈現，不會因此刪除較舊資料。']],
    reports: ['考勤報表', '依日期與員工查詢考勤，再匯出與目前查詢一致的結果。', ['選起訖日期與員工，按查詢報表。', '查看摘要與考勤明細，再選精簡考勤 CSV 或請假／加班明細 CSV。', '重設條件會清除查詢狀態；更改條件後須重新查詢才是新的結果。'], ['薪資明細列核准請假／加班時數，不代表系統已計算應付薪資。', '資料頁的欄位顯示與匯出模板是不同設定。']],
    'leave.paper': ['紙本核准請假補登', '將已完成紙本核准的請假登錄為正式紀錄；不是一般待審申請。', ['勾選 1 至 100 位員工，填假別、起訖、實際時數、主管及原因。', '需要每日分配時填日期＝時數，合計須等於實際請假時數。', '核對核准依據及確認欄後送出；批量失敗不應只重送部分而造成重複。'], ['已在系統的舊單應用修正功能，維持同一單號；不要重建替代。']],
    'leave.audit': ['請假出勤查核', '比對請假與考勤警示，提供人工查核線索。', ['查看人員、請假期間與警示原因；開啟原單核對。', '確認後以合適的補登、修正或審核功能處理。'], ['警示不是自動裁定曠職或扣薪；請先查明事實。']],
    'leave.pending': ['管理部待複核', '管理部處理已完成主管程序的待複核請假。', ['核對人員、假別、日期、實際時數與主管審核進度。', '填審核備註後選核准或駁回，確認結果。'], ['部分必審主管核准不會提前進入管理部；請勿在這裡代替主管投票。', '核准轉為已用額度；駁回釋放預占。']],
    'leave.records': ['請假紀錄', '用日曆或列表查看請假，依權限審核、修正或作廢。', ['切換日曆／列表、月份與篩選條件；列表可翻頁。', '點原單查看起訖、實際時數、狀態與審核進度。', '修正保留同一單號；作廢前確認原因及影響。'], ['跨日單會在涵蓋日期出現，不能把日曆格數當作申請件數。', '待審是預占，終審核准才計為已用。']],
    'leave.types': ['假別設定', '維護假別名稱、單位、附件需求、額度扣抵與給薪標記。', ['新增或編輯假別，核對是否需要附件及是否扣抵額度。', '給薪標記可選全薪、半薪或無薪，完成後儲存設定。'], ['給薪標記只供資訊與 API 輸出；不會自動計算薪資、扣薪或改變薪資匯出金額。', '病假的半薪可能有法定天數與情況限制；此欄不是完整法定病假薪資引擎。', '停用保留歷史引用，與刪除假單不同。']],
    'leave.balances': ['假別額度', '按員工、假別與記帳年度設定額度，區分核准使用與待審預占。', ['選記帳年度與假別；先查看目前餘額與提醒。', '選員工、全年總額或期中剩餘、扣抵起日、天數、人工轉入與調整，填原因後預覽。', '逐筆核對預覽再確認全部儲存。Excel 也須先預覽再確認；取消預覽不寫入。', '舊單每日扣抵分配使用原單號及日期＝實際時數，僅補分配，不改原單。'], ['可用＝額度＋轉入＋調整－已核准－待審預占；未設定不代表沒有請假權利。', '每日換算工時是共用新額度設定，既有額度保留原工時。特休記帳期間不會套用為其他假別法定制度。', '特休可進入年資特休制度，以核對、試算及確認建立精確權利帳；已接管帳目不得用人工表單覆寫。']],
    'overtime.paper': ['紙本核准加班補登', '登錄已在紙本核准的加班，保留正式單號與核准依據。', ['選員工、起訖、實際加班時數、主管與原因。', '核對多人名單及已核准確認後送出。'], ['一般待審申請與紙本補登不同；不得把待審單當已核准補登。']],
    'overtime.alerts': ['加班出勤查核', '檢視加班申請與出勤資料的差異提醒。', ['核對警示期間與實際打卡，再查原加班單。'], ['警示需人工查核，不直接計算薪資或認定責任。']],
    'overtime.records': ['加班申請紀錄', '查看加班日曆、列表與審核進度。', ['選月份、狀態與員工，切日曆／列表並翻頁查找。', '開啟原單查看主管票權；有權限者可依核准依據修正或作廢。'], ['本人加班應由本人申請；主管代送須使用已授權的主管代辦。']],
    'supervisors.review': ['主管審核指定', '設定員工請假／加班的審核主管，與代辦授權分開。', ['勾選員工與主管，選任一主管核准或指定必審模式。', '必審模式逐一勾選必審者，核對不得本人審核自己。', '填原因、確認後批量儲存；新申請保存當時路徑快照。'], ['修改路徑不會改派舊待審單；移除主管須檢查舊單處理方式。', '任一模式一人核准即可；必審須全部指定者核准，待主管階段任一有效主管駁回則退回。']],
    'supervisors.assignments': ['代辦主管', '授權主管替指定員工辦理請假、加班或團膳作業。', ['勾選員工與主管，選新增或取代授權。', '新增保留原授權；取代會移除未選主管，空白取代須額外確認。', '核對原因與確認欄後批量儲存。'], ['審核主管不會自動取得代辦權限；兩種設定分開。', '主管只能查看與操作明確授權員工，額度管理權限仍另行授予。']],
    'meals.calendar': ['午餐日曆與交單', '查看每日登記、已交單數與差額，按權限代登及記錄交單。', ['選月份與日期，查看目前餐數、已交單數、差額及名單。', '代登／修正選用餐或不用餐並填原因；全日請假提示可確認取消餐點。', '核對後結單／更新交單，保留每一版快照；匯出月報下載目前月份。'], ['結單只記錄已完成對外交單，不會自動寄信或傳訊給供應商。', '已交單數與目前登記數可能不同，異動後需確認供應商是否收到更新。', '預訂午餐不等於實際領餐。截止與月份以台北時間判斷。']],
    'meals.membership': ['團膳參加資格', '設定員工參加團膳的有效期間與預設用餐狀態。', ['選員工、參加／停止日期與是否參加，填原因後儲存。', '查看既有名單，核對離職或已刪除人員是否仍有有效資格。'], ['每日例外與參加資格分開；停止參加不會抹除已交單快照。']],
    'meals.schedule': ['供餐制度與例外', '設定固定供餐星期、截止時間及單日例外。', ['選供餐星期與每日截止時間，填原因後儲存。', '指定日期可設定供餐／停供、截止時間與備註，再核對日曆。'], ['沒有設定的供餐日不會自動假定供餐；已交單內容保留原快照。']],
    'system.display': ['主畫面資料', '調整登入頁與工作台共用的名稱與說明。', ['修改主標題、副標題及頁首說明，核對後儲存。'], ['這些是顯示文字，不會修改公司資料庫或員工帳號。']],
    'system.password': ['管理者密碼', '維護桌面端共用管理者密碼。', ['輸入新密碼及畫面要求的驗證資料，核對後更新。'], ['桌面共用密碼與個人網頁密碼、獨立系統管理者帳號不同；修改此處不會替所有人改網頁密碼。']],
    'system.greetings': ['問候語管理', '維護桌面打卡畫面的問候語文字與使用時段。', ['填內容及對應時段後儲存；清單可載入編輯或刪除。'], ['問候語只影響呈現，不改考勤或打卡狀態。']],
    'bells.schedules': ['響鈴場景', '設定時間、星期、音效及播放時長的響鈴排程。', ['選音效，填場景名稱、時間、星期與時長後儲存。', '清單可啟停、編輯或刪除；先試聽確認音量與內容。'], ['實際自動響鈴依打卡鐘主機正在運行的服務及音效裝置執行。']],
    'bells.sounds': ['聲音庫', '上傳與管理供響鈴使用的音效。', ['選檔案並命名，上傳後試聽。', '刪除前先確認是否有排程引用該音效。'], ['瀏覽器試聽不代表正式主機音量或揚聲器已驗證。']],
    'bells.history': ['響鈴歷史', '查看已記錄的響鈴執行情形。', ['核對時間與場景；需要清空時先確認確實不再需要這份歷史。'], ['清空歷史不等於刪除響鈴排程。']],
    'themes.effects': ['節日特效', '依日期或條件啟用桌面視覺效果。', ['設定名稱、日期與特效，儲存後可在清單啟停或編輯。'], ['停用特效不會停用打卡功能。']],
    'themes.schedules': ['主題排程', '安排指定日期或時段使用的主題。', ['選主題與生效條件，儲存後核對啟用狀態。'], ['排程與自訂主題內容分開；修改主題會影響使用它的排程。']],
    'themes.editor': ['自訂主題編輯器', '編輯背景、配色、文字、時鐘及打卡動畫，先預覽再儲存。', ['載入既有主題或填新名稱，依各區欄位調整。', '上傳背景時選正確目標，觀察日／夜預覽；儲存才會寫入。', '刪除前確認是否正在使用或被排程引用。'], ['預覽只顯示目前表單效果；未儲存的編輯尚未發布。']],
    developer: ['開發人員工作台', '管理自動化、日誌、匯出與系統備份；請先確認目前子頁與操作影響。', ['自動化：選任務類型、排程、輸出模板及資料夾，儲存後核對啟用狀態。', '日誌：使用日期、類別與人員條件查核紀錄；匯出依畫面條件。', '備份：先確認目的資料夾與保留份數；還原須使用完整備份、核對來源並輸入確認文字。'], ['GitHub 原始碼推送不等於正式主機部署；更新主機後需重啟並核對版本。', '資料庫與密碼金鑰須配套備份。備份檔含敏感資料，不可上傳公開 Git。']],
    system_admin: ['系統管理者工作台', '管理網頁角色、各項管理權限、個人網頁密碼及主管授權。', ['依員工設定允許進入的角色，再指定管理者功能權限；只授予工作所需。', '個人密碼重設後依強制變更設定讓本人重新登入修改。', '額度查看與額度調整分開；主管審核與代辦授權也分開。'], ['查看密碼、重設密碼及權限異動有不同授權與稽核，不應把角色名稱當作所有功能都能操作。']],
    employee: ['員工工作台', '查看本人考勤、請假／加班、午餐與額度；主管功能只在具有授權時顯示。', ['本人申請先核對假別、日期及實際時數，再確認送出。', '在日曆或紀錄查看狀態；待審申請依功能可撤回。', '主管待審與代辦從各自入口進入，按指定授權處理。'], ['只能查看本人額度；主管代辦只能查看授權員工，不能調整額度。', '已核准與待審預占分開，可用額度未設定不代表權利為零。']]
};

Object.assign(workbenchHelpTopics, {
    'metrics.settings': ['指標排列與高度', '八張卡保留固定資訊群組，可調整個人排列順序與顯示高度。', ['逐列用向上／向下按鈕調整順序，選擇顯示高度並查看預覽。', '確認設定後儲存；關閉若有未存內容，可繼續編輯或捨棄。'], ['設定只影響目前帳號的呈現，不改統計資料或其他管理者。', '舊單項設定轉換為八個群組；請依遷移提示核對並保存。']],
    'metrics.detail': ['指標明細與統計範圍', '核對卡片的統計口徑、彙總與人員明細，再進入有權限的設定。', ['七日卡可切換日期；待審卡可切不同審核階段。', '以人員關鍵字及部門縮小清單，查詢後核對總數與分頁。', '出勤統計範圍可選全部、在職、部門或手動人員；設定頁入口另以按鈕標示。'], ['每日人數是當日不重複員工，跨日同一人可能出現在多日，不可直接相加當七日不重複人數。', '待審依申請件數；正常打卡依人數，異常打卡含紀錄與失敗稽核，不能將不同口徑相除當出勤率。', '沒有權限顯示不可查看，不應當作零；篩選不修改原始紀錄。']],
    'security.deviceDialog': ['裝置明細與解除確認', '查看一位員工的裝置及最近使用情形，只解除已核對的指定範圍。', ['先核對裝置名稱／ID、平台、綁定與最後登入時間、IP 及 GPS 資訊。', '解除此裝置只處理單一裝置；危險操作區的解除全部只限這位員工。', '確認頁列出受影響裝置；勾選影響確認，全部解除另需輸入該工號，再按確認解除。', '返回裝置清單或關閉不執行解除；確認期間名單已變動會拒絕，重新檢查後再操作。'], ['解除綁定不刪除打卡歷史，且不會清除全體員工。', 'IP、GPS 及最後使用時間是當時記錄，不表示裝置現在的位置。']],
    'security.remoteDialog': ['遠端打卡個人明細', '查看該人最近兩週的完整遠端打卡紀錄。', ['核對期間、時間、上下班類型、考勤狀態與裝置。', '逐項查 GPS／精度與風險資訊，關閉回到人員彙總。'], ['風險標記供查核，不直接認定違規或計算薪資。', '紀錄數、出勤日數及裝置數有不同口徑。']]
});
const workbenchHelpLabels = {
    '國籍': '員工國籍資料，依人事紀錄填寫。', '離職日': '實際離職日期；供在職判斷，不刪除歷史資料。', '聯絡地址': '員工目前聯絡地址。', '家庭概況': '業務所需的家庭備註，避免填入不必要個資。',
    '讀取卡片': '進入卡號接收狀態，再感應讀卡機；只填卡號，不新增打卡紀錄。', '帶入最近刷卡失敗': '從最近刷卡失敗診斷取得卡號，先核對是否是本次員工的卡，再儲存。', '讀卡輸入': '讀卡機輸入的接收位置；感應卡片後核對上方完整卡號。', '清除讀卡結果': '停止本次讀卡接收，清除接收區與結果提示；保留已填入員工卡號欄位的內容，不改已儲存資料。',
    '顯示列數': '調整名冊可視高度與列數，不改名冊總數或 CSV 匯出範圍。', '還原最精簡欄位': '還原預設核心欄位，保留員工資料不變。', '綁定狀態': '選全部、已綁定或未綁定人員；不會新增或解除綁定。', '風險狀態': '選全部、有風險或無風險的兩週人員彙總。',
    '選取顯示': '勾選目前篩選後顯示且可選的人員；核對已選人數，不代表整個名冊。', '清除': '清除此選取器的已選人員，不刪除員工或已保存的設定。',
    '請假回看月數（本月另計）': 'N 表示本月加前 N 個月；0 仍包含本月，不限制則完整保留可見範圍。', '加班回看月數（本月另計）': 'N 表示本月加前 N 個月；不影響管理者查詢及額度計算。',
    '班別名稱': '班別的顯示名稱，供員工主檔選取。', '開始時間': '作業開始時間；若是請假或加班，須另填實際工作時數。', '結束時間': '作業結束時間，核對日期及跨日情況。', '開始日期': '此設定的生效起日。', '結束日期': '此設定的適用迄日。',
    '員工識別': '選擇要補登的員工，核對工號、姓名與卡號對應。', '打卡狀態': '指定本筆補登的上下班／考勤狀態，核對應補的原始情況。', '請假時數': '實際請假的工作時數，不以起訖差值自動當作請假時數。', '加班時數': '核准的實際加班時數，排除不屬工作時間的區段。', '紙本單號': '原始紙本核准文件的識別號，供後續查核，不是系統單號。', '紙本核准人': '原紙本的核准人；不會因此改派線上審核路徑。', '補登備註': '記錄補登依據或需留存的補充資訊。',
    '本月': '將日曆切回台北時間的目前月份。', '員工': '選擇查詢或處理對象；全部員工表示不套人員篩選。', '部門': '按部門縮小清單；全部部門表示不限制。', '狀態': '按申請狀態篩選，不會改變申請。', '假別': '選適用的請假類別；查詢時只篩選，在申請表中則決定送件假別。', '紙本補登': '選擇是否僅查紙本已核准來源的申請，與一般線上申請分開。',
    '生效日期': '此項制度或參加資格開始適用的日期，核對是否影響目前月份。', '參加狀態': '選擇自生效日起參加或停止參加團膳；不清除歷史交單。', '全日請假提醒：工作開始': '全日請假用餐提醒的判斷起點，不用來替員工排班或自動扣除午餐。', '全日請假提醒：工作結束': '全日請假用餐提醒的判斷終點，提醒仍須人工確認。',
    '目前桌面開發人員密碼': '驗證修改桌面管理者密碼的權限；不是個人網頁密碼。', '新桌面管理者密碼': '更新桌面共用管理者密碼，不會改其他人的網頁密碼。', '打卡類型': '這則問候語對應的打卡情境。', '問候語內容': '桌面打卡時顯示的問候文字。', '主題': '選要套用的既有主題，並核對生效期間。',
    '時鐘圖片定位': '設定時鐘背景圖在容器內的位置，先看預覽再儲存。', '白天開始時間': '主題切入日間樣式的時間。', '夜晚開始時間': '主題切入夜間樣式的時間。', '清除圖片': '清除表單的圖片設定；儲存後才會改變這個主題。', '閃爍邊框': '選擇主題邊框的閃爍樣式。', '打卡特效': '選擇打卡時的視覺效果，不改打卡資料。', '重設主題表單': '將尚未儲存的表單恢復初始狀態，請先確認是否要捨棄。',
    '管理者設定': '這是主題預覽的桌面按鈕示意，並非操作正式桌面的管理入口。', '考勤報表': '這是主題預覽的按鈕示意，並非查詢或匯出正式報表。', 'AI 系統控制': '這是主題預覽的按鈕示意，並非執行系統任務。'
};
const workbenchHelpFields = {
    id: '員工或設定的唯一識別碼；編輯時先核對對象，避免以新代碼重建既有資料。', name: '此筆人員或設定的顯示名稱。', employeeId: '選擇本次操作的員工；送出前核對工號與姓名。', employee_id: '選擇本次操作的員工。', employeeIds: '勾選本次批量操作對象；搜尋只篩選畫面，不等於勾選。',
    department: '員工所屬部門；在篩選列選取時只影響畫面範圍。', job_title: '員工職稱，供主檔顯示及篩選使用。', shift: '員工適用的班別；請先在班別設定建立。', card: '打卡卡號，須避免與其他員工重複。', password: '此功能指定帳號或桌面共用密碼，請確認頁面說明的適用範圍。',
    hire_date: '員工名冊到職日期；年資給假仍須先在年資特休制度核對起算日及接管基準，不會單憑此欄自動入帳。', leave_date: '員工離職日期，影響在職判斷；不刪除歷史紀錄。', birth_date: '員工出生日期。', gender: '員工性別資料。', national_id: '身分識別資料，屬敏感個資。', bank_account: '銀行帳戶資料；本頁不執行薪資付款。', mobile_phone: '員工聯絡電話。', emergency_contact: '緊急聯絡人。', emergency_phone: '緊急聯絡電話。', address: '員工聯絡地址。', registered_address: '戶籍地址。', notes: '補充備註；避免放入不必要的密碼或機密。',
    date: '操作適用的日期，請核對是否為補登、供餐或查詢日期。', time: '操作適用時間；補登請使用實際應記錄的時點。', start: '開始時間。', end: '結束時間。', startDate: '查詢或作業開始日期，須不晚於結束日期。', endDate: '查詢或作業結束日期。', start_at: '申請開始日期與時間。', end_at: '申請結束日期與時間。', duration_hours: '實際請假／加班時數，不能直接用起訖經過時間代替工作時數。', reason: '本次申請或異動原因，保存後供審核與稽核使用。',
    unit: '假別的填寫／顯示單位；不等於給薪比例。', pay_mode: '全薪／半薪／無薪資訊標記，不會自動算薪資或扣薪。', requires_attachment: '是否要求此假別附證明。', deducts_balance: '是否納入假別額度扣抵。', enabled: '是否啟用此設定；停用與刪除不同。', display_order: '清單排序數值。', description: '此設定的用途或補充說明。',
    year: '額度記帳年度；各假別法定資格與期間須依制度另外確認。', period: '人工額度使用曆年記帳；年資特休制度另有週年／曆年選項，並保存來源權利。', dayHours: '將天數換算小時的共用工時，新額度才採用；既有額度保留原工時。', mode: '全年總額會扣全年既有紀錄；期中剩餘則自指定扣抵日起計算，勿重複扣減已在外部帳冊扣除的時數。', accountingStart: '額度開始扣抵的日期，應與所選總額／剩餘方式一致。', grantDays: '輸入的額度天數會按該筆每日工時換算為小時。', carryHours: '人工額度的上期轉入時數；已接管精確權利帳者改由年資特休的年度結算保留來源及同意證據。', adjustmentHours: '人工增減時數，可正可負，需寫明原因。', requestId: '原請假單號；補每日分配不會建立另一張假單。', dailyHours: '每列用 YYYY-MM-DD=時數，合計須等於原單實際時數。',
    reviewMode: '任一主管核准，或全部指定必審主管核准。', reviewEmployeeIds: '要套用審核路徑的員工，與審核主管名單分開。', reviewSupervisorIds: '可審核所選員工新申請的主管。', requiredSupervisorIds: '必審模式中必須核准的主管，不能留空或包含申請者本人。', supervisorIds: '要授予代辦的主管；不會同時改變審核路徑。',
    eating: '當天用餐／不用餐的登記選擇。', serving: '該日是否供餐。', cutoff: '供餐當日登記截止時間（台北時間）。', note: '該日或設定的補充說明。', member: '是否參加團膳，另核對有效起訖期間。',
    deviceBindingEnabled: '要求員工遠端登入／打卡使用符合綁定政策的裝置。', gpsRequiredOnPunch: '遠端打卡時要求提供 GPS；瀏覽器仍須取得定位權限。', maxGpsAccuracyMeters: '允許的定位誤差上限，單位公尺，並非地理圍欄半徑。', confirmEmployeeId: '輸入確認窗指定的工號，避免誤解除他人裝置。',
    mainTitle: '登入頁與工作台主標題。', subtitle: '共用副標題。', heroDescription: '頁首說明文字。', content: '問候語或作業文字內容。', title: '此場景、任務或設定的名稱。', sound: '響鈴使用的音效。', duration: '播放時長，請依頁面單位輸入。', days: '要執行／供餐的星期，可複選。', frequency: '自動化任務的執行頻率。', export_template: '匯出欄位格式；需與下游薪資／ERP 接收格式一致。', export_directory: '此任務的匯出資料夾，指主機端可存取的位置。', defaultDirectory: '主機端的預設備份資料夾。', retentionCount: '保留備份份數，超出時依備份機制清理。', sourceFilePath: '要還原的主機端完整備份檔路徑；先核對版本與配套金鑰。', confirmText: '依頁面指定文字確認此高影響操作。'
};

Object.assign(workbenchHelpTopics, {
    'annual.overview': ['年資特休權利總覽', '以完整來源權利及精確年度配置追蹤給假、使用、預占與結算。', ['選查看年度，核對已給、已休、待審預占與可用小時。', '點查看明細，展開資格事件、每段公式、原始分數及年度配置。', '匯出 JSON 保留精確計算；CSV 提供額度核對。'], ['小數摘要可能省略循環尾數，帳本保留完整分子與分母，不以畫面小數回算。', '已取得來源配置於後續年度的部分，不是額外給假或協商遞延。', '既有人工額度接管後，使用精確調整；人工表單與 Excel 不能覆蓋新權利帳。', '週年制顯示所選年交集來源的全期餘額，包含跨年使用，不是當年請假發生量。', '來源工時不同時顯示依來源工時，天數逐來源換算相加；不可用最新工時反推所有歷史日數。']],
    'annual.policy': ['特休制度版本', '建立可追溯的制度與小數規則，保存舊版本供每筆給假重算。', ['填制度名稱、生效日與特休假別代碼；假別須啟用並扣額度。', '選曆年或週年、曆月比例或實際日數、保留原值或無條件進位一位。', '填協商／制度依據及原因，逐項確認後建立版本。'], ['新生效日須晚於既有版本，不能回溯覆蓋已發給來源。', '進位在精確分段加總後只做一次；7.01 變 7.1，精確 7.1 不變 7.2。', '全薪／半薪標記不參與特休權利計算，本功能不計薪或付款。']],
    'annual.service': ['年資核對與期初接管', '確認真正受僱年資、工時與期初餘額，避免漏給或與人工額度重複。', ['選員工，核對名冊到職日與認列年資起算日。', '填正常工時、工作型態及必要的比例依據；不計年資區間每列填起日、復職日、原因。', '填接管起日、接管日前未休剩餘小時、期限與對帳來源；接管前權利不再重複自動發給。', '月底／閏日等日期人工核對後勾確認；保存核對版本及原因。後續服務修訂只影響適用版本，不改寫已入帳快照。'], ['不計年資區間採起日含、復職日不含，不可重疊。', '每週工作日相同、每天較短者維持完整日數；比例型工時不能再重複折減每日工時。', '名冊或人工額度在核對後異動時需重新核對；已發權利不能以改到職日直接回寫。']],
    'annual.grant': ['年資特休試算與核准', '先計算、再核對、最後確認入帳；未取得的未來權利清楚分開顯示。', ['選制度、配置年度及資格基準日，填原因。', '用工號／姓名或部門篩選並選取 1 至 100 位員工；篩選不會取消已選人員。', '產生試算後展開每人與各來源，核對法定級距、資格日、年資排除、分攤權重、精確原值、進位差額及後續年度配置。', '全部待確認項目處理完，具給假權限者勾確認後核准入帳；舊預覽、未來基準日及重複請求會受檢查。'], ['半年 3 日與滿一年 7 日是獨立權利，不只補 4 日。', '只有已取得事件入帳；未達資格日的試算沒有可用額度。', '同一員工資格事件只給一次，確認失敗時整批回滾。']],
    'annual.close': ['年度結算與協商遞延', '逐來源核對未休餘額；結轉保留來源，工資項目維持待核定狀態。', ['選來源年度、基準日及年度終結／契約終止情境。', '展開來源並勾選本次處理；待審預占與每日分配異常須先結案。', '協商遞延須逐筆填同意日期與證據；其餘列待未休工資處理。', '預覽核對來源扣除與轉入結果，再由結轉權限確認；離職須涵蓋全部已取得來源，包括後續年度配置。'], ['結轉不是兩個年度都保留完整可用額度，之後先扣遞延來源。', '已遞延批次不能再次遞延；已離職者也不能以年度情境繞過工資結算。', '年資仍待歷史對帳，或名冊到職／離職日尚未完成版本核對時，先核對再結算。', '待未休工資不是已核薪或已付款；本版不執行薪資付款。', '舊單撤回會回到原來源，若來源已結算，需重新核對新增剩餘，不自動加到下一年。']],
    'annual.correction': ['精確特休額度調整', '用獨立額度管理權限作差額修正，保存原始給假與完整異動。', ['選員工來源批次，確認其可用、已休、預占及結算情況。', '填正或負的精確小時，接受十進位或分數，例如 -0.125、1/3，並填原因。', '預覽前後差額，核對後確認調整。'], ['負調整不能移除已使用、預占或已結轉的權利。', '查看、給假或結轉權限不等於額度調整權限。', '修正保留原批次與異動紀錄，不刪除原請假單。']],
    'annual.detail': ['個人特休計算與來源明細', '唯讀查看授權範圍內的已入帳權利、計算快照與異動。', ['核對年度及員工。', '展開來源權利與計算過程，查看起算日、資格日、法定日數、分段比例、分數原值及進位差額。', '查看使用、預占、結轉與調整流水；關閉返回原頁。'], ['員工只看本人，代辦主管只看已明確授權員工，均不能從此視窗調整額度。', '來源快照保留當時規則，不因後續制度版本而被改寫。', '不同來源期限與工時可能不同，應以各來源精確明細核對。']]
});
const annualHelpFields = {
    detailYear: '切換已入帳計算明細年度；此視窗唯讀，不會新增或調整額度。', verified: '實際核對到職年資、留職停薪區間與正常工時後才勾選，未核對不能保存。',
    name: '本制度版本的名稱，供試算與已入帳快照辨識。', leaveTypeId: '明確指定特休假別；須為啟用且扣額度的代碼，不會把事假或病假套用年資。', effectiveFrom: '制度版本的開始生效日，新版本不可回溯覆蓋既有給假。',
    period: '週年制保存資格事件的完整期間；曆年制另依約定將完整權利分攤到年度，仍保留法定來源。', prorationBasis: '曆月比例採完整月及未滿月權重；實際日數採真實日數，閏年也保留實際分母。', rounding: '保留精確原值，或加總後無條件進位至小數第一位；不四捨五入，也不逐段進位。', agreementReference: '填寫公司採用制度與折算方式的協商依據或文件編號。',
    serviceDate: '已核實的認列年資起算日，可與名冊到職日不同，但須有確認依據。', serviceEffectiveFrom: '首次版本須與接管起日相同；後續工時或工作型態按資格取得日選版本，不改寫已入帳權利。', employmentType: '依核實工作型態選全時、相同工作日的短工時或比例型部分工時。', entitlementFactor: '比例型部分工時才使用核實比例；其他型態為 1，不再次減少日數。', factorBasis: '比例型部分工時的計算與核對依據。', dayHours: '天數換小時的核實工時。比例型需填比例換算基準，避免與比例重複折減；各已入帳來源保留當時工時。', excludedPeriodsText: '每列為起日,復職日,原因；起日計入排除，復職日不排除，區間不能重疊。',
    cutoverDate: '精確權利帳開始接管日；此前已取得權利以核對後期初餘額承接，不再次給假。', openingHours: '截至接管日前的已核對剩餘小時，接受精確十進位或分數；不要填入尚未扣已休的全年總額。', openingExpires: '核對後期初餘額的使用迄日（含當日），須有來源依據。', openingSource: '期初餘額與原人工額度的對帳來源或文件編號。', edgeDateConfirmed: '已人工確認月底／2 月 29 日採用的資格日期規則，未核對不得勾選。',
    year: '試算的配置年度或結算的來源年度；離職結算年度自動依基準日帶入並唯讀。', alYear: '切換要查看的配置年度，不發給額度。', asOf: '判斷資格或是否可結算的基準日；未來日期僅能試算，不能提前確認。', policyId: '選已建立、適用資格日期的制度版本。', allocationId: '選擇本次調整的精確來源批次，不直接覆寫整人全年餘額。', quantity: '正數加額度，負數減尚未使用的額度；單位小時，支援小數或分數。', closureType: '年度終結處理所選來源年度；契約終止核對該人全部已取得來源。', closeEmployeeId: '選已離職員工，列出所有已取得來源，包含後續年度配置。'
};

function workbenchHelpContext(includeModal = true) {
    if (includeModal && document.querySelector('#annual-leave-detail-dialog[open]')) return { role: state.dashboard?.role, section: 'annual', sub: 'detail', topic: workbenchHelpTopics['annual.detail'], root: '#annual-leave-detail-dialog' };
    if (includeModal && document.querySelector('#dashboard-metric-settings[open]')) return { role: 'admin', section: 'metrics', sub: 'settings', topic: workbenchHelpTopics['metrics.settings'], root: '#dashboard-metric-settings' };
    const directoryDialog = document.querySelector('#admin-directory-dialog[open]');
    if (includeModal && directoryDialog) { const remote = directoryDialog.querySelector('h2')?.textContent.includes('的遠端打卡'); const sub = remote ? 'remoteDialog' : 'deviceDialog'; return { role: 'admin', section: 'security', sub, topic: workbenchHelpTopics[`security.${sub}`], root: '#admin-directory-dialog' }; }
    if (includeModal && document.querySelector('#dashboard-insight-modal:not(.hidden)')) return { role: 'admin', section: 'metrics', sub: 'detail', topic: workbenchHelpTopics['metrics.detail'], root: '#dashboard-insight-content' };
    const annualRoot = document.getElementById('annual-leave-workspace');
    if (annualRoot && !annualRoot.closest('.hidden,[hidden]')) { const sub = annualRoot.querySelector('[data-al-context]')?.dataset.alContext || 'overview'; return { role: state.dashboard?.role, section: 'annual', sub, topic: workbenchHelpTopics[`annual.${sub}`], root: '#annual-leave-workspace' }; }
    const role = state.dashboard?.role || 'employee', section = state.activeSections[role] || '';
    let sub = state.activeSubSections?.[role]?.[section] || '';
    if (section === 'meals' && typeof mealState !== 'undefined') sub = mealState.panel;
    if (section === 'supervisors' && typeof supervisorState !== 'undefined') sub = supervisorState.managementView || 'review';
    const topic = workbenchHelpTopics[`${section}.${sub}`] || workbenchHelpTopics[section] || workbenchHelpTopics[role] || workbenchHelpTopics.employee;
    return { role, section, sub, topic };
}
function workbenchControlLabel(node) {
    if (node.matches('[data-al-employee]')) return '選擇員工';
    if (node.matches('summary') && node.closest('#annual-leave-workspace,#annual-leave-detail-dialog')) return '展開來源批次與計算明細';
    const personField = node.name || '';
    if (personField === 'confirmEmployeeId') return '輸入確認工號';
    if (node.matches('[data-paper-employee-checkbox]') || /^(employeeIds|reviewEmployeeIds|reviewSupervisorIds|requiredSupervisorIds|supervisorIds)$/.test(personField)) {
        if (personField === 'requiredSupervisorIds') return '選擇必審主管';
        if (/Supervisor|supervisor/.test(personField)) return '選擇主管';
        return '選擇員工';
    }
    if (node.dataset.action === 'meal-select-date') return '選擇供餐日期';
    if (node.dataset.action === 'select-leave-type') return '選擇假別編輯';
    if (node.getAttribute('aria-label')) return node.getAttribute('aria-label').trim();
    if (node.matches('button, summary')) return node.textContent.trim().replace(/\s+/g, ' ').slice(0, 100);
    const label = node.labels?.[0];
    if (label) { const copy = label.cloneNode(true); copy.querySelectorAll('input,select,textarea,button,.helper-text').forEach((e) => e.remove()); const text = copy.textContent.trim(); if (text) return text; }
    return node.title || node.placeholder || node.name || node.id || '選項';
}
function workbenchControlDescription(node, context) {
    const name = node.name, label = workbenchControlLabel(node), action = node.dataset.action || '', form = node.closest('form');
    if (context.section === 'export' && context.sub === 'databaseBackup') {
        const backupFields = {
            defaultDirectory: '位置 1 的主機端資料夾。保留現有值；留空使用主機資料目錄下 DatabaseBackups。未指定輸出路徑的備份排程也使用位置 1。修改後須儲存。',
            secondaryDirectory: '位置 2 的指定資料夾，初始為公司 NAS 路徑；由主機端讀寫，可改為其他本機／共用路徑。留空停用位置 2，修改後須儲存。',
            retentionCount: '各位置分別保留的完整備份份數，範圍 3–3650；只清理當次實際寫入位置。',
            sourceFilePath: '目前連線主機可存取的解壓後 .db／.sqlite／.sqlite3 檔案。manifest 與密碼金鑰附檔保留原檔名並放同一資料夾；不能直接選 ZIP。',
            confirmText: '確認即將取代目前連線主機資料庫後，輸入「還原資料庫」。要在 TC039 測試須先確認網址連到 TC039。'
        };
        const backupActions = {
            'pick-database-backup-directory': '在主機開啟資料夾選擇對話框，填入按鈕指定的位置欄位；尚須按儲存才生效。遠端瀏覽器不會開啟本機選擇器。',
            'clear-database-backup-directory': '清空位置 1 欄位，按儲存後使用主機 DatabaseBackups；不刪除任何備份。',
            'run-database-backup-now': '在本次選定位置建立完整備份並下載 ZIP 到目前操作電腦。未存的路徑或份數會先要求儲存；執行中禁止連點。',
            'retry-database-backup-download': '用同一份已建立備份重新下載 ZIP，不新增備份；僅目前登入可用且有有效期，過期需重新備份。',
            'pick-database-restore-file': '在目前連線主機開啟檔案對話框，選解壓後的資料庫檔，不是 TC039 瀏覽器上傳檔案。'
        };
        if (backupFields[name]) return backupFields[name];
        if (backupActions[action]) return backupActions[action];
        if (node.id === 'database-backup-destination') return '只決定這次備份要寫入位置 1 或位置 2，不會同時寫入兩處，也不變更排程設定；完成後另下載到操作電腦。';
        if (node.matches('button[type="submit"]') && form?.id === 'database-backup-settings-form') return '保存兩個主機端路徑與共同保留份數；不會立即備份或測試 NAS 連線。執行備份時才檢查所選位置可否寫入。';
        if (node.matches('button[type="submit"]') && form?.id === 'database-restore-form') return '核對來源、連線主機與確認文字後取代主機資料庫；系統會先建立還原前緊急備份，還原不是下載。';
    }
    if (context.section === 'annual') {
        const annualActions = {
            'open': '開啟年資特休的制度、年資核對、試算及結算；已修改的人工額度表單會先提示確認。',
            'back': '返回人工假別額度；尚未儲存的年資作業先提示確認。',
            'tab': '切換目前可用權限的特休子頁；未儲存輸入會先提示確認。',
            'refresh': '重新取得最新年資、政策及權利帳；先確認是否捨棄未儲存內容。',
            'export-json': '下載所選年度的精確額度、來源計算與結算核對資料，保留完整分數；不含年資及協商的私人證據。',
            'export-csv': '下載所選年度的額度核對表，包含精確數值欄位；此處沒有匯出模板選項，也不能作為人工額度覆寫匯入。',
            'cancel-preview': '取消待確認預覽，保留表單輸入供修改後重新試算；不會入帳。',
            'employee-detail': '展開此員工已入帳權利、計算快照與來源餘額；此視窗唯讀。',
            'select-visible': '選取目前搜尋及部門篩選可見員工，保留原先已選取者；每批最多 100 位。',
            'clear-selected': '清空本次給假試算的人員勾選，不刪除員工或已入帳權利。'
        };
        if (annualActions[node.dataset.alAction]) return annualActions[node.dataset.alAction];
        const annualSubmits = {
            'policy': '建立新的制度版本並保存原因與稽核；舊版本及既有給假不覆寫。',
            'service': '保存核對的年資版本。若影響已入帳來源，記錄為待核對而不套用，並封鎖後續給假。',
            'grant-preview': '產生給假計算預覽，不寫入額度；展開逐筆計算及警示後才可確認。',
            'grant-confirm': '確認此預覽的已取得特休給假及所有年度配置入帳；需獨立給假權限，不是請假單審核。',
            'close-preview': '核對到期或離職來源，預覽遞延或待未休工資結果，不寫入結算。',
            'close-confirm': '確認原來源扣除與遞延轉入或待結薪紀錄，需獨立結算權限；不執行付款。',
            'correction-preview': '預覽精確調整的來源、前值、差額與後值；需要額度調整權限。',
            'correction-confirm': '確認精確差額並保存稽核，保留原始權利；已使用、預占或結轉部分不能任意減除。'
        };
        if (node.matches('button[type="submit"]') && annualSubmits[form?.dataset.alForm]) return annualSubmits[form.dataset.alForm];
        if (annualHelpFields[name]) return annualHelpFields[name];
        if (/^closeMode_/.test(name)) return '協商遞延會扣除原來源並建立下一期同來源額度；待未休工資僅列待核定，不代表已付款。';
        if (/^agreementDate_/.test(name)) return '此筆遞延取得員工同意的日期，不得晚於結算基準日。';
        if (/^evidence_/.test(name)) return '此筆員工同意證據或文件編號；缺少依據不能遞延。';
        if (/^include_/.test(name)) return '勾選此來源納入本次結算，須展開核對金額及處理方式。';
        if (node.matches('[data-al-employee]')) return '把這位員工納入給假試算，最多 100 位；篩選不代表已選取。';
        if (label === '展開來源批次與計算明細') return '展開查看完整公式、原始分數、來源期間及異動，不會寫入額度。';
    }
    if (node.matches('[data-dm-move]')) return '將這個資訊群組向上或向下移動一個位置；確認排列並儲存後才套用。';
    if (name === 'density') return '選擇標準或緊湊高度；只調整卡片間距，保留所有資訊。';
    if (node.matches('button') && (/^reset-.+-form$/.test(action) || /^(清空|重設).*表單$/.test(label))) return '將目前表單恢復新增／初始狀態，捨棄尚未儲存的輸入；不刪除已儲存資料。';
    if (workbenchHelpLabels[label]) return workbenchHelpLabels[label];
    if (label === '選擇供餐日期') return '切換當日餐數、登記名單、截止與交單資訊。';
    if (label === '選擇假別編輯') return '載入該假別的設定，修改後按儲存才生效。';
    if (/部門$/.test(label)) return '篩選此人員選取器的部門，不自動勾選，也不移除先前已選人員。';
    if (node.matches('input,select,textarea')) {
        if (node.matches('[type="checkbox"]') && /confirm/i.test(name)) return '核對上方對象、內容及影響後才勾選；未勾選不能送出。';
        if (/filter|query|search/.test(node.id) || /搜尋|篩選/.test(label)) return '縮小目前清單的顯示範圍，不會刪除資料或自動勾選人員。';
        if (workbenchHelpFields[name]) return workbenchHelpFields[name];
        if (node.matches('[type="file"]')) return `選擇${node.accept || '頁面支援格式'}檔案。匯入先核對預覽；上傳成功後再確認清單。`;
        if (node.matches('[type="color"]') || /color|Color/.test(name)) return '設定此主題部位的顏色；先看預覽，再儲存主題。';
        if (node.matches('[type="range"]')) return `調整${label}；拖曳滑桿或使用方向鍵，觀察畫面變化。`;
        if (node.matches('[data-le-type]')) return '切換要查看／設定額度的假別；特休專屬期間說明僅在特休顯示。';
        if (node.matches('[data-meal-month],[type="month"]')) return '切換查詢月份，日期與名單將依所選月份更新。';
        if (node.title) return node.title;
        if (node.matches('[type="checkbox"]')) return `勾選以納入「${label}」；在確認及儲存前核對本次選取範圍。`;
        if (node.matches('select')) return `選擇「${label}」的適用選項。${form ? '與同表單其他條件一併確認後儲存。' : '選擇後依頁面更新顯示範圍。'}`;
        if (node.matches('[type="date"],[type="datetime-local"],[type="time"]')) return `設定「${label}」的日期／時間，確認起訖順序及實際適用期間。`;
        if (context.section === 'themes') return `調整主題的「${label}」；先核對預覽，儲存才會套用。`;
        return `填寫此頁的「${label}」。${node.required ? '此欄必填。' : '依實際情況填寫。'}${node.getAttribute('min') != null ? ` 最小值 ${node.min}。` : ''}${node.getAttribute('max') != null ? ` 最大值 ${node.max}。` : ''}`;
    }
    if (node.matches('summary')) return '展開／收合這一組詳細資料或設定；展開本身不會儲存變更。';
    const rules = [
        [/清除篩選|重設條件/, '清除目前查詢條件並恢復預設範圍，不刪除業務資料。'],
        [/解除此人全部|清除全部/, '只解除該員工的全部綁定。先看影響清單，再輸入工號確認；不是全體員工清除。'],
        [/解除/, '解除這筆指定裝置的綁定；確認視窗會列出對象，取消不會變動。'],
        [/匯出.*Excel|匯出.*填寫/, '下載額度填寫表、目前餘額與說明；填寫後匯入須先預覽再確認。'],
        [/匯出.*CSV|匯出員工/, context.section === 'people' ? '下載完整員工名冊，不受目前篩選或顯示筆數限制。' : '依目前查詢範圍與所選模板匯出 CSV；下載後核對日期、人員及欄位。'],
        [/匯出月報/, '下載所選月份的團膳月報；交單快照與目前餐數分開。'],
        [/匯入/, '選擇支援格式的檔案。額度匯入需預覽確認；員工 CSV 採合併且不刪除未列出人員。'],
        [/取消預覽|捨棄|取消編輯|取消$/, '捨棄目前尚未儲存的輸入或預覽；不刪除已儲存資料。'],
        [/重新整理|刷新/, '重新取得最新資料；有未儲存內容時先決定保留或捨棄。'],
        [/預覽額度/, '檢查額度設定並列出本次影響明細，這一步尚未寫入，需再確認儲存。'],
        [/確認儲存全部/, '依已核對預覽一次保存全部額度；資料版本已變動時須重新預覽。'],
        [/每日分配|儲存扣抵/, '保存原單的每日扣抵分配；合計須一致，不改原單號、日期與核准時數。'],
        [/交單|結單/, '核對餐數後保存新的供應商交單快照；此操作不會自動傳送訊息給供應商。'],
        [/代登|修正/, '載入該筆資料修改；核對對象、原因及變更範圍後再儲存。'],
        [/核准|駁回/, '對指定申請作審核決定。先核對申請、備註與票權；必審案件依整體進度決定是否終審完成。'],
        [/撤回/, '撤回可撤回的本人申請；成功後釋放相應待審預占。'],
        [/作廢/, '將指定申請標為作廢並記錄原因；不是另建新單。'],
        [/刪除|清空/, '移除按鈕所屬的指定資料／歷史，可能無法從畫面復原；先核對對象與確認提示。'],
        [/編輯|載入/, '把這筆設定載入編輯表單；此步尚未修改，儲存後才生效。'],
        [/啟用|停用/, '切換此筆設定是否生效，保留設定內容與既有歷史。'],
        [/試聽|播放/, '在目前瀏覽器播放音效，確認內容；不代表正式主機的揚聲器已驗證。'],
        [/讀卡|感應/, '準備接收讀卡機輸入並填入卡號；此流程不新增打卡紀錄。'],
        [/全選|選取全部/, '勾選目前允許範圍的人員；送出前仍應核對已選人數與名單。'],
        [/清除選取|取消選取/, '取消勾選，不刪除員工或既有授權。'],
        [/上一|下一|上個月|下個月/, '切換分頁或月份，不變動紀錄。'],
        [/查詢|搜尋/, '依目前條件重新取得資料；核對結果的期間與筆數。'],
        [/明細|檢視|查看/, '開啟所選人員／日期／指標的詳細資料，維持原權限範圍。'],
        [/重設密碼|更新密碼/, '更新這個功能指定的密碼；核對帳號與個人／共用密碼範圍。'],
        [/儲存|送出|新增|建立|上傳|更新/, '送出目前表單。先核對對象、必填欄、原因及確認欄；以成功訊息確認完成，失敗時依提示修正。'],
        [/關閉/, '關閉此視窗；如有未儲存設定，依提示決定是否捨棄。']
    ];
    for (const [pattern, description] of rules) if (pattern.test(label)) return description;
    if (/switch|panel|view|kind|select-date|month|tab/.test(action) || node.matches('[role="tab"]')) return '切換目前作業項目或日期；如有未儲存內容請先處理。';
    return node.title || `開啟「${label}」對應的操作；請依本頁操作流程核對對象與結果。`;
}
function workbenchControlInventory(context = workbenchHelpContext()) {
    const root = (context.root && document.querySelector(context.root)) || ui.dashboardContent.querySelector('.workspace-subnav-content') || ui.dashboardContent.querySelector('#meal-workspace') || ui.dashboardContent;
    const entries = [], seen = new Set();
    root.querySelectorAll('input:not([type="hidden"]),select,textarea,button,summary').forEach((node) => {
        if (node.closest('.wb-page-toolbar,.dm-region,.dm-dashboard,.workspace-subnav-sidebar') || node.matches('[data-action="open-workspace-summary-help"],[data-action="wb-help"],[data-wb-modal-help]')) return;
        if (node.closest('[hidden],.hidden') && !node.matches('[type="file"]')) return;
        const label = workbenchControlLabel(node); if (!label) return;
        const kind = node.matches('button,summary') ? '操作' : '欄位';
        const key = `${kind}/${label}/${node.name || node.dataset.action || ''}`;
        if (seen.has(key)) return; seen.add(key);
        const options = node.matches('select') && ['pay_mode','unit','mode','period','reviewMode','eating','serving','enabled','frequency'].includes(node.name) && node.options.length <= 12
            ? Array.from(node.options).map((o) => o.textContent.trim()).join('／') : '';
        entries.push({ label, kind, description: workbenchControlDescription(node, context), required: Boolean(node.required), disabled: Boolean(node.disabled), options });
    });
    return entries;
}
function installWorkbenchModalHelp() {
    for (const root of document.querySelectorAll('#admin-directory-dialog[open],#dashboard-metric-settings[open],#dashboard-insight-modal:not(.hidden),#annual-leave-detail-dialog[open]')) {
        if (root.querySelector('[data-wb-modal-help]')) continue;
        const header = root.querySelector('.modal-header,.ad-dialog-header,.dm-dialog-header,header') || root.firstElementChild;
        if (!header) continue;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'outline-btn'; button.dataset.wbModalHelp = ''; button.textContent = '操作說明';
        button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openWorkbenchHelp(); }); header.append(button);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(installWorkbenchModalHelp).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'class'] });
});
function openWorkbenchHelp() {
    if (!state.dashboard || document.getElementById('workbench-help-dialog')) return;
    const context = workbenchHelpContext(), [title, summary, steps, questions] = context.topic;
    const controls = workbenchControlInventory(context), dialog = document.createElement('dialog');
    dialog.id = 'workbench-help-dialog'; dialog.className = 'wb-dialog wb-help-dialog'; dialog.setAttribute('aria-labelledby', 'wb-help-title');
    dialog.innerHTML = `<header class="wb-dialog-header"><div><h2 id="wb-help-title">${escapeHtml(title)} · 操作說明</h2><p>${escapeHtml(summary)}</p></div><button type="button" class="outline-btn" data-wb-close aria-label="關閉操作說明">關閉</button></header>
        <div class="wb-dialog-body"><section><h3>操作流程</h3><ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol></section>
        <section><h3>常見問題與影響範圍</h3>${questions.map((s) => `<p>${escapeHtml(s)}</p>`).join('')}</section>
        <section><div class="wb-help-tools"><h3>本頁欄位與按鈕 <small>${controls.length} 項</small></h3><input type="search" aria-label="搜尋操作說明" placeholder="搜尋欄位或按鈕"></div><p class="helper-text">依目前子頁與權限列出操作；同類人員列按鈕合併說明。展開其他區塊後可重新開啟查看。</p>
        <dl class="wb-help-controls">${controls.map((c) => `<div data-wb-help-entry><dt><small>${c.kind}${c.required ? ' · 必填' : ''}${c.disabled ? ' · 目前停用' : ''}</small>${escapeHtml(c.label)}</dt><dd>${escapeHtml(c.description)}${c.options ? `<small>選項：${escapeHtml(c.options)}</small>` : ''}${c.disabled ? '<small>目前條件或權限不允許操作；請先核對前置選項。</small>' : ''}</dd></div>`).join('')}</dl><p class="wb-help-empty" hidden>沒有符合的欄位或按鈕。</p></section></div>`;
    dialog.querySelector('[data-wb-close]').onclick = () => dialog.close();
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') event.stopPropagation(); });
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    dialog.querySelector('input[type="search"]').oninput = (event) => {
        const query = event.target.value.trim().toLocaleLowerCase(); let count = 0;
        dialog.querySelectorAll('[data-wb-help-entry]').forEach((row) => { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); if (!row.hidden) count++; });
        dialog.querySelector('.wb-help-empty').hidden = count > 0;
    };
    document.body.append(dialog); dialog.showModal();
}
function installWorkbenchPageHelp() {
    if (!state.dashboard) return;
    document.body.dataset.workbenchRole = state.dashboard.role;
    const context = workbenchHelpContext(false);
    const root = ui.dashboardContent.querySelector('.workspace-subnav-content') || ui.dashboardContent.querySelector('#meal-workspace') || ui.dashboardContent.querySelector('.workspace-shell') || ui.dashboardContent;
    let toolbar = root.querySelector(':scope > .wb-page-toolbar');
    if (!toolbar) { toolbar = document.createElement('div'); toolbar.className = 'wb-page-toolbar'; root.prepend(toolbar); }
    toolbar.innerHTML = `<div><h3>${escapeHtml(context.topic[0])}</h3><span>依目前權限顯示可操作項目</span></div><button type="button" class="outline-btn" data-action="wb-help">操作說明</button>`;
    ui.dashboardHelpBtn?.classList.remove('hidden');
    if (ui.dashboardHelpBtn) ui.dashboardHelpBtn.textContent = '本頁說明';
    ui.dashboardContent.querySelectorAll('[data-action="open-workspace-summary-help"]').forEach((b) => b.remove());
}
const wbPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderWithPageHelp() { wbPreviousPostRender(); installWorkbenchPageHelp(); };
openDashboardHelpModal = openWorkbenchHelp;
openWorkspaceSummaryHelpModal = openWorkbenchHelp;
function closeWorkbenchDialogs() {
    document.querySelectorAll('#workbench-help-dialog,#release-notes-dialog').forEach((dialog) => { dialog.close(); dialog.remove(); });
}
const wbPreviousLogout = handleLogout;
handleLogout = async function logoutWithHelpCleanup(...args) { closeWorkbenchDialogs(); delete document.body.dataset.workbenchRole; return wbPreviousLogout(...args); };
let wbHelpIdentity = '';
const wbPreviousDashboard = renderDashboard;
renderDashboard = function dashboardWithHelpIdentity(dashboard) {
    const identity = `${state.token}/${dashboard?.role}/${dashboard?.user?.id || ''}`;
    if (identity !== wbHelpIdentity) { closeWorkbenchDialogs(); wbHelpIdentity = identity; }
    return wbPreviousDashboard(dashboard);
};
const wbPreviousClick = handleDashboardClick;
handleDashboardClick = function handleWorkbenchHelpClick(event) {
    if (event.target.closest('[data-action="wb-help"]')) { event.preventDefault(); openWorkbenchHelp(); return; }
    return wbPreviousClick(event);
};
// Independent modules repaint their own content without a dashboard render.
for (const [name, original] of [['mealPaint', typeof mealPaint === 'function' ? mealPaint : null], ['lePaint', typeof lePaint === 'function' ? lePaint : null], ['spPaint', typeof spPaint === 'function' ? spPaint : null]]) {
    if (!original) continue;
    if (name === 'mealPaint') mealPaint = function mealPaintWithHelp() { original(); installWorkbenchPageHelp(); };
    if (name === 'lePaint') lePaint = function lePaintWithHelp() { original(); installWorkbenchPageHelp(); };
    if (name === 'spPaint') spPaint = function spPaintWithHelp() { original(); installWorkbenchPageHelp(); };
}
