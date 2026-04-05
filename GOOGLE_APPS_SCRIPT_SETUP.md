# Google Apps Script for Savia Escolar

Follow these steps to set up the Google Sheets integration:

1. Go to [script.google.com](https://script.google.com) and create a new project.
2. Replace the default code with the following:

```javascript
function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var action = params.action;
  
  if (action === 'createSpreadsheet') {
    var ss = SpreadsheetApp.create('Reporte Savia: ' + params.eventName);
    var sheet = ss.getSheets()[0];
    sheet.setName('Recaudación');
    
    // Set headers
    var headers = ['Estudiante', 'Grado'];
    for (var i = 1; i <= params.installments; i++) {
      headers.push('Cuota ' + i);
    }
    headers.push('Progreso %');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#2d4a2d').setFontColor('#ffffff');
    
    // Make it public (view only)
    var file = DriveApp.getFileById(ss.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return ContentService.createTextOutput(JSON.stringify({
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'syncData') {
    var ss = SpreadsheetApp.openById(params.spreadsheetId);
    var sheet = ss.getSheets()[0];
    
    // Clear existing data (except headers)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    
    // Set new data
    if (params.data && params.data.length > 0) {
      sheet.getRange(2, 1, params.data.length, params.data[0].length).setValues(params.data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Click **Deploy** > **New Deployment**.
4. Select **Web App**.
5. Set **Execute as** to `Me`.
6. Set **Who has access** to `Anyone`.
7. Click **Deploy** and copy the **Web App URL**.
8. Add this URL to your `.env` file as `VITE_GAS_WEBAPP_URL`.
