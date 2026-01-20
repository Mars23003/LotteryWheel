function doGet(e) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = spreadsheet.getSheets();
  const allQuestions = [];

  // 1. 遍歷每一個工作表 (Sheet)
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    
    // 跳過一些可能是設定或是說明的工作表 (看需求，這裡先假設所有 Sheet 都是題庫)
    // if (sheetName === "Config") return; 

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return; // 沒有資料或只有標題

    const headers = rows[0];
    
    // 2. 轉換每一列
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const obj = {};
      
      // 3. 對應標題
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }

      // 4. 強制將「工作表名稱」設為「科目 (subject)」
      // 這樣使用者在 Sheet 分頁命名 "數學", "英文" 時，就會自動分類
      obj['subject'] = sheetName;
      
      allQuestions.push(obj);
    }
  });

  // 5. 回傳整合後的 JSON
  return ContentService.createTextOutput(JSON.stringify(allQuestions))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSampleSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 建立 "數學" 分頁
  let sheetMath = ss.getSheetByName("數學");
  if (!sheetMath) sheetMath = ss.insertSheet("數學");
  sheetMath.clear();
  
  // 建立 "英文" 分頁
  let sheetEng = ss.getSheetByName("英文");
  if (!sheetEng) sheetEng = ss.insertSheet("英文");
  sheetEng.clear();

  const headers = ["id", "grade", "chapter", "type", "stem", "A", "B", "C", "D", "E", "answer", "explain", "difficulty", "tags", "group_id", "passage"];
  
  // 數學資料 (注意：這裡不包含 subject 欄位，因為會自動用 Sheet 名稱)
  sheetMath.appendRow(headers);
  sheetMath.appendRow(["M001", "高一", "數列", "single", "1+2+3=?", "5", "6", "7", "8", "", "B", "簡單加法", "易", "", "", ""]);

  // 英文資料
  sheetEng.appendRow(headers);
  sheetEng.appendRow(["E001", "高一", "單字", "single", "Apple 中文是?", "蘋果", "香蕉", "橘子", "芭樂", "", "A", "Basic word", "易", "", "", ""]);
}
