/**
 * 근태 기록 웹페이지 → Google Sheets 저장 및 조회
 * 
 * === 기능 ===
 * 1. 웹페이지에서 제출한 데이터를 자동으로 Google Sheets에 저장
 * 2. 소속과 이름으로 근태 기록 조회
 * 
 * === 컬럼 구조 ===
 * A: 접수일자
 * B: 소속
 * C: 직위
 * D: 성명
 * E: 근태발생일자 + 시간
 * F: 근태종료일자 + 시간
 * G: 근태구분
 * H: 근태사유
 * I: 검토상태
 * J: 검토처리일자
 * K: 승인상태
 * L: 승인처리일자
 * 
 * === 배포 방법 ===
 * 1. Google Sheets → Extensions → Apps Script
 * 2. 이 코드 전체를 붙여넣기
 * 3. Deploy → New deployment → Web app
 * 4. Execute as: "Me" / Who has access: "Anyone"
 * 5. Deploy 후 URL을 script.js의 SCRIPT_URL에 붙여넣기
 */

// ===== CONFIGURATION =====
const SHEET_GID = 1588285255; // Sheet gid (from URL: gid=1588285255)

// ===== CORS Preflight 처리 =====
function doOptions(e) {
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent('');
    return output;
}

// ===== 웹페이지 제출 및 조회 처리 =====
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        
        // 조회 요청인 경우
        if (data.action === 'lookup') {
            return lookupAttendanceRecords(data.department, data.name);
        }
        
        // 제출 요청인 경우
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const sheets = spreadsheet.getSheets();

        // Find sheet by gid
        let sheet = null;
        for (let i = 0; i < sheets.length; i++) {
            if (sheets[i].getSheetId() === SHEET_GID) {
                sheet = sheets[i];
                break;
            }
        }

        if (!sheet) {
            throw new Error(`Sheet with gid "${SHEET_GID}" not found.`);
        }

        const timestamp = new Date();
        const startDateTime = `${data.startDate} ${data.startTime}`;
        const endDateTime = `${data.endDate} ${data.endTime}`;

        // A-H 열까지 데이터 저장 (I-L은 수동 관리: 검토상태, 검토일자, 승인상태, 승인일자)
        const rowData = [
            timestamp,              // A: 접수일자
            data.department,        // B: 소속
            data.position,          // C: 직위
            data.name,              // D: 성명
            startDateTime,          // E: 근태발생일자 + 시간 + 분
            endDateTime,            // F: 근태종료일자 + 시간 + 분
            data.type,              // G: 근태구분
            data.description        // H: 근태사유
        ];

        sheet.appendRow(rowData);

        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                message: 'Data saved successfully',
                timestamp: timestamp
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function lookupAttendanceRecords(department, name) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = spreadsheet.getSheets();

    // Find sheet by gid
    let sheet = null;
    for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() === SHEET_GID) {
            sheet = sheets[i];
            break;
        }
    }

    if (!sheet) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: `Sheet with gid "${SHEET_GID}" not found.`
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();

    // 헤더 제외하고 필터링 (소속: B열=1, 성명: D열=3)
    const records = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        // 소속(B)과 성명(D)이 일치하는 경우
        if (row[1] === department && row[3] === name) {
            records.push({
                submitDate: formatDateForDisplay(row[0]),      // A: 접수일자
                department: row[1],                            // B: 소속
                position: row[2],                              // C: 직위
                name: row[3],                                  // D: 성명
                startDate: row[4] || '',                       // E: 근태발생일시
                endDate: row[5] || '',                         // F: 근태종료일시
                type: row[6] || '',                            // G: 근태구분
                description: row[7] || '',                     // H: 근태사유
                reviewStatus: row[8] || '-',                   // I: 검토상태
                reviewDate: row[9] || '',                      // J: 검토처리일자
                approvalStatus: row[10] || '-',                // K: 승인상태
                approvalDate: row[11] || ''                    // L: 승인처리일자
            });
        }
    }

    return ContentService
        .createTextOutput(JSON.stringify(records))
        .setMimeType(ContentService.MimeType.JSON);
}

// 날짜 포맷 헬퍼 함수
function formatDateForDisplay(dateValue) {
    if (!dateValue) return '';

    try {
        const date = new Date(dateValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return String(dateValue);
    }
}

// ===== TEST FUNCTION =====
function testDoPost() {
    const testData = {
        department: '생산관리팀',
        name: '홍길동',
        position: '사원',
        startDate: '2025-11-21',
        startTime: '09:00',
        endDate: '2025-11-21',
        endTime: '18:00',
        type: '잔업',
        description: '테스트 데이터입니다.'
    };

    const testEvent = {
        postData: {
            contents: JSON.stringify(testData)
        }
    };

    const result = doPost(testEvent);
    Logger.log(result.getContent());
}

function testDoGet() {
    const testEvent = {
        parameter: {
            action: 'lookup',
            department: '생산관리팀',
            name: '홍길동'
        }
    };

    const result = doGet(testEvent);
    Logger.log(result.getContent());
}
