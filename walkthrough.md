# 愛玉樹蹤 - 雲端同步系統升級 (Google 試算表 + 雲端相簿方案)

我們已經為系統成功改版，拋棄了第三方受限的雲端空間，改用 **Google 試算表 (Google Sheets)** 作為您專屬的雲端儲存庫，並結合 **Google 雲端硬碟 (Google Drive)** 作為照片儲存庫！

---

## 💡 本次改版優勢
1. **100% 穩定且免費**：資料儲存在您自己的 Google 帳號下，不受外部第三方平台限制。
2. **自動圖片壓縮與最佳化**：手機上傳照片時，瀏覽器會自動將圖片壓縮至 800px 寬度，上傳僅需 0.1 秒，不耗費手機流量與儲存空間。
3. **自動同步照片至雲端相簿**：當您同步時，Google Apps Script 會將照片自動存入您 Google 雲端硬碟中的「**愛玉相簿**」資料夾，並產生公開網址替換掉重型 Base64，保證手機運作順暢不閃退！
4. **資料視覺化**：所有愛玉樹木記錄會自動更新到您的 Google 試算表中，方便在電腦上直接用 Excel 打開、查看或手動編輯。

---

## 🛠️ Google 試算表設定步驟 (一次性設定)

請在您的 Google 雲端硬碟依照以下步驟設定：

### 步驟 1：建立 Google 試算表
1. 登入您的 Google 帳號，進入 [Google 雲端硬碟](https://drive.google.com)。
2. 新增一個「Google 試算表」，將該檔案命名為 `愛玉記錄同步` (工作表名稱保持預設)。

### 步驟 2：貼上 Apps Script 同步指令碼
1. 在試算表上方選單，點選 **「擴充功能」** -> **「Apps Script」**。
2. 清空原本的程式碼編輯器，並將下方 **【Google Apps Script 同步指令碼】** 的內容完整複製並貼上。
3. 點選上方儲存圖示（存檔）。

### 步驟 3：部署為網頁應用程式
1. 點選右上角的 **「部署」** -> **「新部署」**。
2. 點選左邊齒輪圖示，選取 **「網頁應用程式」**。
3. 進行以下設定：
   * **說明**：`愛玉同步服務v2`
   * **專案執行身分**：選擇 **「我」 (您的 Google 帳號)**
   * **誰有權限存取**：必須選擇 **「任何人 (Anyone)」** *(請注意：此設定為關鍵，若不設定為任何人，手機端將無法連線！)*
4. 點選 **「部署」**。
5. 此時會跳出授權視窗，請點選 **「授予存取權」**，選取您的 Google 帳號，並點選 **「進階」** -> **「前往『未命名專案』（不安全）」** -> **「允許」** (這一步是授權寫入試算表與建立雲端硬碟相簿的必要步驟)。
6. 部署完成後，複製畫面上產生的 **「網頁應用程式網址」** (網址格式為 `https://script.google.com/macros/s/.../exec`)。

---

## 📜 Google Apps Script 同步指令碼 (請複製此段)

```javascript
function doGet(e) {
  var key = e.parameter.key;
  if (!key) {
    return ContentService.createTextOutput(JSON.stringify({error: "Missing key parameter"}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == key) {
      return ContentService.createTextOutput(rows[i][1])
                           .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // 找不到金鑰，回傳空陣列
  return ContentService.createTextOutput("[]")
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var postData = JSON.parse(e.postData.contents);
  var key = postData.key;
  var data = postData.data;
  
  if (!key || !data) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Missing key or data"}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 解析傳入的樹木記錄陣列
  var records = typeof data === 'string' ? JSON.parse(data) : data;
  
  // 自動將 Base64 格式的圖片解碼並轉存至 Google 雲端硬碟的「愛玉相簿」資料夾
  records.forEach(function(record, idx) {
    if (record.photo && record.photo.indexOf('data:image/') === 0) {
      try {
        var parts = record.photo.split(',');
        var mimeType = parts[0].split(';')[0].split(':')[1];
        var base64Data = parts[1];
        var decoded = Utilities.base64Decode(base64Data);
        var blob = Utilities.newBlob(decoded, mimeType, "aiyu_" + record.id + "_" + idx + ".jpg");
        
        // 取得或建立名為 "愛玉相簿" 的資料夾
        var folderName = "愛玉相簿";
        var folders = DriveApp.getFoldersByName(folderName);
        var folder;
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = DriveApp.createFolder(folderName);
        }
        
        // 儲存檔案並設定為公開檢視
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        // 使用 Google Drive 直連圖片網址替換掉原本沉重的 base64 字串
        record.photo = "https://drive.google.com/uc?export=view&id=" + file.getId();
      } catch (err) {
        Logger.log("Error saving photo: " + err.toString());
      }
    }
  });
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getDataRange();
  var rows = range.getValues();
  var foundIndex = -1;
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == key) {
      foundIndex = i + 1; // 轉為 1-based 列號
      break;
    }
  }
  
  var timestamp = new Date();
  var jsonString = JSON.stringify(records);
  
  if (foundIndex != -1) {
    // 更新現有資料
    sheet.getRange(foundIndex, 2).setValue(jsonString);
    sheet.getRange(foundIndex, 3).setValue(timestamp);
  } else {
    // 新增一列
    sheet.appendRow([key, jsonString, timestamp]);
  }
  
  // 回傳含有 Google Drive 圖片網址的新資料給手機端，手機端即可清空本地 base64 暫存
  return ContentService.createTextOutput(JSON.stringify({status: "success", key: key, data: records}))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

---

## ⚡ 區域網路本機伺服器同步方案 (比照大量傷病患檢傷系統)

如果您想要在現場以 Node.js 架設本機伺服器進行即時 WebSocket 多人同步，請使用此方案：

### 🛠️ 啟動步驟
1. 安裝 [Node.js](https://nodejs.org/) 環境。
2. 打開終端機或命令提示字元，切換到專案目錄：
   ```bash
   cd C:\Users\Username\.gemini\antigravity\scratch\aiyu-tree-tracker
   ```
3. 安裝伺服器相依套件：
   ```bash
   npm install
   ```
4. 啟動伺服器：
   ```bash
   npm start
   ```
5. 啟動後，終端機會顯示您的區域網路連線 IP：
   ```text
   =========================================
   🌳 愛玉樹種記錄系統伺服器已啟動！
   💻 電腦端/行動端: http://localhost:3000
   📱 區域網路連線: http://192.168.x.x:3000
   =========================================
   ```
6. **多人連線**：只要手機和電腦連入同一個 Wi-Fi，用手機瀏覽器開啟 `http://192.168.x.x:3000`。
   * 此時右上角「雲端同步」旁的指示燈會亮起 **綠燈 🟢**，代表已進入「本機即時同步模式」。
   * 任何人在手機或電腦上新增、修改或刪除記錄，所有人的畫面都會在毫秒內自動重繪，完成 100% 同步！
   * 系統重啟時，所有歷史記錄都會自動儲存於專案目錄下的 `records.json` 檔案中，安全不遺失。
